import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { encrypt, decrypt } from "../../utils/crypto.js";

const stmts = {
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),

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
};

interface ChatGroupResult {
  id: number;
  name: string;
  creator_id: number;
  created_at: string;
}

interface GroupMemberResult {
  user_id: number;
  name: string;
  email: string;
  last_seen: string;
  is_creator: number;
  joined_at: string;
}

interface GroupMessageResult {
  id: number;
  text: string;
  sender_id: number;
  group_id: number;
  created_at: string;
}

export default {
  Query: {
    myGroups: (_: unknown, { userId }: { userId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres groupes.");
      }
      return stmts.myGroups.all(userId);
    },
    groupMessages: (_: unknown, { groupId, limit }: { groupId: string; limit?: number }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      const member = stmts.isGroupMember.get(groupId, user.id);
      if (!member) throw new Error("Accès refusé — tu n'es pas membre de ce groupe.");
      return stmts.groupMessages.all(groupId, limit || 50).reverse();
    },
  },

  Mutation: {
    createGroup: (_: unknown, { name, memberIds }: { name: string; memberIds: number[] }, { user }: Context) => {
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

    addGroupMember: (_: unknown, { groupId, userId }: { groupId: string; userId: number }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      const group = stmts.groupById.get(groupId);
      if (!group) throw new Error("Groupe introuvable.");
      const requester = stmts.isGroupMember.get(groupId, user.id);
      if (!requester) throw new Error("Accès refusé — tu n'es pas membre de ce groupe.");
      const u = stmts.userById.get(userId);
      if (!u) throw new Error("Utilisateur introuvable.");
      stmts.insertGroupMember.run(groupId, userId, 0);
      return { user: u, isCreator: false, joinedAt: new Date().toISOString() };
    },

    removeGroupMember: (_: unknown, { groupId, userId }: { groupId: string; userId: number }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      const group = stmts.groupById.get(groupId) as ChatGroupResult | undefined;
      if (!group) throw new Error("Groupe introuvable.");
      if (group.creator_id !== user.id && user.id !== Number(userId)) {
        throw new Error("Accès refusé — seul le créateur peut virer un membre, ou tu peux te retirer toi-même.");
      }
      stmts.removeGroupMember.run(groupId, userId);
      return true;
    },

    sendGroupMessage: (_: unknown, { text, groupId }: { text: string; groupId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      const group = stmts.groupById.get(groupId) as ChatGroupResult | undefined;
      if (!group) throw new Error("Groupe introuvable.");
      const member = stmts.isGroupMember.get(groupId, user.id);
      if (!member) throw new Error("Vous n'êtes pas membre de ce groupe.");
      const encrypted = encrypt(text);
      const result = stmts.insertGroupMessage.run(encrypted, user.id, groupId);
      const newMsg = stmts.groupMessageById.get(result.lastInsertRowid) as GroupMessageResult;
      const decrypted = { ...newMsg, text: decrypt(newMsg.text) };
      pubsub.publish(EVENTS.GROUP_MESSAGE_SENT, { groupMessageSent: decrypted });
      return decrypted;
    },
  },

  Subscription: {
    groupMessageSent: {
      subscribe: (_: unknown, { groupId }: { groupId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.GROUP_MESSAGE_SENT]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              if (String(event.groupMessageSent.group_id) === String(groupId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.groupMessageSent,
    },
  },

  ChatGroup: {
    creator: (parent: { creator_id: number }) => stmts.userById.get(parent.creator_id),
    members: (parent: { id: number }) => (stmts.groupMembers.all(parent.id) as GroupMemberResult[]).map((m) => ({
      user: stmts.userById.get(m.user_id),
      isCreator: !!m.is_creator,
      joinedAt: m.joined_at,
    })),
    createdAt: (parent: { created_at: string }) => parent.created_at,
  },

  GroupMember: {
    user: (parent: { user: AppUser }) => parent.user,
    isCreator: (parent: { isCreator: boolean }) => parent.isCreator,
    joinedAt: (parent: { joinedAt: string }) => parent.joinedAt,
  },

  GroupMessage: {
    sender: (parent: { sender_id: number }) => stmts.userById.get(parent.sender_id),
    group: (parent: { group_id: number }) => stmts.groupById.get(parent.group_id),
    createdAt: (parent: { created_at: string }) => parent.created_at,
  },
};
