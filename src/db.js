// ============================================================
// db.js — Module SQLite (better-sqlite3)
// ============================================================
// Crée/ouvre la base de données, initialise le schéma,
// et insère les données de test si la base est vide.
// ============================================================

import Database from "better-sqlite3";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ouvre (ou crée) le fichier social.db à la racine du projet
const db = new Database(join(__dirname, "social.db"));

// Mode WAL pour de meilleures performances en lecture concurrente
db.pragma("journal_mode = WAL");
// Activer les clés étrangères (comportement SQLite par défaut)
db.pragma("foreign_keys = ON");

// ============================================================
// SCHÉMA
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE,
    last_seen  TEXT    DEFAULT (datetime('now')),
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    author_id  INTEGER NOT NULL,
    image_url  TEXT,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    author_id  INTEGER NOT NULL,
    post_id    INTEGER NOT NULL,
    parent_id  INTEGER,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (author_id)  REFERENCES users(id) ON DELETE CASCADE,
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
    FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(sender_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    user_id    INTEGER NOT NULL,
    post_id    INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    creator_id INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    is_creator INTEGER DEFAULT 0,
    joined_at  TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    sender_id  INTEGER NOT NULL,
    group_id   INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id)  REFERENCES chat_groups(id) ON DELETE CASCADE
  );
`);

// ============================================================
// AUTH MIGRATION (idempotent)
// ============================================================
try { db.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''").run(); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    creator_id INTEGER NOT NULL,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS meeting_participants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    joined_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(meeting_id, user_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE
  );
`);
export default db;
