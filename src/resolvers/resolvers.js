// ============================================================
// resolvers.js — Queries, Mutations, Subscriptions
// ============================================================
// Auth via Better Auth (HTTP endpoints /api/auth/*).
// Les resolvers GraphQL gèrent uniquement les données métier.
// ============================================================

import db from "../db.js";
import { PubSub } from "graphql-subscriptions";
import { encrypt, decrypt } from "../crypto.js";
import natural from "natural";
import { validate, CreateMeetingSchema } from "../utils/validation.js";

const pubsub = new PubSub();

// Événements
const EVENTS = {
  POST_CREATED: "POST_CREATED",
  COMMENT_ADDED: "COMMENT_ADDED",
  MESSAGE_SENT: "MESSAGE_SENT",
  MESSAGE_SENT_TO_USER: "MESSAGE_SENT_TO_USER",
  MESSAGE_READ: "MESSAGE_READ",
  CHAT_PERMISSION_UPDATED: "CHAT_PERMISSION_UPDATED",
  LIKE_TOGGLED: "LIKE_TOGGLED",
  USER_TYPING: "USER_TYPING",
  GROUP_MESSAGE_SENT: "GROUP_MESSAGE_SENT",
  MEETING_SIGNAL: "MEETING_SIGNAL",
  MEETING_UPDATED: "MEETING_UPDATED",
  MEETING_INVITED: "MEETING_INVITED",
};

// --- Requêtes précompilées (app_users) ---
const stmts = {
  allUsers: db.prepare("SELECT * FROM app_users ORDER BY id"),
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),
  userByEmail: db.prepare("SELECT * FROM app_users WHERE email = ?"),
  allPosts: db.prepare("SELECT * FROM posts ORDER BY created_at DESC"),
  postsByAuthor: db.prepare("SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC"),
  postById: db.prepare("SELECT * FROM posts WHERE id = ?"),
  commentsByPost: db.prepare("SELECT * FROM comments WHERE post_id = ? AND parent_id IS NULL ORDER BY created_at ASC"),
  commentsByParent: db.prepare("SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC"),
  countPostsByUser: db.prepare("SELECT COUNT(*) as count FROM posts WHERE author_id = ?"),
  insertPost: db.prepare("INSERT INTO posts (title, content, author_id, image_url) VALUES (?, ?, ?, ?)"),
  insertComment: db.prepare("INSERT INTO comments (text, author_id, post_id, parent_id) VALUES (?, ?, ?, ?)"),

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

  // --- Likes ---
  hasLiked: db.prepare("SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?"),
  likeCount: db.prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?"),
  likedUsers: db.prepare(`
    SELECT u.* FROM app_users u JOIN post_likes pl ON u.id = pl.user_id WHERE pl.post_id = ?
  `),
  toggleLikeOn: db.prepare("INSERT OR IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)"),
  toggleLikeOff: db.prepare("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?"),

  // --- Groupes ---
  insertGroup: db.prepare("INSERT INTO chat_groups (name, creator_id) VALUES (?, ?)"),
  groupById: db.prepare("SELECT * FROM chat_groups WHERE id = ?"),
  insertGroupMember: db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, is_creator) VALUES (?, ?, ?)"),
  groupMembers: db.prepare(`
    SELECT gm.*, u.name, u.email, u.last_seen
    FROM group_members gm JOIN app_users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
  `),
  isGroupMember: db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?"),
  myGroups: db.prepare(`
    SELECT cg.* FROM chat_groups cg
    JOIN group_members gm ON cg.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY cg.created_at DESC
  `),
  insertGroupMessage: db.prepare(
    "INSERT INTO group_messages (text, sender_id, group_id) VALUES (?, ?, ?)"
  ),
  groupMessageById: db.prepare("SELECT * FROM group_messages WHERE id = ?"),
  groupMessages: db.prepare(`
    SELECT * FROM group_messages WHERE group_id = ?
    ORDER BY created_at DESC LIMIT ?
  `),
  removeGroupMember: db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?"),

  // --- Meetings ---
  insertMeeting: db.prepare("INSERT INTO meetings (title, creator_id) VALUES (?, ?)"),
  meetingById: db.prepare("SELECT * FROM meetings WHERE id = ?"),
  allMeetings: db.prepare("SELECT * FROM meetings WHERE is_active = 1"),
  insertMeetingParticipant: db.prepare("INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)"),
  meetingParticipants: db.prepare("SELECT u.* FROM app_users u JOIN meeting_participants mp ON u.id = mp.user_id WHERE mp.meeting_id = ?"),
  removeMeetingParticipant: db.prepare("DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?"),
};

function decryptMessage(msg) {
  return { ...msg, text: decrypt(msg.text) };
}

// --- Typing indicator (en mémoire, pas en BDD) ---
const typingStore = new Map(); // key: "senderId:receiverId" → timeout

const resolvers = {
  // ==========================================================
  // QUERIES
  // ==========================================================
  Query: {
    // --- Auth (via Better Auth session) ---
    me: (_, __, { user }) => {
      if (!user) throw new Error("Non authentifié");
      return user;
    },

    // --- Users ---
    posts: () => stmts.allPosts.all(),
    post: (_, { id }) => stmts.postById.get(id) || null,
    users: () => stmts.allUsers.all(),
    user: (_, { id }) => stmts.userById.get(id) || null,

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

    chatPermission: (_, { userId1, userId2 }) =>
      stmts.permissionBetween.get(userId1, userId2, userId2, userId1) || null,

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

    // --- Recherche sémantique (TF-IDF + stemmer FR + diacritiques) ---
    search: (_, { query }) => {
      const allPosts = stmts.allPosts.all();
      if (allPosts.length === 0) return [];

      const tokenizer = new natural.WordTokenizer();
      const stemmer = natural.PorterStemmerFr;
      const tfidf = new natural.TfIdf();

      const stripDiacritics = (str) =>
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const processText = (text) => {
        const lower = stripDiacritics(text.toLowerCase());
        const tokens = tokenizer.tokenize(lower);
        return tokens.map((t) => stemmer.stem(t)).join(" ");
      };

      allPosts.forEach((post) => {
        const author = stmts.userById.get(post.author_id);
        const fullText = `${post.title} ${post.content} ${author ? author.name : ""}`;
        tfidf.addDocument(processText(fullText));
      });

      const searchStr = processText(query);
      const scores = [];
      tfidf.tfidfs(searchStr, (i, measure) => {
        if (measure > 0) scores.push({ index: i, score: measure });
      });
      scores.sort((a, b) => b.score - a.score);
      return scores.map((s) => allPosts[s.index]);
    },

    // --- Groupes ---
    myGroups: (_, { userId }) => stmts.myGroups.all(userId),
    groupMessages: (_, { groupId, limit }) =>
      stmts.groupMessages.all(groupId, limit || 50).reverse(),

    // --- Meetings ---
    meetings: () => stmts.allMeetings.all(),
    meeting: (_, { id }) => stmts.meetingById.get(id) || null,
  },

  // ==========================================================
  // MUTATIONS
  // ==========================================================
  Mutation: {
    // --- Users ---
    updateUser: (_, { id, name, email, bio }) => {
      const user = stmts.userById.get(id);
      if (!user) throw new Error("Utilisateur introuvable.");
      if (email && email !== user.email) {
        const dup = db.prepare("SELECT id FROM app_users WHERE email = ? AND id != ?").get(email, id);
        if (dup) throw new Error("Cet email est déjà utilisé.");
      }
      db.prepare("UPDATE app_users SET name = ?, email = ?, bio = ? WHERE id = ?").run(
        name || user.name, email || user.email, bio ?? user.bio ?? "", id
      );
      return stmts.userById.get(id);
    },

    createPost: (_, { title, content, imageUrl }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const result = stmts.insertPost.run(title, content, user.id, imageUrl || null);
      const newPost = stmts.postById.get(result.lastInsertRowid);
      pubsub.publish(EVENTS.POST_CREATED, { postCreated: newPost });
      return newPost;
    },

    updatePost: (_, { id, title, content, imageUrl }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(id);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.author_id !== user.id) {
        throw new Error("Vous ne pouvez modifier que vos propres posts.");
      }
      db.prepare("UPDATE posts SET title = ?, content = ?, image_url = ? WHERE id = ?").run(
        title || post.title, content || post.content,
        imageUrl !== undefined ? imageUrl : post.image_url,
        id
      );
      return stmts.postById.get(id);
    },

    addComment: (_, { text, postId, parentId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(postId);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (parentId) {
        const parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(parentId);
        if (!parent) throw new Error("Le commentaire parent n'existe pas.");
      }
      const result = stmts.insertComment.run(text, user.id, postId, parentId || null);
      const newComment = db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid);
      pubsub.publish(EVENTS.COMMENT_ADDED, { commentAdded: newComment });
      return newComment;
    },

    deletePost: (_, { id }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(id);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.author_id !== user.id) {
        throw new Error("Vous ne pouvez supprimer que vos propres posts.");
      }
      db.prepare("DELETE FROM posts WHERE id = ?").run(id);
      return true;
    },

    toggleLike: (_, { postId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const existing = stmts.hasLiked.get(user.id, postId);
      if (existing) {
        stmts.toggleLikeOff.run(user.id, postId);
      } else {
        stmts.toggleLikeOn.run(user.id, postId);
      }
      const count = stmts.likeCount.get(postId).count;
      pubsub.publish(EVENTS.LIKE_TOGGLED, {
        likeToggled: { postId: String(postId), likeCount: count, userId: String(user.id) },
      });
      return !existing;
    },

    // --- Chat privé ---
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

    // --- Permissions chat ---
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
      stmts.updatePermissionStatus.run("accepted", permissionId);
      const updated = stmts.permissionById.get(permissionId);
      pubsub.publish(EVENTS.CHAT_PERMISSION_UPDATED, { chatPermissionUpdated: updated });
      return updated;
    },

    rejectChat: (_, { permissionId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const perm = stmts.permissionById.get(permissionId);
      if (!perm) throw new Error("Demande introuvable.");
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

    // --- Groupes ---
    createGroup: (_, { name, memberIds }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const result = stmts.insertGroup.run(name, user.id);
      const groupId = result.lastInsertRowid;
      stmts.insertGroupMember.run(groupId, user.id, 1);
      for (const mid of memberIds) {
        if (mid !== user.id) {
          stmts.insertGroupMember.run(groupId, mid, 0);
        }
      }
      return stmts.groupById.get(groupId);
    },

    addGroupMember: (_, { groupId, userId }) => {
      const group = stmts.groupById.get(groupId);
      if (!group) throw new Error("Groupe introuvable.");
      const u = stmts.userById.get(userId);
      if (!u) throw new Error("Utilisateur introuvable.");
      stmts.insertGroupMember.run(groupId, userId, 0);
      return { user: u, isCreator: false, joinedAt: new Date().toISOString() };
    },

    removeGroupMember: (_, { groupId, userId }) => {
      stmts.removeGroupMember.run(groupId, userId);
      return true;
    },

    sendGroupMessage: (_, { text, groupId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const group = stmts.groupById.get(groupId);
      if (!group) throw new Error("Groupe introuvable.");
      const member = stmts.isGroupMember.get(groupId, user.id);
      if (!member) throw new Error("Vous n'êtes pas membre de ce groupe.");
      const encrypted = encrypt(text);
      const result = stmts.insertGroupMessage.run(encrypted, user.id, groupId);
      const newMsg = stmts.groupMessageById.get(result.lastInsertRowid);
      const decrypted = { ...newMsg, text: decrypt(newMsg.text) };
      pubsub.publish(EVENTS.GROUP_MESSAGE_SENT, { groupMessageSent: decrypted });
      return decrypted;
    },

    // --- Meetings ---
    createMeeting: (_, args, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const data = validate(CreateMeetingSchema, { title: args.title });
      const result = stmts.insertMeeting.run(data.title, user.id);
      const meetingId = result.lastInsertRowid;
      stmts.insertMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId);

      if (args.targetUserId) {
        const fromUser = stmts.userById.get(user.id);
        pubsub.publish(EVENTS.MEETING_INVITED, {
          meetingInvited: {
            meetingId: String(meetingId),
            meetingTitle: data.title,
            fromUser,
            toUserId: String(args.targetUserId),
          },
        });
      }

      return meeting;
    },

    joinMeeting: (_, { meetingId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      stmts.insertMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId);
      pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      return meeting;
    },

    leaveMeeting: (_, { meetingId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      stmts.removeMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId);
      if (meeting) {
        const remaining = stmts.meetingParticipants.all(meetingId);
        if (remaining.length === 0) {
          db.prepare("UPDATE meetings SET is_active = 0 WHERE id = ?").run(meetingId);
          meeting.is_active = 0;
        }
        pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      }
      return true;
    },

    sendMeetingSignal: (_, { meetingId, toUserId, type, payload }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      pubsub.publish(EVENTS.MEETING_SIGNAL, {
        meetingSignal: {
          meetingId,
          fromUserId: String(user.id),
          toUserId,
          type,
          payload: payload || null,
        },
      });
      return true;
    },
  },

  // ==========================================================
  // SUBSCRIPTIONS
  // ==========================================================
  Subscription: {
    postCreated: {
      subscribe: () => pubsub.subscribe([EVENTS.POST_CREATED]),
    },
    commentAdded: {
      subscribe: (_, { postId }) => {
        if (postId) {
          return {
            [Symbol.asyncIterator]: async function* () {
              const iter = pubsub.subscribe([EVENTS.COMMENT_ADDED]);
              for await (const event of iter) {
                if (String(event.commentAdded.post_id) === String(postId)) yield event;
              }
            },
          };
        }
        return pubsub.subscribe([EVENTS.COMMENT_ADDED]);
      },
      resolve: (payload) => payload.commentAdded,
    },
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
    likeToggled: {
      subscribe: () => pubsub.subscribe([EVENTS.LIKE_TOGGLED]),
      resolve: (payload) => payload.likeToggled,
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
    groupMessageSent: {
      subscribe: (_, { groupId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.GROUP_MESSAGE_SENT]);
            for await (const event of iter) {
              if (String(event.groupMessageSent.group_id) === String(groupId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.groupMessageSent,
    },

    meetingSignal: {
      subscribe: (_, { meetingId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MEETING_SIGNAL]);
            try {
              for await (const event of iter) {
                if (String(event.meetingSignal.meetingId) === String(meetingId)) yield event;
              }
            } finally {
              iter.return?.();
            }
          },
        };
      },
      resolve: (payload) => payload.meetingSignal,
    },

    meetingUpdated: {
      subscribe: (_, { meetingId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MEETING_UPDATED]);
            for await (const event of iter) {
              if (String(event.meetingUpdated.id) === String(meetingId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.meetingUpdated,
    },

    meetingInvited: {
      subscribe: (_, { userId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MEETING_INVITED]);
            for await (const event of iter) {
              if (String(event.meetingInvited.toUserId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.meetingInvited,
    },
  },

  // ==========================================================
  // FIELD RESOLVERS
  // ==========================================================
  Post: {
    author: (parent) => stmts.userById.get(parent.author_id),
    comments: (parent) => stmts.commentsByPost.all(parent.id),
    likeCount: (parent) => stmts.likeCount.get(parent.id).count,
    likes: (parent) => stmts.likedUsers.all(parent.id),
    imageUrl: (parent) => parent.image_url || null,
    createdAt: (parent) => parent.created_at,
  },

  Comment: {
    author: (parent) => stmts.userById.get(parent.author_id),
    post: (parent) => stmts.postById.get(parent.post_id),
    parentId: (parent) => parent.parent_id,
    createdAt: (parent) => parent.created_at,
    replies: (parent) => stmts.commentsByParent.all(parent.id),
  },

  User: {
    posts: (parent) => stmts.postsByAuthor.all(parent.id),
    postCount: (parent) => stmts.countPostsByUser.get(parent.id).count,
    role: (parent) => parent.role || "user",
    isOnline: (parent) => {
      if (!parent.last_seen) return false;
      const lastSeen = new Date(parent.last_seen + "Z");
      const now = new Date();
      return (now - lastSeen) < 30_000;
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

  ChatGroup: {
    creator: (parent) => stmts.userById.get(parent.creator_id),
    members: (parent) => stmts.groupMembers.all(parent.id).map((m) => ({
      user: stmts.userById.get(m.user_id),
      isCreator: !!m.is_creator,
      joinedAt: m.joined_at,
    })),
    createdAt: (parent) => parent.created_at,
  },

  GroupMember: {
    user: (parent) => parent.user,
    isCreator: (parent) => parent.isCreator,
    joinedAt: (parent) => parent.joinedAt,
  },

  GroupMessage: {
    sender: (parent) => stmts.userById.get(parent.sender_id),
    group: (parent) => stmts.groupById.get(parent.group_id),
    createdAt: (parent) => parent.created_at,
  },

  Meeting: {
    creator: (parent) => stmts.userById.get(parent.creator_id),
    participants: (parent) => stmts.meetingParticipants.all(parent.id),
    isActive: (parent) => !!parent.is_active,
    createdAt: (parent) => parent.created_at,
  },
};

export default resolvers;
