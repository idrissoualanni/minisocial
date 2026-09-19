import { db } from "../../db/drizzle-client.js";
import { follows, appUsers } from "../../db/schema.js";
import { eq, and, count, desc, sql as drizzleSql } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";

async function followersCount(userId: number): Promise<number> {
  const [row] = await db.select({ value: count() }).from(follows).where(eq(follows.followingId, userId));
  return Number(row?.value ?? 0);
}

async function followingCount(userId: number): Promise<number> {
  const [row] = await db.select({ value: count() }).from(follows).where(eq(follows.followerId, userId));
  return Number(row?.value ?? 0);
}

async function isFollowing(followerId: number, followingId: number): Promise<boolean> {
  const rows = await db.select().from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
  return rows.length > 0;
}

export default {
  Query: {
    followers: async (_: unknown, { userId }: { userId: string }) => {
      const uid = Number(userId);
      const rows = await db.select({ user: appUsers })
        .from(follows)
        .innerJoin(appUsers, eq(appUsers.id, follows.followerId))
        .where(eq(follows.followingId, uid))
        .orderBy(desc(follows.createdAt));
      return rows.map((r) => r.user);
    },
    following: async (_: unknown, { userId }: { userId: string }) => {
      const uid = Number(userId);
      const rows = await db.select({ user: appUsers })
        .from(follows)
        .innerJoin(appUsers, eq(appUsers.id, follows.followingId))
        .where(eq(follows.followerId, uid))
        .orderBy(desc(follows.createdAt));
      return rows.map((r) => r.user);
    },
    isFollowing: async (_: unknown, { userId }: { userId: string }, context: any) => {
      if (!context.user || context.user.id === Number(userId)) return false;
      return isFollowing(context.user.id, Number(userId));
    },
  },

  Mutation: {
    toggleFollow: async (_: unknown, { userId }: { userId: string }, context: any) => {
      if (!context.user) throw new Error("Non authentifié");
      const targetId = Number(userId);
      if (context.user.id === targetId) throw new Error("Impossible de se suivre soi-même");

      const existing = await db.select().from(follows)
        .where(and(eq(follows.followerId, context.user.id), eq(follows.followingId, targetId)));

      let isNowFollowing: boolean;
      if (existing.length > 0) {
        await db.delete(follows)
          .where(and(eq(follows.followerId, context.user.id), eq(follows.followingId, targetId)));
        isNowFollowing = false;
      } else {
        await db.insert(follows)
          .values({ followerId: context.user.id, followingId: targetId })
          .onConflictDoNothing();
        isNowFollowing = true;
      }

      const event = {
        followerId: String(context.user.id),
        followingId: String(targetId),
        isFollowing: isNowFollowing,
        followersCount: await followersCount(targetId),
      };

      pubsub.publish(EVENTS.FOLLOW_UPDATED, { followUpdated: event });
      return event;
    },
  },

  Subscription: {
    followUpdated: {
      subscribe: (_: unknown, __: unknown, context: any) => {
        return pubsub.asyncIterableIterator([EVENTS.FOLLOW_UPDATED]);
      },
      resolve: (payload: any) => payload.followUpdated,
    },
  },

  User: {
    followersCount: (parent: { id: number }) => followersCount(parent.id),
    followingCount: (parent: { id: number }) => followingCount(parent.id),
    isFollowedByMe: async (parent: { id: number }, _: unknown, context: any) => {
      if (!context.user || context.user.id === parent.id) return false;
      return isFollowing(context.user.id, parent.id);
    },
  },
};
