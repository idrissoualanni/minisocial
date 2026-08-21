import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, messages, chatPermissions } from "../../db/schema.js";
import { eq, or, and, desc, count as drizzleCount, sql } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";
import { encrypt, decrypt } from "../../utils/crypto.js";

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

    conversationPreviews: async (_: unknown, { userId }: { userId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres conversations.");
      }
      const allUsers = await db.select().from(appUsers).orderBy(appUsers.id);
      const others = allUsers.filter((u) => u.id !== Number(userId));

      const previews = await Promise.all(
        others.map(async (other) => {
          const fromOther = await db
            .select()
            .from(messages)
            .where(and(eq(messages.senderId, other.id), eq(messages.receiverId, Number(userId))))
            .orderBy(desc(messages.createdAt))
            .limit(1)
            .then((r) => r[0]);

          const fromMe = await db
            .select()
            .from(messages)
            .where(and(eq(messages.senderId, Number(userId)), eq(messages.receiverId, other.id)))
            .orderBy(desc(messages.createdAt))
            .limit(1)
            .then((r) => r[0]);

          let lastMessage: any = null;
          if (fromOther && fromMe) {
            const otherTime = fromOther.createdAt instanceof Date ? fromOther.createdAt.getTime() : new Date(fromOther.createdAt as any).getTime();
            const meTime = fromMe.createdAt instanceof Date ? fromMe.createdAt.getTime() : new Date(fromMe.createdAt as any).getTime();
            lastMessage = otherTime > meTime ? fromOther : fromMe;
          } else {
            lastMessage = fromOther || fromMe || null;
          }
          if (lastMessage) lastMessage = decryptMessage(lastMessage);

          const unreadResult = await db
            .select({ count: drizzleCount() })
            .from(messages)
            .where(
              and(
                eq(messages.senderId, other.id),
                eq(messages.receiverId, Number(userId)),
                eq(messages.read, 0)
              )
            )
            .then((r) => r[0]);

          return { user: other, lastMessage, unreadCount: Number(unreadResult.count) };
        })
      );

      return previews;
    },
  },

  Mutation: {
    sendMessage: async (
      _: unknown,
      { text, receiverId }: { text: string; receiverId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const receiver = await db.select().from(appUsers).where(eq(appUsers.id, Number(receiverId))).then((r) => r[0]);
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      if (user.id === Number(receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const perm = await db
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
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez d'abord obtenir l'autorisation.");
      }
      const encrypted = encrypt(text);
      const [newMessage] = await db
        .insert(messages)
        .values({
          text: encrypted,
          senderId: user.id,
          receiverId: Number(receiverId),
        })
        .returning();
      const decrypted = decryptMessage(newMessage);
      pubsub.publish(EVENTS.MESSAGE_SENT, { messageSent: decrypted });
      pubsub.publish(EVENTS.MESSAGE_SENT_TO_USER, { messageSentToUser: decrypted });
      return decrypted;
    },

    markAsRead: async (_: unknown, { messageIds }: { messageIds: string[] }, { user }: Context): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      await db.transaction(async (tx) => {
        for (const id of messageIds) {
          await tx
            .update(messages)
            .set({ read: 1 })
            .where(and(eq(messages.id, Number(id)), eq(messages.receiverId, user.id)));
        }
      });
      for (const id of messageIds) {
        const msg = await db.select().from(messages).where(eq(messages.id, Number(id))).then((r) => r[0]);
        if (msg && msg.receiverId === user.id) {
          pubsub.publish(EVENTS.MESSAGE_READ, {
            messageRead: { messageId: String(id), senderId: msg.senderId, receiverId: msg.receiverId },
          });
        }
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
    messageSent: {
      subscribe: (_: unknown, { userId1, userId2 }: { userId1: string; userId2: string }) => {
        const ids = new Set([String(userId1), String(userId2)]);
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MESSAGE_SENT]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              const msg = event.messageSent;
              if (ids.has(String(msg.sender_id)) && ids.has(String(msg.receiver_id))) yield event;
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
              if (String(msg.receiver_id) === String(userId)) yield event;
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
              if (String(perm.sender_id) === String(userId) || String(perm.receiver_id) === String(userId)) yield event;
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
    sender: async (parent: any) => {
      return await db.select().from(appUsers).where(eq(appUsers.id, parent.senderId)).then((r) => r[0]);
    },
    receiver: async (parent: any) => {
      return await db.select().from(appUsers).where(eq(appUsers.id, parent.receiverId)).then((r) => r[0]);
    },
    createdAt: (parent: any) => parent.createdAt,
  },

  ChatPermission: {
    sender: async (parent: any) => {
      return await db.select().from(appUsers).where(eq(appUsers.id, parent.senderId)).then((r) => r[0]);
    },
    receiver: async (parent: any) => {
      return await db.select().from(appUsers).where(eq(appUsers.id, parent.receiverId)).then((r) => r[0]);
    },
    createdAt: (parent: any) => parent.createdAt,
    updatedAt: (parent: any) => parent.updatedAt,
  },

  ConversationPreview: {
    user: (parent: any) => parent.user,
    lastMessage: (parent: any) => parent.lastMessage || null,
    unreadCount: (parent: any) => parent.unreadCount,
  },
};
