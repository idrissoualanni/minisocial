// ============================================================
// db.ts — Module SQLite (better-sqlite3)
// ============================================================

import Database, { type Database as DatabaseType } from "better-sqlite3";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db: DatabaseType = new Database(join(__dirname, "..", "social.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================================================
// SCHÉMA APPLICATION (tables métier)
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS app_users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ba_user_id  TEXT    UNIQUE,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    last_seen   TEXT    DEFAULT (datetime('now')),
    created_at  TEXT    DEFAULT (datetime('now')),
    bio         TEXT    DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    author_id  INTEGER NOT NULL,
    image_url  TEXT,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (author_id) REFERENCES app_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    author_id  INTEGER NOT NULL,
    post_id    INTEGER NOT NULL,
    parent_id  INTEGER,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (author_id)  REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id)    REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id)  REFERENCES comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT    NOT NULL,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    read        INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id)   REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES app_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending',
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id)   REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES app_users(id) ON DELETE CASCADE,
    UNIQUE(sender_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    user_id    INTEGER NOT NULL,
    post_id    INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    creator_id INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES app_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    is_creator INTEGER DEFAULT 0,
    joined_at  TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES app_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    sender_id  INTEGER NOT NULL,
    group_id   INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id)  REFERENCES chat_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    creator_id INTEGER NOT NULL,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES app_users(id)
  );

  CREATE TABLE IF NOT EXISTS meeting_participants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    joined_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(meeting_id, user_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES app_users(id) ON DELETE CASCADE
  );
`);

// ============================================================
// MIGRATION : users → app_users (idempotent)
// ============================================================
const tables: string[] = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);

if (tables.includes("users") && !tables.includes("app_users")) {
  console.log("🔄 Migration: users → app_users...");
  db.pragma("foreign_keys = OFF");
  db.exec(`ALTER TABLE users RENAME TO app_users;`);
  db.pragma("foreign_keys = ON");
  try { db.prepare("ALTER TABLE app_users ADD COLUMN ba_user_id TEXT UNIQUE").run(); } catch { /* column exists */ }
  db.exec(`DROP TABLE IF EXISTS refresh_tokens;`);
  console.log("✅ Migration terminée.");
} else if (tables.includes("users") && tables.includes("app_users")) {
  db.pragma("foreign_keys = OFF");
  db.exec(`DROP TABLE IF EXISTS users;`);
  db.exec(`DROP TABLE IF EXISTS refresh_tokens;`);
  db.pragma("foreign_keys = ON");
}

try { db.prepare("ALTER TABLE app_users ADD COLUMN ba_user_id TEXT UNIQUE").run(); } catch { /* column exists */ }

// ============================================================
// TYPES
// ============================================================
export interface AppUser {
  id: number;
  ba_user_id: string | null;
  name: string;
  email: string;
  last_seen: string;
  created_at: string;
  bio: string;
}

interface BaUser {
  id: string;
  name: string;
  email: string;
  bio?: string;
}

// ============================================================
// HELPER : Créer un app_users à partir d'un Better Auth user
// ============================================================
export function ensureAppUser(baUser: BaUser): AppUser {
  let appUser = db.prepare("SELECT * FROM app_users WHERE ba_user_id = ?").get(baUser.id) as AppUser | undefined;
  if (!appUser) {
    const result = db.prepare(
      "INSERT INTO app_users (ba_user_id, name, email, bio) VALUES (?, ?, ?, ?)"
    ).run(baUser.id, baUser.name, baUser.email, baUser.bio || "");
    appUser = db.prepare("SELECT * FROM app_users WHERE id = ?").get(result.lastInsertRowid) as AppUser;
  }
  return appUser;
}

export default db;
