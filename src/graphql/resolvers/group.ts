import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, chatGroups, groupMembers, groupMessages } from "../../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { isoDate } from "../serialize.js";

export default {
  Query: {
    myGroups: async (_: unknown, { userId }: { userId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(userId)) {
        throw new Error("Accès refusé — tu ne peux voir que tes propres groupes.");
      }
      return await db
        .select({
          id: chatGroups.id,
          name: chatGroups.name,
          creator_id: chatGroups.creatorId,
          created_at: chatGroups.createdAt,
        })
        .from(chatGroups)
        .innerJoin(groupMembers, eq(chatGroups.id, groupMembers.groupId))
        .where(eq(groupMembers.userId, Number(userId)))
        .orderBy(desc(chatGroups.createdAt));
    },
    groupMessages: async (
      _: unknown,
      { groupId, limit }: { groupId: string; limit?: number },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const member = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, Number(groupId)), eq(groupMembers.userId, user.id)))
        .then((r) => r[0]);
      if (!member) throw new Error("Accès refusé — tu n'es pas membre de ce groupe.");
      const rows = await db
        .select()
        .from(groupMessages)
        .where(eq(groupMessages.groupId, Number(groupId)))
        .orderBy(desc(groupMessages.createdAt))
        .limit(limit || 50);
      return rows.reverse();
    },
  },

  Mutation: {
    createGroup: async (
      _: unknown,
      { name, memberIds }: { name: string; memberIds: number[] },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      if (!name.trim()) throw new Error("Nom de groupe requis.");
      const [newGroup] = await db
        .insert(chatGroups)
        .values({ name: name.trim(), creatorId: user.id })
        .returning();
      const groupId = newGroup.id;
      await db
        .insert(groupMembers)
        .values({ groupId, userId: user.id, isCreator: 1 })
        .onConflictDoNothing();
      const validMembers = [...new Set(memberIds.map(Number))].filter(
        (mid) => Number.isFinite(mid) && mid !== user.id
      );
      if (validMembers.length > 0) {
        await db
          .insert(groupMembers)
          .values(validMembers.map((mid) => ({ groupId, userId: mid, isCreator: 0 })))
          .onConflictDoNothing();
      }
      const group = await db.select().from(chatGroups).where(eq(chatGroups.id, groupId)).then((r) => r[0]);
      return { ...group, creator_id: group.creatorId, created_at: group.createdAt };
    },

    addGroupMember: async (
      _: unknown,
      { groupId, userId }: { groupId: string; userId: number },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const group = await db.select().from(chatGroups).where(eq(chatGroups.id, Number(groupId))).then((r) => r[0]);
      if (!group) throw new Error("Groupe introuvable.");
      const requester = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, Number(groupId)), eq(groupMembers.userId, user.id)))
        .then((r) => r[0]);
      if (!requester) throw new Error("Accès refusé — tu n'es pas membre de ce groupe.");
      const u = await db.select().from(appUsers).where(eq(appUsers.id, userId)).then((r) => r[0]);
      if (!u) throw new Error("Utilisateur introuvable.");
      await db
        .insert(groupMembers)
        .values({ groupId: Number(groupId), userId, isCreator: 0 })
        .onConflictDoNothing();
      return { user: u, isCreator: false, joinedAt: new Date().toISOString() };
    },

    removeGroupMember: async (
      _: unknown,
      { groupId, userId }: { groupId: string; userId: number },
      { user }: Context
    ): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      const group = await db.select().from(chatGroups).where(eq(chatGroups.id, Number(groupId))).then((r) => r[0]);
      if (!group) throw new Error("Groupe introuvable.");
      if (group.creatorId !== user.id && user.id !== Number(userId)) {
        throw new Error("Accès refusé — seul le créateur peut virer un membre, ou tu peux te retirer toi-même.");
      }
      await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, Number(groupId)), eq(groupMembers.userId, Number(userId))));
      return true;
    },

    sendGroupMessage: async (
      _: unknown,
      { text, groupId }: { text: string; groupId: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const group = await db.select().from(chatGroups).where(eq(chatGroups.id, Number(groupId))).then((r) => r[0]);
      if (!group) throw new Error("Groupe introuvable.");
      const member = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, Number(groupId)), eq(groupMembers.userId, user.id)))
        .then((r) => r[0]);
      if (!member) throw new Error("Vous n'êtes pas membre de ce groupe.");
      const encrypted = encrypt(text);
      const [newMsg] = await db
        .insert(groupMessages)
        .values({
          text: encrypted,
          senderId: user.id,
          groupId: Number(groupId),
        })
        .returning();
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
              // Drizzle renvoie groupId (camelCase) — l'ancien group_id ne matchait jamais
              if (String(event.groupMessageSent.groupId) === String(groupId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.groupMessageSent,
    },
  },

  ChatGroup: {
    creator: async (parent: any, _args: unknown, { loaders }: Context) => {
      const creatorId = parent.creatorId ?? parent.creator_id;
      return await loaders.userById.load(creatorId);
    },
    // Batché : 1 requête pour les membres de N groupes
    members: async (parent: any, _args: unknown, { loaders }: Context) => {
      const rows = await loaders.groupMembersByGroupId.load(parent.id);
      return rows.map(({ row, user }) => ({
        user,
        isCreator: !!row.isCreator,
        joinedAt: isoDate(row.joinedAt),
      }));
    },
    createdAt: (parent: any) => isoDate(parent.created_at || parent.createdAt),
  },

  GroupMember: {
    user: (parent: { user: AppUser }) => parent.user,
    isCreator: (parent: { isCreator: boolean }) => parent.isCreator,
    joinedAt: (parent: { joinedAt: string }) => parent.joinedAt,
  },

  GroupMessage: {
    sender: async (parent: any, _args: unknown, { loaders }: Context) => {
      const senderId = parent.senderId ?? parent.sender_id;
      return await loaders.userById.load(senderId);
    },
    group: async (parent: any) => {
      const groupId = parent.groupId ?? parent.group_id;
      const result = await db.select().from(chatGroups).where(eq(chatGroups.id, groupId)).then((r) => r[0]);
      return result ? { ...result, creator_id: result.creatorId, created_at: result.createdAt } : null;
    },
    createdAt: (parent: any) => isoDate(parent.created_at || parent.createdAt),
  },
};
