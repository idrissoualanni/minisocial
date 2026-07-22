// ============================================================
// crypto.ts — Chiffrement AES-256-GCM des messages
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = join(__dirname, "..", "..", ".env");

function loadKey(): string {
  if (process.env.MESSAGE_SECRET) return process.env.MESSAGE_SECRET;

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, "utf-8");
    const match = content.match(/^MESSAGE_SECRET=(.+)$/m);
    if (match) return match[1].trim();
  }

  const key = randomBytes(32).toString("hex");
  const envLine = `MESSAGE_SECRET=${key}\n`;
  writeFileSync(ENV_PATH, envLine, { flag: "a" });
  console.log("🔑 Clé de chiffrement générée dans .env");
  return key;
}

const SECRET: string = loadKey();
const KEY: Buffer = scryptSync(SECRET, "minisocial-salt-v1", 32);
const ALGO = "aes-256-gcm" as const;

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, KEY, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
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
    console.error("⚠️ Échec du déchiffrement:", (err as Error).message);
    return "[message corrompu]";
  }
}

export function isEncrypted(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
