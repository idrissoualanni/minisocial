// src/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";

// Global : 1000 requêtes / 15 min par IP.
// L'ancienne valeur (200) était traversée par le seul heartbeat
// toutes les 15 s (96 req) + usage normal → blocage en ~10 min.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes, réessayez dans 15 minutes." },
});
