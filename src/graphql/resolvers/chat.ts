import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { encrypt, decrypt } from "../../utils/crypto.js";

interface MessageRow {
  id: number;
  text: string;
  sender_id: number;
  receiver_id: number;
  read: number;
  created_at: string;
}

interface PermissionRow {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const stmts = {
  allUsers: db.prepare("SELECT * FROM app_users ORDER BY id"),
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),

  conversation: db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?)
       OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `),
  insertMessage: db.prepare(
    "INSERT INTO messages (text, sender_id, receiver_id) VALUES (?, ?, ?)"
  ),
  messageById: db.prepare("SELECT * FROM messages WHERE id = ?"),
  markAsRead: db.prepare("UPDATE messages SET read = 1 WHERE id = ?"),
  updateLastSeen: db.prepare("UPDATE app_users SET last_seen = datetime('now') WHERE id = ?"),

  permissionBetween: db.prepare(`
    SELECT * FROM chat_permissions
    WHERE (sender_id = ? AND receiver_id = ?)
       OR (sender_id = ? AND receiver_id = ?)
    LIMIT 1
  `),
  insertPermission: db.prepare(
    "INSERT INTO chat_permissions (sender_id, receiver_id, status) VALUES (?, ?, ?)"
  ),
  updatePermissionStatus: db.prepare(
    "UPDATE chat_permissions SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  permissionById: db.prepare("SELECT * FROM chat_permissions WHERE id = ?"),
  pendingReceived: db.prepare(
    "SELECT * FROM chat_permissions WHERE receiver_id = ? AND status = 'pending'"
  ),

  lastMessageFrom: db.prepare(`
    SELECT * FROM messages WHERE sender_id = ? AND receiver_id = ?
    ORDER BY created_at DESC LIMIT 1
  `),
  lastMessageTo: db.prepare(`
    SELECT * FROM messages WHERE sender_id = ? AND receiver_id = ?
    ORDER BY created_at DESC LIMIT 1
  `),
  unreadCount: db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE sender_id = ? AND receiver_id = ? AND read = 0
  `),
};

function decryptMessage(msg: MessageRow): MessageRow {
  return { ...msg, text: decrypt(msg.text) };
}

const typingStore = new Map<string, ReturnType<typeof setTimeout>>();

export default {
  Query: {
    conversation: (_: unknown, { userId1, userId2 }: { userId1: string; userId2: string }, { user }: Context): MessageRow[] => {
      if (!user) throw new Error("Non authentifié");
      const uid = user.id;
      if (uid !== Number(userId1) && uid !== Number(userId2)) {
        throw new Error("Accès refusé — tu ne peux lire que tes propres conversations.");
      }
      const perm = stmts.permissionBetween.get(userId1, userId2, userId2, userId1) as PermissionRow | undefined;
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez être connecté pour lire cette conversation.");
      }
      return (stmts.conversation.all(userId1, userId2, userId2, userId1) as MessageRow[]).map(decryptMessage);
    },

    chatPermission: (_: unknown, { userId1, userId2 }: { userId1: string; userId2: string }, { user }: Context): PermissionRow | null => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId1) && user.id !== Number(userId2)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres permissions.");
      }
      return (stmts.permissionBetween.get(userId1, userId2, userId2, userId1) as PermissionRow) || null;
    },

    pendingRequests: (_: unknown, { userId }: { userId: string }, { user }: Context): PermissionRow[] => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé.");
      }
      return stmts.pendingReceived.all(userId) as PermissionRow[];
    },

    conversationPreviews: (_: unknown, { userId }: { userId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres conversations.");
      }
      const others = (stmts.allUsers.all() as AppUser[]).filter((u) => u.id !== Number(userId));
      return others.map((other) => {
        const fromOther = stmts.lastMessageFrom.get(other.id, userId) as MessageRow | undefined;
        const fromMe = stmts.lastMessageTo.get(userId, other.id) as MessageRow | undefined;
        let lastMessage: MessageRow | null = null;
        if (fromOther && fromMe) {
          lastMessage = fromOther.created_at > fromMe.created_at ? fromOther : fromMe;
        } else {
          lastMessage = fromOther || fromMe || null;
        }
        if (lastMessage) lastMessage = decryptMessage(lastMessage);
        const unread = stmts.unreadCount.get(other.id, userId) as { count: number };
        return { user: other, lastMessage, unreadCount: unread.count };
      });
    },
  },

  Mutation: {
    sendMessage: (_: unknown, { text, receiverId }: { text: string; receiverId: string }, { user }: Context): MessageRow => {
      if (!user) throw new Error("Non authentifié");
      const receiver = stmts.userById.get(receiverId) as AppUser | undefined;
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      if (user.id === Number(receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const perm = stmts.permissionBetween.get(user.id, receiverId, receiverId, user.id) as PermissionRow | undefined;
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez d'abord obtenir l'autorisation.");
      }
      const encrypted = encrypt(text);
      const result = stmts.insertMessage.run(encrypted, user.id, receiverId);
      const newMessage = stmts.messageById.get(result.lastInsertRowid) as MessageRow;
      const decrypted = decryptMessage(newMessage);
      pubsub.publish(EVENTS.MESSAGE_SENT, { messageSent: decrypted });
      pubsub.publish(EVENTS.MESSAGE_SENT_TO_USER, { messageSentToUser: decrypted });
      return decrypted;
    },

    markAsRead: (_: unknown, { messageIds }: { messageIds: string[] }, { user }: Context): boolean => {
      if (!user) throw new Error("Non authentifié");
      const update = db.prepare("UPDATE messages SET read = 1 WHERE id = ? AND receiver_id = ?");
      const batch = db.transaction((ids: string[]) => { for (const id of ids) update.run(id, user.id); });
      batch(messageIds);
      for (const id of messageIds) {
        const msg = stmts.messageById.get(id) as MessageRow | undefined;
        if (msg && msg.receiver_id === user.id) {
          pubsub.publish(EVENTS.MESSAGE_READ, {
            messageRead: { messageId: String(id), senderId: msg.sender_id, receiverId: msg.receiver_id },
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

    requestChat: (_: unknown, { receiverId }: { receiverId: string }, { user }: Context): PermissionRow => {
      if (!user) throw new Error("Non authentifié");
      if (user.id === Number(receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const receiver = stmts.userById.get(receiverId) as AppUser | undefined;
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      const existing = stmts.permissionBetween.get(user.id, receiverId, receiverId, user.id) as PermissionRow | undefined;
      if (existing) {
        if (existing.status === "accepted") throw new Error("Vous êtes déjà connecté.");
        if (existing.status === "pending") throw new Error("La demande est déjà en attente.");
        stmts.updatePermissionStatus.run("pending", existing.id);
        const updated = stmts.permissionById.get(existing.id) as PermissionRow;
        pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
        return updated;
      }
      const result = stmts.insertPermission.run(user.id, receiverId, "pending");
      const perm = stmts.permissionById.get(result.lastInsertRowid) as PermissionRow;
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: perm });
      return perm;
    },

    acceptChat: (_: unknown, { permissionId }: { permissionId: string }, { user }: Context): PermissionRow => {
      if (!user) throw new Error("Non authentifié");
      const perm = stmts.permissionById.get(permissionId) as PermissionRow | undefined;
      if (!perm) throw new Error("Demande introuvable.");
      if (perm.status !== "pending") throw new Error("Cette demande n'est plus en attente.");
      if (perm.receiver_id !== user.id) {
        throw new Error("Accès refusé — tu ne peux accepter que les demandes qui te sont adressées.");
      }
      stmts.updatePermissionStatus.run("accepted", permissionId);
      const updated = stmts.permissionById.get(permissionId) as PermissionRow;
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    rejectChat: (_: unknown, { permissionId }: { permissionId: string }, { user }: Context): PermissionRow => {
      if (!user) throw new Error("Non authentifié");
      const perm = stmts.permissionById.get(permissionId) as PermissionRow | undefined;
      if (!perm) throw new Error("Demande introuvable.");
      if (perm.receiver_id !== user.id) {
        throw new Error("Accès refusé — tu ne peux rejeter que les demandes qui te sont adressées.");
      }
      stmts.updatePermissionStatus.run("rejected", permissionId);
      const updated = stmts.permissionById.get(permissionId) as PermissionRow;
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    updateLastSeen: (_: unknown, __: unknown, { user }: Context): boolean => {
      if (!user) throw new Error("Non authentifié");
      stmts.updateLastSeen.run(user.id);
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
    sender: (parent: MessageRow) => stmts.userById.get(parent.sender_id),
    receiver: (parent: MessageRow) => stmts.userById.get(parent.receiver_id),
    createdAt: (parent: MessageRow) => parent.created_at,
  },

  ChatPermission: {
    sender: (parent: PermissionRow) => stmts.userById.get(parent.sender_id),
    receiver: (parent: PermissionRow) => stmts.userById.get(parent.receiver_id),
    createdAt: (parent: PermissionRow) => parent.created_at,
    updatedAt: (parent: PermissionRow) => parent.updated_at,
  },

  ConversationPreview: {
    user: (parent: any) => parent.user,
    lastMessage: (parent: any) => parent.lastMessage || null,
    unreadCount: (parent: any) => parent.unreadCount,
  },
};
