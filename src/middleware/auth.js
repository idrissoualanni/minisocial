// src/middleware/auth.js
import { verifyAccessToken } from "../utils/tokens.js";
import db from "../db.js";

const userById = db.prepare("SELECT * FROM users WHERE id = ?");

/**
 * Extrait le token Bearer du header Authorization.
 * Retourne l'utilisateur ou null si non authentifié.
 */
export function getUserFromRequest(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = verifyAccessToken(auth.slice(7));
    const user = userById.get(payload.sub);
    return user || null;
  } catch {
    return null;
  }
}

/**
 * Context Apollo Server — appelé à chaque requête HTTP.
 */
export async function contextFn({ req }) {
  const user = getUserFromRequest(req);
  return { user };
}

/**
 * Context pour graphql-ws — appelé à la connexion WebSocket.
 */
export async function wsContextFn(ctx) {
  const token = ctx.connectionParams?.authorization;
  if (!token?.startsWith("Bearer ")) return { user: null };
  try {
    const payload = verifyAccessToken(token.slice(7));
    const user = userById.get(payload.sub);
    return { user: user || null };
  } catch {
    return { user: null };
  }
}

/**
 * Middleware Express pour les routes protégées (non-GraphQL).
 */
export function requireAuth(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });
  req.user = user;
  next();
}
