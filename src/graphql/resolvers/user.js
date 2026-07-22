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
    me: (_, __, { user }) => {
      if (!user) throw new Error("Non authentifié");
      return user;
    },
    users: () => stmts.allUsers.all(),
    user: (_, { id }) => stmts.userById.get(id) || null,
  },

  Mutation: {
    updateUser: (_, { id, name, email, bio }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      if (user.id !== Number(id)) {
        throw new Error("Accès refusé — tu ne peux modifier que ton propre profil.");
      }
      const existing = stmts.userById.get(id);
      if (!existing) throw new Error("Utilisateur introuvable.");
      if (email && email !== existing.email) {
        const dup = db.prepare("SELECT id FROM app_users WHERE email = ? AND id != ?").get(email, id);
        if (dup) throw new Error("Cet email est déjà utilisé.");
      }
      db.prepare("UPDATE app_users SET name = ?, email = ?, bio = ? WHERE id = ?").run(
        name || existing.name, email || existing.email, bio ?? existing.bio ?? "", id
      );
      return stmts.userById.get(id);
    },
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
};
