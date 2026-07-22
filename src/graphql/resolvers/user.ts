import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import db from "../../db/index.js";

const stmts = {
  allUsers: db.prepare("SELECT * FROM app_users ORDER BY id"),
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),
  userByEmail: db.prepare("SELECT * FROM app_users WHERE email = ?"),
  postsByAuthor: db.prepare("SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC"),
  countPostsByUser: db.prepare("SELECT COUNT(*) as count FROM posts WHERE author_id = ?"),
};

export default {
  Query: {
    me: (_: unknown, __: unknown, { user }: Context): AppUser | null => {
      if (!user) throw new Error("Non authentifié");
      return user;
    },
    users: (): AppUser[] => stmts.allUsers.all() as AppUser[],
    user: (_: unknown, { id }: { id: string }): AppUser | null =>
      (stmts.userById.get(id) as AppUser) || null,
  },

  Mutation: {
    updateUser: (_: unknown, { id, name, email, bio }: { id: string; name?: string; email?: string; bio?: string }, { user }: Context): AppUser => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(id)) {
        throw new Error("Accès refusé — tu ne peux modifier que ton propre profil.");
      }
      const existing = stmts.userById.get(id) as AppUser | undefined;
      if (!existing) throw new Error("Utilisateur introuvable.");
      if (email && email !== existing.email) {
        const dup = db.prepare("SELECT id FROM app_users WHERE email = ? AND id != ?").get(email, id);
        if (dup) throw new Error("Cet email est déjà utilisé.");
      }
      db.prepare("UPDATE app_users SET name = ?, email = ?, bio = ? WHERE id = ?").run(
        name || existing.name, email || existing.email, bio ?? existing.bio ?? "", id
      );
      return stmts.userById.get(id) as AppUser;
    },
  },

  User: {
    posts: (parent: AppUser) => stmts.postsByAuthor.all(parent.id),
    postCount: (parent: AppUser): number => (stmts.countPostsByUser.get(parent.id) as any).count,
    role: (parent: AppUser): string => parent.bio !== undefined ? (parent as any).role || "user" : "user",
    isOnline: (parent: AppUser): boolean => {
      if (!parent.last_seen) return false;
      const lastSeen = new Date(parent.last_seen + "Z");
      const now = new Date();
      return (now.getTime() - lastSeen.getTime()) < 30_000;
    },
  },
};
