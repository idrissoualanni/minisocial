// src/middleware/rateLimit.js
import rateLimit from "express-rate-limit";

// Global: 200 requêtes / 15 min par IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes, réessayez dans 15 minutes." },
});

// Auth: 10 tentatives / 15 min par IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez dans 15 minutes." },
});

// Chat: 60 messages / 15 min par IP (keyGenerator par défaut = req.ip)
export const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de messages atteinte." },
});
