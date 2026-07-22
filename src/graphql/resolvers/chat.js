import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { encrypt, decrypt } from "../../utils/crypto.js";

const stmts = {
  allUsers: db.prepare("SELECT * FROM app_users ORDER BY id"),
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),

  // --- Chat ---
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

  // --- Permissions ---
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

  // --- Conversation previews ---
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

function decryptMessage(msg) {
  return { ...msg, text: decrypt(msg.text) };
}

const typingStore = new Map();

export default {
  Query: {
    conversation: (_, { userId1, userId2 }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const uid = user.id;
      if (uid !== Number(userId1) && uid !== Number(userId2)) {
        throw new Error("Accès refusé — tu ne peux lire que tes propres conversations.");
      }
      const perm = stmts.permissionBetween.get(userId1, userId2, userId2, userId1);
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez être connecté pour lire cette conversation.");
      }
      return stmts.conversation.all(userId1, userId2, userId2, userId1).map(decryptMessage);
    },

    chatPermission: (_, { userId1, userId2 }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId1) && user.id !== Number(userId2)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres permissions.");
      }
      return stmts.permissionBetween.get(userId1, userId2, userId2, userId1) || null;
    },

    pendingRequests: (_, { userId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé.");
      }
      return stmts.pendingReceived.all(userId);
    },

    conversationPreviews: (_, { userId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres conversations.");
      }
      const others = stmts.allUsers.all().filter((u) => u.id !== Number(userId));
      return others.map((other) => {
        const fromOther = stmts.lastMessageFrom.get(other.id, userId);
        const fromMe = stmts.lastMessageTo.get(userId, other.id);
        let lastMessage = null;
        if (fromOther && fromMe) {
          lastMessage = fromOther.created_at > fromMe.created_at ? fromOther : fromMe;
        } else {
          lastMessage = fromOther || fromMe;
        }
        if (lastMessage) lastMessage = decryptMessage(lastMessage);
        const unread = stmts.unreadCount.get(other.id, userId);
        return { user: other, lastMessage, unreadCount: unread.count };
      });
    },
  },

  Mutation: {
    sendMessage: (_, { text, receiverId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const receiver = stmts.userById.get(receiverId);
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      if (user.id === Number(receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const perm = stmts.permissionBetween.get(user.id, receiverId, receiverId, user.id);
      if (!perm || perm.status !== "accepted") {
        throw new Error("Vous devez d'abord obtenir l'autorisation.");
      }
      const encrypted = encrypt(text);
      const result = stmts.insertMessage.run(encrypted, user.id, receiverId);
      const newMessage = stmts.messageById.get(result.lastInsertRowid);
      const decrypted = decryptMessage(newMessage);
      pubsub.publish(EVENTS.MESSAGE_SENT, { messageSent: decrypted });
      pubsub.publish(EVENTS.MESSAGE_SENT_TO_USER, { messageSentToUser: decrypted });
      return decrypted;
    },

    markAsRead: (_, { messageIds }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const update = db.prepare("UPDATE messages SET read = 1 WHERE id = ? AND receiver_id = ?");
      const batch = db.transaction((ids) => { for (const id of ids) update.run(id, user.id); });
      batch(messageIds);
      for (const id of messageIds) {
        const msg = stmts.messageById.get(id);
        if (msg && msg.receiver_id === user.id) {
          pubsub.publish(EVENTS.MESSAGE_READ, {
            messageRead: { messageId: String(id), senderId: msg.sender_id, receiverId: msg.receiver_id },
          });
        }
      }
      return true;
    },

    setTyping: (_, { receiverId, isTyping }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const key = `${user.id}:${receiverId}`;
      if (isTyping) {
        if (typingStore.has(key)) clearTimeout(typingStore.get(key));
        const timeout = setTimeout(() => {
          typingStore.delete(key);
          pubsub.publish(EVENTS.USER_TYPING, {
            userTyping: { userId: String(user.id), isTyping: false },
          });
        }, 3000);
        typingStore.set(key, timeout);
      } else {
        if (typingStore.has(key)) clearTimeout(typingStore.get(key));
        typingStore.delete(key);
      }
      pubsub.publish(EVENTS.USER_TYPING, {
        userTyping: { userId: String(user.id), isTyping },
      });
      return true;
    },

    requestChat: (_, { receiverId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id === Number(receiverId)) throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
      const receiver = stmts.userById.get(receiverId);
      if (!receiver) throw new Error("Le destinataire n'existe pas.");
      const existing = stmts.permissionBetween.get(user.id, receiverId, receiverId, user.id);
      if (existing) {
        if (existing.status === "accepted") throw new Error("Vous êtes déjà connecté.");
        if (existing.status === "pending") throw new Error("La demande est déjà en attente.");
        stmts.updatePermissionStatus.run("pending", existing.id);
        const updated = stmts.permissionById.get(existing.id);
        pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
        return updated;
      }
      const result = stmts.insertPermission.run(user.id, receiverId, "pending");
      const perm = stmts.permissionById.get(result.lastInsertRowid);
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: perm });
      return perm;
    },

    acceptChat: (_, { permissionId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const perm = stmts.permissionById.get(permissionId);
      if (!perm) throw new Error("Demande introuvable.");
      if (perm.status !== "pending") throw new Error("Cette demande n'est plus en attente.");
      if (perm.receiver_id !== user.id) {
        throw new Error("Accès refusé — tu ne peux accepter que les demandes qui te sont adressées.");
      }
      stmts.updatePermissionStatus.run("accepted", permissionId);
      const updated = stmts.permissionById.get(permissionId);
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    rejectChat: (_, { permissionId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const perm = stmts.permissionById.get(permissionId);
      if (!perm) throw new Error("Demande introuvable.");
      if (perm.receiver_id !== user.id) {
        throw new Error("Accès refusé — tu ne peux rejeter que les demandes qui te sont adressées.");
      }
      stmts.updatePermissionStatus.run("rejected", permissionId);
      const updated = stmts.permissionById.get(permissionId);
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    updateLastSeen: (_, __, { user }) => {
      if (!user) throw new Error("Non authentifié");
      stmts.updateLastSeen.run(user.id);
      return true;
    },
  },

  Subscription: {
    messageSent: {
      subscribe: (_, { userId1, userId2 }) => {
        const ids = new Set([String(userId1), String(userId2)]);
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MESSAGE_SENT]);
            for await (const event of iter) {
              const msg = event.messageSent;
              if (ids.has(String(msg.sender_id)) && ids.has(String(msg.receiver_id))) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.messageSent,
    },
    messageSentToUser: {
      subscribe: (_, { userId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MESSAGE_SENT_TO_USER]);
            for await (const event of iter) {
              const msg = event.messageSentToUser;
              if (String(msg.receiver_id) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.messageSentToUser,
    },
    chatPermissionUpdated: {
      subscribe: (_, { userId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.CHAT_PERMISSION_UPDATED]);
            for await (const event of iter) {
              const perm = event.chatPermissionUpdated;
              if (String(perm.sender_id) === String(userId) || String(perm.receiver_id) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.chatPermissionUpdated,
    },
    messageRead: {
      subscribe: (_, { userId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MESSAGE_READ]);
            for await (const event of iter) {
              const { senderId, receiverId } = event.messageRead;
              if (String(senderId) === String(userId) || String(receiverId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.messageRead,
    },
    userTyping: {
      subscribe: (_, { userId1, userId2 }) => {
        const ids = new Set([String(userId1), String(userId2)]);
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.USER_TYPING]);
            for await (const event of iter) {
              if (ids.has(String(event.userTyping.userId))) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.userTyping,
    },
  },

  Message: {
    sender: (parent) => stmts.userById.get(parent.sender_id),
    receiver: (parent) => stmts.userById.get(parent.receiver_id),
    createdAt: (parent) => parent.created_at,
  },

  ChatPermission: {
    sender: (parent) => stmts.userById.get(parent.sender_id),
    receiver: (parent) => stmts.userById.get(parent.receiver_id),
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
  },

  ConversationPreview: {
    user: (parent) => parent.user,
    lastMessage: (parent) => parent.lastMessage || null,
    unreadCount: (parent) => parent.unreadCount,
  },
};
