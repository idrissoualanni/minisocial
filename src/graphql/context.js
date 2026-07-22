// src/middleware/auth.js
import { auth } from "../auth.js";
import { ensureAppUser } from "../db/index.js";

/**
 * Extrait la session Better Auth du header Authorization.
 * Retourne l'app_user correspondant ou null.
 */
export async function getUserFromRequest(req) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    if (!session?.user) return null;
    // Mapper le Better Auth user vers notre app_users
    return ensureAppUser(session.user);
  } catch {
    return null;
  }
}

/**
 * Context Apollo Server — appelé à chaque requête HTTP.
 */
export async function contextFn({ req }) {
  const user = await getUserFromRequest(req);
  return { user };
}

/**
 * Middleware Express pour les routes protégées (non-GraphQL).
 */
export function requireAuth(req, res, next) {
  getUserFromRequest(req).then((user) => {
    if (!user) return res.status(401).json({ error: "Non authentifié" });
    req.user = user;
    next();
  });
}
