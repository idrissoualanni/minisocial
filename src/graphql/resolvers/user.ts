import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, posts } from "../../db/schema.js";
import { eq, ne, and, count as drizzleCount, desc } from "drizzle-orm";
import { validate, UpdateUserSchema } from "../../utils/validation.js";

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
      const data = validate(UpdateUserSchema, {
        id,
        name: name ?? undefined,
        email: email ?? undefined,
        bio: bio ?? undefined,
      });
      const existing = await db
        .select()
        .from(appUsers)
        .where(eq(appUsers.id, Number(id)))
        .then((r) => r[0]);
      if (!existing) throw new Error("Utilisateur introuvable.");

      // Anti-doublon : l'ancien code cherchait (email = X AND id = moi),
      // c'est-à-dire soi-même → "email déjà utilisé" systématique.
      // On cherche maintenant l'email chez les AUTRES utilisateurs.
      if (data.email && data.email !== existing.email) {
        const dup = await db
          .select({ id: appUsers.id })
          .from(appUsers)
          .where(and(eq(appUsers.email, data.email), ne(appUsers.id, Number(id))))
          .then((r) => r[0]);
        if (dup) throw new Error("Cet email est déjà utilisé.");
      }
      await db
        .update(appUsers)
        .set({
          name: data.name || existing.name,
          email: data.email || existing.email,
          bio: data.bio ?? existing.bio ?? "",
        })
        .where(eq(appUsers.id, Number(id)));
      const updated = await db.select().from(appUsers).where(eq(appUsers.id, Number(id))).then((r) => r[0]);
      return updated as AppUser;
    },
  },

  User: {
    posts: async (parent: AppUser, _args: unknown, { loaders }: Context) => {
      return await loaders.postsByAuthorId.load(parent.id);
    },
    postCount: async (parent: AppUser, _args: unknown, { loaders }: Context): Promise<number> => {
      return await loaders.postCountByUserId.load(parent.id);
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
