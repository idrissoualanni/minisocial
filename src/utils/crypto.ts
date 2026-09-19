// ============================================================
// crypto.ts — Chiffrement AES-256-GCM des messages
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_HEX = process.env.MESSAGE_ENCRYPTION_KEY;
if (!KEY_HEX || KEY_HEX.length !== 64) {
  throw new Error('MESSAGE_ENCRYPTION_KEY doit contenir 64 caractères hex (32 bytes). Générer : openssl rand -hex 32');
}
const KEY = Buffer.from(KEY_HEX, 'hex');
const ALGO = "aes-256-gcm" as const;

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag().toString("base64");

  return `${iv.toString("base64")}:${authTag}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  try {
    const [ivB64, authTagB64, encrypted] = ciphertext.split(":");
    if (!ivB64 || !authTagB64 || !encrypted) return ciphertext; // legacy ou corrompu

    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    const decipher = createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(Buffer.from(encrypted, "base64"), undefined, "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (err) {
    console.error("⚠️ Échec du déchiffrement:", (err as Error).message);
    return ciphertext; // retourne brut si échec (ne jamais crasher)
  }
}

export function isEncrypted(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
