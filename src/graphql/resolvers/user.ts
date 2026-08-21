import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, posts } from "../../db/schema.js";
import { eq, and, count as drizzleCount, desc } from "drizzle-orm";

export default {
  Query: {
    me: async (_: unknown, __: unknown, { user }: Context): Promise<AppUser | null> => {
      if (!user) throw new Error("Non authentifié");
      return user;
    },
    users: async (): Promise<AppUser[]> => {
      return await db.select().from(appUsers).orderBy(appUsers.id) as AppUser[];
    },
    user: async (_: unknown, { id }: { id: string }): Promise<AppUser | null> => {
      const result = await db.select().from(appUsers).where(eq(appUsers.id, Number(id))).then((r) => r[0]);
      return (result as AppUser) || null;
    },
  },

  Mutation: {
    updateUser: async (
      _: unknown,
      { id, name, email, bio }: { id: string; name?: string; email?: string; bio?: string },
      { user }: Context
    ): Promise<AppUser> => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(id)) {
        throw new Error("Accès refusé — tu ne peux modifier que ton propre profil.");
      }
      const existing = await db
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, Number(id)))
        .then((r) => r[0]);
      if (!existing) throw new Error("Utilisateur introuvable.");
      if (email && email !== existing.email) {
        const dup = await db
          .select({ id: appUsers.id })
          .from(appUsers)
          .where(and(eq(appUsers.email, email), eq(appUsers.id, Number(id))))
          .then((r) => r[0]);
        if (dup) throw new Error("Cet email est déjà utilisé.");
      }
      await db
        .update(appUsers)
        .set({
          name: name || existing.name,
          email: email || existing.email,
          bio: bio ?? existing.bio ?? "",
        })
        .where(eq(appUsers.id, Number(id)));
      const updated = await db.select().from(appUsers).where(eq(appUsers.id, Number(id))).then((r) => r[0]);
      return updated as AppUser;
    },
  },

  User: {
    posts: async (parent: AppUser) => {
      return await db.select().from(posts).where(eq(posts.authorId, parent.id)).orderBy(desc(posts.createdAt));
    },
    postCount: async (parent: AppUser): Promise<number> => {
      const result = await db
        .select({ count: drizzleCount() })
        .from(posts)
        .where(eq(posts.authorId, parent.id))
        .then((r) => r[0]);
      return Number(result.count);
    },
    role: (parent: AppUser): string => parent.bio !== undefined ? (parent as any).role || "user" : "user",
    isOnline: (parent: AppUser): boolean => {
      if (!parent.lastSeen) return false;
      const lastSeen = parent.lastSeen instanceof Date
        ? parent.lastSeen
        : new Date(parent.lastSeen + "Z");
      const now = new Date();
      return (now.getTime() - lastSeen.getTime()) < 30_000;
    },
  },
};
