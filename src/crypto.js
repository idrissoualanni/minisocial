// ============================================================
// crypto.js — Chiffrement AES-256-GCM des messages
// ============================================================
// Chaque message est chiffré avant l'insertion en BDD
// et déchiffré à la lecture. Le texte brut ne stocke jamais
// en clair dans SQLite.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = join(__dirname, "..", ".env");

// --- Chargement ou génération de la clé ---
function loadKey() {
  // Cherche dans les variables d'environnement ou le fichier .env
  if (process.env.MESSAGE_SECRET) return process.env.MESSAGE_SECRET;

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    const match = content.match(/^MESSAGE_SECRET=(.+)$/m);
    if (match) return match[1].trim();
  }

  // Génère une nouvelle clé et la sauvegarde
  const key = randomBytes(32).toString("hex");
  const envLine = `MESSAGE_SECRET=${key}\n`;
  writeFileSync(ENV_PATH, envLine, { flag: "a" });
  console.log("🔑 Clé de chiffrement générée dans .env");
  return key;
}

const SECRET = loadKey();

// Dérive une clé de 32 bytes à partir du secret + un "sel" fixe
// (en production : sel par message ou par utilisateur)
const KEY = scryptSync(SECRET, "minisocial-salt-v1", 32);

const ALGO = "aes-256-gcm";

/**
 * Chiffre du texte en clair → renvoie "iv:authTag:chiffre" en hex
 */
export function encrypt(plaintext) {
  const iv = randomBytes(16);        // 128 bits, unique par message
  const cipher = createCipheriv(ALGO, KEY, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Déchiffre "iv:authTag:chiffre" → texte en clair
 */
export function decrypt(ciphertext) {
  try {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(":");

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (err) {
    // Si le déchiffrement échaine (données corrompues ou clé changée)
    console.error("⚠️ Échec du déchiffrement:", err.message);
    return "[message corrompu]";
  }
}

/**
 * Vérifie si une valeur est chiffrée (format iv:tag:encrypted)
 */
export function isEncrypted(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
