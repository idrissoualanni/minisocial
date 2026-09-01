import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, messages, chatPermissions } from "../../db/schema.js";
import { eq, or, and, desc, inArray, sql } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { validate, SendMessageSchema } from "../../utils/validation.js";
import { isoDate } from "../serialize.js";

function decryptMessage(msg: any) {
  return { ...msg, text: decrypt(msg.text) };
}

const typingStore = new Map<string, ReturnType<typeof setTimeout>>();

export default {
  Query: {
    conversation: async (
      _: unknown,
      { userId1, userId2 }: { userId1: string; userId2: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const uid = user.id;
      if (uid !== Number(userId1) && uid !== Number(userId2)) {
        throw new Error("Accès refusé — tu ne peux lire que tes propres conversations.");
      }
      const perm = await db
        .select()
        .from(chatPermissions)
        .where(
          or(
            and(eq(chatPermissions.senderId, Number(userId1)), eq(chatPermissions.receiverId, Number(userId2))),
            and(eq(chatPermissions.senderId, Number(userId2)), eq(chatPermissions.receiverId, Number(userId1)))
          )
        )
        .limit(1)
        .then((r) => r[0]);
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez être connecté pour lire cette conversation.");
      }
      const rows = await db
        .select()
        .from(messages)
        .where(
          or(
            and(eq(messages.senderId, Number(userId1)), eq(messages.receiverId, Number(userId2))),
            and(eq(messages.senderId, Number(userId2)), eq(messages.receiverId, Number(userId1)))
          )
        )
        .orderBy(messages.createdAt);
      return rows.map(decryptMessage);
    },

    chatPermission: async (
      _: unknown,
      { userId1, userId2 }: { userId1: string; userId2: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId1) && user.id !== Number(userId2)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres permissions.");
      }
      const result = await db
        .select()
        .from(chatPermissions)
        .where(
          or(
            and(eq(chatPermissions.senderId, Number(userId1)), eq(chatPermissions.receiverId, Number(userId2))),
            and(eq(chatPermissions.senderId, Number(userId2)), eq(chatPermissions.receiverId, Number(userId1)))
          )
        )
        .limit(1)
        .then((r) => r[0]);
      return result || null;
    },

    pendingRequests: async (
      _: unknown,
      { userId }: { userId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé.");
      }
      return await db
        .select()
        .from(chatPermissions)
        .where(
          and(eq(chatPermissions.receiverId, Number(userId)), eq(chatPermissions.status, "pending"))
        );
    },

    // Optimisé : 3 requêtes au total (tous les users, tous les non-lus,
    // dernier message par partenaire via DISTINCT ON) au lieu de 3×N requêtes.
    conversationPreviews: async (_: unknown, { userId }: { userId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres conversations.");
      }
      const uid = Number(userId);

      // 1) Tous les autres utilisateurs
      const allUsers = await db.select().from(appUsers).orderBy(appUsers.id);

      // 2) Non-lus groupés par expéditeur : 1 requête
      const unreadRows = await db
        .select({ senderId: messages.senderId, n: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.receiverId, uid), eq(messages.read, 0)))
        .groupBy(messages.senderId);
      const unreadBySender = new Map(unreadRows.map((r) => [r.senderId, Number(r.n)]));

      // 3) Dernier message par partenaire : 1 requête (DISTINCT ON)
      const lastMsgResult = await db.execute(sql`
        SELECT DISTINCT ON (partner) id, text, sender_id, receiver_id, read, created_at, partner
        FROM (
          SELECT m.id, m.text, m.sender_id, m.receiver_id, m.read, m.created_at,
            CASE WHEN m.sender_id = ${uid} THEN m.receiver_id ELSE m.sender_id END AS partner
          FROM messages m
          WHERE m.sender_id = ${uid} OR m.receiver_id = ${uid}
        ) sub
        ORDER BY partner, created_at DESC
      `);
      const lastMsgRows = (lastMsgResult as any).rows ?? (lastMsgResult as any);
      const lastByPartner = new Map<number, any>();
      for (const row of lastMsgRows as any[]) {
        lastByPartner.set(Number(row.partner), row);
      }

      return allUsers
        .filter((u) => u.id !== uid)
        .map((other) => {
          const raw = lastByPartner.get(other.id) || null;
          const lastMessage = raw
            ? decryptMessage({
                id: raw.id,
                text: raw.text,
                senderId: Number(raw.sender_id),
                receiverId: Number(raw.receiver_id),
                read: raw.read,
                createdAt: isoDate(raw.created_at),
              })
            : null;
          return {
            user: other,
            lastMessage,
            unreadCount: unreadBySender.get(other.id) ?? 0,
          };
        });
    },
  },

  Mutation: {
    sendMessage: async (
      _: unknown,
      { text, receiverId }: { text: string; receiverId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const data = validate(SendMessageSchema, { text, receiverId });
      const receiver = await db.select().from(appUsers).where(eq(appUsers.id, Number(data.receiverId))).then((r) => r[0]);
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      if (user.id === Number(data.receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const perm = await db
        .select()
        .from(chatPermissions)
        .where(
          or(
            and(eq(chatPermissions.senderId, user.id), eq(chatPermissions.receiverId, Number(data.receiverId))),
            and(eq(chatPermissions.senderId, Number(data.receiverId)), eq(chatPermissions.receiverId, user.id))
          )
        )
        .limit(1)
        .then((r) => r[0]);
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez d'abord obtenir l'autorisation.");
      }
      const encrypted = encrypt(data.text);
      const [newMessage] = await db
        .insert(messages)
        .values({
          text: encrypted,
          senderId: user.id,
          receiverId: Number(data.receiverId),
        })
        .returning();
      const decrypted = decryptMessage(newMessage);
      pubsub.publish(EVENTS.MESSAGE_SENT, { messageSent: decrypted });
      pubsub.publish(EVENTS.MESSAGE_SENT_TO_USER, { messageSentToUser: decrypted });
      return decrypted;
    },

    // Batché : 1 UPDATE ... WHERE id IN (...) RETURNING au lieu de
    // 2 requêtes (update + select) par message.
    markAsRead: async (_: unknown, { messageIds }: { messageIds: string[] }, { user }: Context): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      const ids = messageIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));
      if (ids.length === 0) return true;
      const updated = await db
        .update(messages)
        .set({ read: 1 })
        .where(and(inArray(messages.id, ids), eq(messages.receiverId, user.id)))
        .returning();
      for (const msg of updated) {
        pubsub.publish(EVENTS.MESSAGE_READ, {
          messageRead: { messageId: String(msg.id), senderId: msg.senderId, receiverId: msg.receiverId },
        });
      }
      return true;
    },

    setTyping: (_: unknown, { receiverId, isTyping }: { receiverId: string; isTyping: boolean }, { user }: Context): boolean => {
      if (!user) throw new Error("Non authentifié");
      const key = `${user.id}:${receiverId}`;
      if (isTyping) {
        if (typingStore.has(key)) clearTimeout(typingStore.get(key)!);
        const timeout = setTimeout(() => {
          typingStore.delete(key);
          pubsub.publish(EVENTS.USER_TYPING, {
            userTyping: { userId: String(user.id), isTyping: false },
          });
        }, 3000);
        typingStore.set(key, timeout);
      } else {
        if (typingStore.has(key)) clearTimeout(typingStore.get(key)!);
        typingStore.delete(key);
      }
      pubsub.publish(EVENTS.USER_TYPING, {
        userTyping: { userId: String(user.id), isTyping },
      });
      return true;
    },

    requestChat: async (
      _: unknown,
      { receiverId }: { receiverId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id === Number(receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const receiver = await db.select().from(appUsers).where(eq(appUsers.id, Number(receiverId))).then((r) => r[0]);
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      const existing = await db
        .select()
        .from(chatPermissions)
        .where(
          or(
            and(eq(chatPermissions.senderId, user.id), eq(chatPermissions.receiverId, Number(receiverId))),
            and(eq(chatPermissions.senderId, Number(receiverId)), eq(chatPermissions.receiverId, user.id))
          )
        )
        .limit(1)
        .then((r) => r[0]);
      if (existing) {
        if (existing.status === "accepted") throw new Error("Vous êtes déjà connecté.");
        if (existing.status === "pending") throw new Error("La demande est déjà en attente.");
        await db
          .update(chatPermissions)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(chatPermissions.id, existing.id));
        const updated = await db.select().from(chatPermissions).where(eq(chatPermissions.id, existing.id)).then((r) => r[0]);
        pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
        return updated;
      }
      const [perm] = await db
        .insert(chatPermissions)
        .values({
          senderId: user.id,
          receiverId: Number(receiverId),
          status: "pending",
        })
        .returning();
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: perm });
      return perm;
    },

    acceptChat: async (
      _: unknown,
      { permissionId }: { permissionId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const perm = await db.select().from(chatPermissions).where(eq(chatPermissions.id, Number(permissionId))).then((r) => r[0]);
      if (!perm) throw new Error("Demande introuvable.");
      if (perm.status !== "pending") throw new Error("Cette demande n'est plus en attente.");
      if (perm.receiverId !== user.id) {
        throw new Error("Accès refusé — tu ne peux accepter que les demandes qui te sont adressées.");
      }
      await db
        .update(chatPermissions)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(chatPermissions.id, Number(permissionId)));
      const updated = await db.select().from(chatPermissions).where(eq(chatPermissions.id, Number(permissionId))).then((r) => r[0]);
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    rejectChat: async (
      _: unknown,
      { permissionId }: { permissionId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const perm = await db.select().from(chatPermissions).where(eq(chatPermissions.id, Number(permissionId))).then((r) => r[0]);
      if (!perm) throw new Error("Demande introuvable.");
      if (perm.receiverId !== user.id) {
        throw new Error("Accès refusé — tu ne peux rejeter que les demandes qui te sont adressées.");
      }
      await db
        .update(chatPermissions)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(chatPermissions.id, Number(permissionId)));
      const updated = await db.select().from(chatPermissions).where(eq(chatPermissions.id, Number(permissionId))).then((r) => r[0]);
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    updateLastSeen: async (_: unknown, __: unknown, { user }: Context): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      await db.update(appUsers).set({ lastSeen: new Date() }).where(eq(appUsers.id, user.id));
      return true;
    },
  },

  Subscription: {
    // Filtres corrigés : Drizzle renvoie senderId/receiverId (camelCase).
    // L'ancien code comparait sender_id/receiver_id (snake_case) qui
    // n'existaient pas → undefined → aucune livraison temps réel.
    messageSent: {
      subscribe: (_: unknown, { userId1, userId2 }: { userId1: string; userId2: string }) => {
        const ids = new Set([String(userId1), String(userId2)]);
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MESSAGE_SENT]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              const msg = event.messageSent;
              if (ids.has(String(msg.senderId)) && ids.has(String(msg.receiverId))) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.messageSent,
    },
    messageSentToUser: {
      subscribe: (_: unknown, { userId }: { userId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MESSAGE_SENT_TO_USER]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              const msg = event.messageSentToUser;
              if (String(msg.receiverId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.messageSentToUser,
    },
    chatPermissionUpdated: {
      subscribe: (_: unknown, { userId }: { userId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.CHAT_PERMISSION_UPDATED]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              const perm = event.chatPermissionUpdated;
              if (String(perm.senderId) === String(userId) || String(perm.receiverId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.chatPermissionUpdated,
    },
    messageRead: {
      subscribe: (_: unknown, { userId }: { userId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MESSAGE_READ]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              const { senderId, receiverId } = event.messageRead;
              if (String(senderId) === String(userId) || String(receiverId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.messageRead,
    },
    userTyping: {
      subscribe: (_: unknown, { userId1, userId2 }: { userId1: string; userId2: string }) => {
        const ids = new Set([String(userId1), String(userId2)]);
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.USER_TYPING]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              if (ids.has(String(event.userTyping.userId))) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.userTyping,
    },
  },

  Message: {
    sender: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.userById.load(parent.senderId);
    },
    receiver: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.userById.load(parent.receiverId);
    },
    createdAt: (parent: any) => isoDate(parent.createdAt),
  },

  ChatPermission: {
    sender: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.userById.load(parent.senderId);
    },
    receiver: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.userById.load(parent.receiverId);
    },
    createdAt: (parent: any) => isoDate(parent.createdAt),
    updatedAt: (parent: any) => isoDate(parent.updatedAt),
  },

  ConversationPreview: {
    user: (parent: any) => parent.user,
    lastMessage: (parent: any) => parent.lastMessage || null,
    unreadCount: (parent: any) => parent.unreadCount,
  },
};
