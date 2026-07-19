// src/utils/tokens.js
import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "minisocial-access-dev";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "minisocial-refresh-dev";
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || "user" },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

export function signRefreshToken(user) {
  const jti = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return jwt.sign({ sub: user.id, jti }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}
