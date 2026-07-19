# MiniSocial — Auth, Zustand, Zod, Tailwind, Rate Limiting, WebRTC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le mini-social network démo en application production-ready avec auth JWT, validation Zod, state Zustand, styling Tailwind, rate limiting, et appels WebRTC.

**Architecture:** Backend Express + Apollo Server v4 + SQLite. Frontend React 19 + Apollo Client + Zustand. Validation Zod partagée client/serveur. Auth JWT (access + refresh tokens). WebRTC P2P pour les réunions, signaling via GraphQL subscriptions.

**Tech Stack:** Zustand, Zod, bcrypt, jsonwebtoken, express-rate-limit, Tailwind CSS v4, WebRTC (native API)

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/middleware/auth.js` | JWT verification middleware + context extractor |
| `src/middleware/rateLimit.js` | Rate limiting configs (global, auth, chat) |
| `src/utils/validation.js` | Zod schemas shared between resolvers |
| `src/utils/tokens.js` | JWT sign/verify helpers (access + refresh) |
| `client/src/store.js` | Zustand store (auth, UI, toasts) |
| `client/src/pages/LoginPage.jsx` | Login form |
| `client/src/pages/RegisterPage.jsx` | Register form |
| `client/src/components/Meeting.jsx` | WebRTC meeting component |
| `client/src/components/MeetingControls.jsx` | Mic/cam/hangup controls |
| `client/tailwind.config.js` | Tailwind config |
| `client/src/index.css` | Tailwind directives (replaces old CSS imports) |

### Modified files
| File | Changes |
|------|---------|
| `package.json` | Add bcrypt, jsonwebtoken, express-rate-limit, zod |
| `client/package.json` | Add zustand, tailwindcss, @tailwindcss/vite |
| `src/schema/typeDefs.js` | Add auth types, meeting types, role field |
| `src/resolvers/resolvers.js` | Add auth resolvers, meeting resolvers, use Zod |
| `src/db.js` | Add password_hash, role, refresh_tokens columns |
| `src/server.js` | Add auth context, rate limiting, CORS auth headers |
| `client/src/apollo.js` | Add auth link (Bearer token header) |
| `client/src/App.jsx` | Zustand for state, protected routes, routing |
| `client/src/main.jsx` | Wrap with Zustand provider if needed |
| `client/src/components/Header.jsx` | Show logged user, logout button |
| `client/src/components/Sidebar.jsx` | Remove user select (auth replaces it) |
| `client/src/components/Feed.jsx` | Use currentUser from Zustand |
| `client/src/components/PostCard.jsx` | Use currentUser from Zustand |
| `client/src/components/Composer.jsx` | Use currentUser from Zustand |
| `client/src/components/Chat.jsx` | Use currentUser from Zustand |
| `client/src/components/ChatLobby.jsx` | Use currentUser from Zustand |
| `client/src/components/GroupChat.jsx` | Use currentUser from Zustand |
| `client/src/components/Profile.jsx` | Use currentUser from Zustand |
| `client/src/components/Search.jsx` | Use currentUser from Zustand |
| `client/src/components/CreateGroup.jsx` | Use currentUser from Zustand |
| `client/src/components/Toast.jsx` | Use Zustand toast state |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json` (root)
- Modify: `client/package.json`

- [ ] **Step 1: Install backend dependencies**

```bash
cd C:\Users\hp\Desktop\testgrahpql
npm install bcrypt jsonwebtoken express-rate-limit zod
```

- [ ] **Step 2: Install frontend dependencies**

```bash
cd C:\Users\hp\Desktop\testgrahpql\client
npm install zustand
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Verify installations**

```bash
# Root
node -e "require('bcrypt'); require('jsonwebtoken'); require('express-rate-limit'); require('zod'); console.log('Backend deps OK')"
# Client
node -e "require('zustand'); console.log('Zustand OK')"
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "deps: add auth, zod, zustand, tailwind, rate-limit packages"
```

---

## Task 2: Zod Validation Schemas (shared)

**Files:**
- Create: `src/utils/validation.js`

- [ ] **Step 1: Create Zod schemas**

```js
// src/utils/validation.js
import { z } from "zod";

// --- Auth ---
export const RegisterSchema = z.object({
  name: z.string().min(2, "Le nom doit avoir au moins 2 caractères").max(50),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit avoir au moins 6 caractères").max(128),
});

export const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

// --- Posts ---
export const CreatePostSchema = z.object({
  title: z.string().min(1, "Titre requis").max(120),
  content: z.string().min(1, "Contenu requis").max(5000),
  authorId: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
});

export const UpdatePostSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(5000).optional(),
  imageUrl: z.string().nullable().optional(),
});

// --- Comments ---
export const AddCommentSchema = z.object({
  text: z.string().min(1, "Commentaire vide").max(2000),
  authorId: z.string().min(1),
  postId: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

// --- Chat ---
export const SendMessageSchema = z.object({
  text: z.string().min(1, "Message vide").max(5000),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
});

// --- Meetings ---
export const CreateMeetingSchema = z.object({
  title: z.string().min(1).max(100),
  creatorId: z.string().min(1),
});

export const JoinMeetingSchema = z.object({
  meetingId: z.string().min(1),
  userId: z.string().min(1),
});

// --- User ---
export const UpdateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
});

// Helper: lance une erreur GraphQL si la validation échoue
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.errors.map((e) => e.message).join(", ");
    throw new Error(msg);
  }
  return result.data;
}
```

- [ ] **Step 2: Test schemas**

```bash
node -e "
import { validate, RegisterSchema } from './src/utils/validation.js';
try { validate(RegisterSchema, { name: 'A', email: 'bad', password: '1' }); }
catch(e) { console.log('Caught:', e.message); }
try { validate(RegisterSchema, { name: 'Alice', email: 'a@b.com', password: '123456' }); console.log('Valid OK'); }
catch(e) { console.log('FAIL:', e.message); }
"
```

Expected: `Caught: Le nom doit avoir au moins 2 caractères, Email invalide, Le mot de passe doit avoir au moins 6 caractères` then `Valid OK`

- [ ] **Step 3: Commit**

```bash
git add src/utils/validation.js
git commit -m "feat: add Zod validation schemas for all inputs"
```

---

## Task 3: JWT Token Helpers

**Files:**
- Create: `src/utils/tokens.js`

- [ ] **Step 1: Create token utilities**

```js
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
  return jwt.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}
```

- [ ] **Step 2: Add JWT secrets to .env**

Append to `.env`:
```
JWT_ACCESS_SECRET=minisocial-access-dev-change-in-prod
JWT_REFRESH_SECRET=minisocial-refresh-dev-change-in-prod
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/tokens.js .env
git commit -m "feat: add JWT access/refresh token helpers"
```

---

## Task 4: Database Schema Migration (Auth columns)

**Files:**
- Modify: `src/db.js`

- [ ] **Step 1: Add auth columns to users table + refresh_tokens table**

In `src/db.js`, after the existing schema creation, add migration statements. The key change is adding `password_hash TEXT`, `role TEXT DEFAULT 'user'` to the users table, and creating a `refresh_tokens` table.

Since SQLite doesn't support `ALTER TABLE ADD COLUMN IF NOT EXISTS`, use a try/catch pattern:

```js
// --- Auth migration (idempotent) ---
const addPasswordHash = db.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT");
const addRole = db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
try { addPasswordHash.run(); } catch {}
try { addRole.run(); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
```

- [ ] **Step 2: Delete existing DB to test clean migration**

```bash
rm -f src/social.db src/social.db-shm src/social.db-wal
node -e "import './src/db.js'; console.log('DB migrated OK')"
```

Expected: DB recreated with auth columns.

- [ ] **Step 3: Commit**

```bash
git add src/db.js
git commit -m "feat: add password_hash, role columns and refresh_tokens table"
```

---

## Task 5: Auth Middleware

**Files:**
- Create: `src/middleware/auth.js`

- [ ] **Step 1: Create auth context extractor**

```js
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
  // Le token peut être dans les connectionParams
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
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/auth.js
git commit -m "feat: add JWT auth middleware for HTTP and WebSocket"
```

---

## Task 6: Rate Limiting

**Files:**
- Create: `src/middleware/rateLimit.js`

- [ ] **Step 1: Create rate limit configs**

```js
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

// Auth: 10 tentatives / 15 min par IP (login + register)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez dans 15 minutes." },
});

// Chat: 60 messages / 15 min par utilisateur
export const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Limite de messages atteinte." },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/rateLimit.js
git commit -m "feat: add rate limiting (global, auth, chat)"
```

---

## Task 7: Auth Resolvers + Meeting Resolvers + TypeDefs Update

**Files:**
- Modify: `src/schema/typeDefs.js`
- Modify: `src/resolvers/resolvers.js`

- [ ] **Step 1: Update typeDefs — add auth types, meeting types, role field**

Add to the `User` type:
```graphql
type User {
  id: ID!
  name: String!
  email: String!
  role: String!
  isOnline: Boolean!
  posts: [Post!]!
  postCount: Int!
}
```

Add auth types:
```graphql
type AuthPayload {
  accessToken: String!
  refreshToken: String!
  user: User!
}

type Meeting {
  id: ID!
  title: String!
  creator: User!
  participants: [User!]!
  isActive: Boolean!
  createdAt: String
}

type MeetingSignal {
  type: String!
  fromUserId: ID!
  toUserId: ID!
  meetingId: ID!
  payload: String
}
```

Add to Query:
```graphql
  me: User
  refreshAccessToken(refreshToken: String!): AuthPayload!
  meetings: [Meeting!]!
  meeting(id: ID!): Meeting
```

Add to Mutation:
```graphql
  register(name: String!, email: String!, password: String!): AuthPayload!
  login(email: String!, password: String!): AuthPayload!
  logout(refreshToken: String!): Boolean!
  createMeeting(title: String!): Meeting!
  joinMeeting(meetingId: ID!): Meeting!
  leaveMeeting(meetingId: ID!): Boolean!
  sendMeetingSignal(meetingId: ID!, toUserId: ID!, type: String!, payload: String): Boolean!
```

Add to Subscription:
```graphql
  meetingSignal(meetingId: ID!): MeetingSignal!
  meetingUpdated(meetingId: ID!): Meeting!
```

- [ ] **Step 2: Add auth + meeting resolvers**

In `src/resolvers/resolvers.js`, add:

```js
import bcrypt from "bcrypt";
import { validate, RegisterSchema, LoginSchema, CreateMeetingSchema } from "../utils/validation.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";

// Add to EVENTS:
MEETING_SIGNAL: "MEETING_SIGNAL",
MEETING_UPDATED: "MEETING_UPDATED",

// Add prepared statements:
const insertUserAuth = db.prepare(
  "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')"
);
const userByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const insertRefreshToken = db.prepare(
  "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
);
const deleteRefreshToken = db.prepare("DELETE FROM refresh_tokens WHERE token = ?");
const insertMeeting = db.prepare(
  "INSERT INTO meetings (title, creator_id) VALUES (?, ?)"
);
const meetingById = db.prepare("SELECT * FROM meetings WHERE id = ?");
const insertMeetingParticipant = db.prepare(
  "INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)"
);
const meetingParticipants = db.prepare(
  "SELECT u.* FROM users u JOIN meeting_participants mp ON u.id = mp.user_id WHERE mp.meeting_id = ?"
);
const updateMeetingActive = db.prepare("UPDATE meetings SET is_active = ? WHERE id = ?");
```

Resolver implementations:

```js
Query: {
  // ... existing queries ...
  me: (_, __, { user }) => {
    if (!user) throw new Error("Non authentifié");
    return user;
  },
  refreshAccessToken: (_, { refreshToken }) => {
    const payload = verifyRefreshToken(refreshToken);
    const user = stmts.userById.get(payload.sub);
    if (!user) throw new Error("Utilisateur introuvable");
    return {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user,
    };
  },
  meetings: () => {
    return db.prepare("SELECT * FROM meetings WHERE is_active = 1").all();
  },
  meeting: (_, { id }) => meetingById.get(id),
},

Mutation: {
  register: (_, args) => {
    const data = validate(RegisterSchema, args);
    const existing = userByEmail.get(data.email);
    if (existing) throw new Error("Cet email est déjà utilisé");
    const hash = bcrypt.hashSync(data.password, 10);
    const result = insertUserAuth.run(data.name, data.email, hash);
    const user = stmts.userById.get(result.lastInsertRowid);
    return {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user,
    };
  },
  login: (_, args) => {
    const data = validate(LoginSchema, args);
    const user = userByEmail.get(data.email);
    if (!user || !bcrypt.compareSync(data.password, user.password_hash)) {
      throw new Error("Email ou mot de passe incorrect");
    }
    return {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user,
    };
  },
  logout: (_, { refreshToken }) => {
    deleteRefreshToken.run(refreshToken);
    return true;
  },
  createMeeting: (_, args, { user }) => {
    if (!user) throw new Error("Non authentifié");
    const data = validate(CreateMeetingSchema, { ...args, creatorId: String(user.id) });
    const result = insertMeeting.run(data.title, user.id);
    insertMeetingParticipant.run(result.lastInsertRowid, user.id);
    return meetingById.get(result.lastInsertRowid);
  },
  joinMeeting: (_, { meetingId }, { user }) => {
    if (!user) throw new Error("Non authentifié");
    insertMeetingParticipant.run(meetingId, user.id);
    pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meetingById.get(meetingId) });
    return meetingById.get(meetingId);
  },
  leaveMeeting: (_, { meetingId }, { user }) => {
    if (!user) throw new Error("Non authentifié");
    db.prepare("DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?").run(meetingId, user.id);
    pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meetingById.get(meetingId) });
    return true;
  },
  sendMeetingSignal: (_, { meetingId, toUserId, type, payload }, { user }) => {
    if (!user) throw new Error("Non authentifié");
    pubsub.publish(EVENTS.MEETING_SIGNAL, {
      meetingSignal: {
        meetingId,
        fromUserId: String(user.id),
        toUserId,
        type,
        payload: payload || null,
      },
    });
    return true;
  },
},

Subscription: {
  meetingSignal: {
    subscribe: (_, { meetingId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      return pubsub.asyncIterableIterator([EVENTS.MEETING_SIGNAL]);
    },
  },
  meetingUpdated: {
    subscribe: (_, { meetingId }) => {
      return pubsub.asyncIterableIterator([EVENTS.MEETING_UPDATED]);
    },
  },
},
```

- [ ] **Step 3: Add meetings table to db.js**

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    creator_id INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS meeting_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(meeting_id, user_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
```

- [ ] **Step 4: Test auth**

```bash
# Register
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query":"mutation { register(name:\"TestUser\", email:\"test@test.com\", password:\"123456\") { accessToken refreshToken user { id name role } } }"}' | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.errors ? 'FAIL: '+j.errors[0].message : 'Register OK: user='+j.data.register.user.name+' role='+j.data.register.user.role)"

# Login
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query":"mutation { login(email:\"test@test.com\", password:\"123456\") { accessToken user { id name } } }"}' | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.errors ? 'FAIL: '+j.errors[0].message : 'Login OK')"
```

- [ ] **Step 5: Commit**

```bash
git add src/schema/typeDefs.js src/resolvers/resolvers.js src/db.js
git commit -m "feat: add auth resolvers (register/login/logout), meeting resolvers, Zod validation"
```

---

## Task 8: Server Auth Integration + Rate Limiting

**Files:**
- Modify: `src/server.js`

- [ ] **Step 1: Integrate auth context + rate limiting into server.js**

Add imports:
```js
import { contextFn } from "./middleware/auth.js";
import { globalLimiter } from "./middleware/rateLimit.js";
```

Add rate limiter before GraphQL endpoint:
```js
app.use("/graphql", globalLimiter);
```

Update Apollo Server HTTP middleware to include context:
```js
app.use(
  "/graphql",
  cors({ origin: ["http://localhost:5173", "http://localhost:4000"], credentials: true }),
  express.json({ limit: "10mb" }),
  expressMiddleware(server, { context: contextFn })
);
```

Update WS server to include auth context:
```js
const serverCleanup = useServer(
  {
    schema,
    context: async (ctx) => {
      const token = ctx.connectionParams?.authorization;
      if (!token?.startsWith("Bearer ")) return { user: null };
      try {
        const { verifyAccessToken } = await import("./utils/tokens.js");
        const userById = db.prepare("SELECT * FROM users WHERE id = ?");
        const payload = verifyAccessToken(token.slice(7));
        return { user: userById.get(payload.sub) || null };
      } catch {
        return { user: null };
      }
    },
  },
  wsServer
);
```

- [ ] **Step 2: Test server starts cleanly**

```bash
# Kill existing server, restart
node src/server.js &
ping -n 3 127.0.0.1 >nul
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query":"{ users { id } }"}' | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.errors?'FAIL':'OK')"
```

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "feat: integrate auth context and rate limiting into server"
```

---

## Task 9: Zustand Store

**Files:**
- Create: `client/src/store.js`

- [ ] **Step 1: Create Zustand store**

```js
// client/src/store.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useStore = create(
  persist(
    (set, get) => ({
      // --- Auth ---
      currentUser: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, access, refresh) =>
        set({ currentUser: user, accessToken: access, refreshToken: refresh }),

      logout: () => {
        const { refreshToken } = get();
        // Best-effort server-side logout
        if (refreshToken) {
          fetch("http://localhost:4000/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `mutation { logout(refreshToken: "${refreshToken}") }`,
            }),
          }).catch(() => {});
        }
        set({ currentUser: null, accessToken: null, refreshToken: null });
      },

      updateProfile: (updates) =>
        set((state) => ({
          currentUser: state.currentUser ? { ...state.currentUser, ...updates } : null,
        })),

      // --- UI ---
      view: "feed",
      setView: (view) => set({ view }),

      chatTarget: null,
      groupTarget: null,
      profileUser: null,

      openChat: (user) => set({ chatTarget: user, groupTarget: null, view: "chat" }),
      openGroupChat: (group) => set({ groupTarget: group, chatTarget: null, view: "chat" }),
      openProfile: (user) => set({ profileUser: user, view: "profile" }),
      closeChat: () => set({ chatTarget: null, groupTarget: null }),

      // --- Toast ---
      toast: null,
      showToast: (msg, type = "success") => {
        set({ toast: { msg, type } });
        setTimeout(() => set({ toast: null }), 3000);
      },
    }),
    {
      name: "minisocial-store",
      partialize: (state) => ({
        currentUser: state.currentUser,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

export default useStore;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/store.js
git commit -m "feat: add Zustand store with auth, UI, and toast state"
```

---

## Task 10: Apollo Client Auth Link

**Files:**
- Modify: `client/src/apollo.js`

- [ ] **Step 1: Add auth link that injects Bearer token**

```js
// client/src/apollo.js
import { ApolloClient, InMemoryCache, split, HttpLink, ApolloLink } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { GRAPHQL_HTTP, GRAPHQL_WS } from "./config";
import useStore from "./store";

// Auth link: injecte le token dans chaque requête HTTP
const authLink = new ApolloLink((operation, forward) => {
  const token = useStore.getState().accessToken;
  operation.setContext(({ headers = {} }) => ({
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  }));
  return forward(operation);
});

// HTTP link
const httpLink = new HttpLink({ uri: GRAPHQL_HTTP });

// WebSocket link (token via connectionParams)
const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS,
    shouldRetry: () => true,
    retryAttempts: Infinity,
    connectionParams: () => {
      const token = useStore.getState().accessToken;
      return { authorization: token ? `Bearer ${token}` : "" };
    },
  })
);

// Split
const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === "OperationDefinition" && def.operation === "subscription";
  },
  wsLink,
  authLink.concat(httpLink)
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  connectToDevTools: true,
});

export default client;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/apollo.js
git commit -m "feat: add auth link to Apollo Client for Bearer token injection"
```

---

## Task 11: Auth Pages (Login + Register)

**Files:**
- Create: `client/src/pages/LoginPage.jsx`
- Create: `client/src/pages/RegisterPage.jsx`

- [ ] **Step 1: Create LoginPage**

```jsx
// client/src/pages/LoginPage.jsx
import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";

const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken refreshToken
      user { id name email role }
    }
  }
`;

export default function LoginPage({ onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((s) => s.setAuth);
  const showToast = useStore((s) => s.showToast);

  const [login] = useMutation(LOGIN);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await login({ variables: { email, password } });
      setAuth(data.login.user, data.login.accessToken, data.login.refreshToken);
      showToast(`Bienvenue ${data.login.user.name} !`);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Connexion</h1>
        <p className="auth-subtitle">Connecte-toi à MiniSocial</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <p className="auth-switch">
          Pas de compte ? <button onClick={onSwitchToRegister}>Créer un compte</button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RegisterPage**

```jsx
// client/src/pages/RegisterPage.jsx
import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";

const REGISTER = gql`
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      accessToken refreshToken
      user { id name email role }
    }
  }
`;

export default function RegisterPage({ onSwitchToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((s) => s.setAuth);
  const showToast = useStore((s) => s.showToast);

  const [register] = useMutation(REGISTER);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Le mot de passe doit avoir au moins 6 caractères"); return; }
    setLoading(true);
    try {
      const { data } = await register({ variables: { name, email, password } });
      setAuth(data.register.user, data.register.accessToken, data.register.refreshToken);
      showToast(`Bienvenue ${data.register.user.name} !`);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Créer un compte</h1>
        <p className="auth-subtitle">Rejoins MiniSocial</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Mot de passe (6+ caractères)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Création..." : "Créer mon compte"}
          </button>
        </form>
        <p className="auth-switch">
          Déjà un compte ? <button onClick={onSwitchToLogin}>Se connecter</button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/
git commit -m "feat: add Login and Register pages with form validation"
```

---

## Task 12: Refactor App.jsx — Zustand + Auth Routing

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Rewrite App.jsx with Zustand + auth gating**

```jsx
// client/src/App.jsx
import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "./store";
import Header from "./components/Header";
import Feed from "./components/Feed";
import ChatLobby from "./components/ChatLobby";
import Chat from "./components/Chat";
import GroupChat from "./components/GroupChat";
import Profile from "./components/Profile";
import Search from "./components/Search";
import Toast from "./components/Toast";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { useNotificationSetup } from "./hooks/useNotifications";
import { useHeartbeat } from "./hooks/useHeartbeat";

const GET_USERS = gql`
  query GetUsers {
    users { id name email postCount isOnline }
  }
`;

export default function App() {
  const currentUser = useStore((s) => s.currentUser);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const chatTarget = useStore((s) => s.chatTarget);
  const groupTarget = useStore((s) => s.groupTarget);
  const profileUser = useStore((s) => s.profileUser);
  const toast = useStore((s) => s.toast);
  const closeChat = useStore((s) => s.closeChat);

  const [authView, setAuthView] = useState("login"); // "login" | "register"

  useNotificationSetup();
  useHeartbeat(currentUser);

  const { data } = useQuery(GET_USERS, { skip: !currentUser });
  const users = data?.users || [];

  // --- Non authentifié ---
  if (!currentUser) {
    return (
      <>
        {authView === "login" ? (
          <LoginPage onSwitchToRegister={() => setAuthView("register")} />
        ) : (
          <RegisterPage onSwitchToLogin={() => setAuthView("login")} />
        )}
        {toast && <Toast message={toast.msg} type={toast.type} />}
      </>
    );
  }

  // --- Authentifié ---
  return (
    <div className="app">
      <Header />

      {view === "feed" && (
        <div className="layout">
          <main className="main-col">
            <Feed />
          </main>
          <aside className="sidebar">
            <Sidebar />
          </aside>
        </div>
      )}

      {view === "search" && (
        <div className="layout">
          <main className="main-col">
            <Search />
          </main>
          <aside className="sidebar">
            <Sidebar />
          </aside>
        </div>
      )}

      {view === "chat" && (
        <div className="chat-page">
          {groupTarget ? (
            <GroupChat />
          ) : chatTarget ? (
            <Chat />
          ) : (
            <ChatLobby />
          )}
        </div>
      )}

      {view === "profile" && profileUser && <Profile />}

      {view === "meeting" && <Meeting />}

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}
```

**Note:** Les composants enfant (Feed, Chat, etc.) doivent être refactorisés pour lire `currentUser` depuis Zustand au lieu de le recevoir en props. Voir Task 13.

- [ ] **Step 2: Commit**

```bash
git add client/src/App.jsx
git commit -m "refactor: App.jsx uses Zustand store, auth gating, protected routes"
```

---

## Task 13: Refactor Components — Zustand Props Removal

**Files:**
- Modify: All 15 components in `client/src/components/`
- Modify: `client/src/hooks/useHeartbeat.js`

- [ ] **Step 1: Refactor each component**

For each component that receives `currentUser` as a prop, replace with:
```js
import useStore from "../store";
// Inside component:
const currentUser = useStore((s) => s.currentUser);
const showToast = useStore((s) => s.showToast);
const openProfile = useStore((s) => s.openProfile);
const openChat = useStore((s) => s.openChat);
```

Remove `currentUser`, `showToast`, `onOpenProfile`, `onOpenChat` from props interfaces.

**Components to refactor:**
- `Feed.jsx` — remove `currentUser`, `showToast`, `onOpenProfile` props
- `PostCard.jsx` — remove `currentUser`, `showToast`, `onOpenProfile` props
- `Composer.jsx` — remove `currentUser`, `onPublish` prop (use store)
- `Sidebar.jsx` — remove `currentUser`, `onUserSelect`, `showToast`, `onOpenProfile` props
- `Search.jsx` — remove `currentUser`, `showToast`, `onOpenProfile` props
- `Profile.jsx` — remove `user`, `currentUser`, `onBack`, `showToast`, `onOpenProfile` props. Use `profileUser` from store.
- `ChatLobby.jsx` — remove `currentUser`, `onOpenChat`, `showToast`, `onOpenProfile` props
- `Chat.jsx` — remove `currentUser`, `users`, `targetUser`, `onBack`, `showToast`, `onOpenProfile` props. Use `chatTarget` from store.
- `GroupChat.jsx` — remove `group`, `currentUser`, `onBack`, `showToast`, `onOpenProfile` props. Use `groupTarget` from store.
- `CreateGroup.jsx` — remove props, use store
- `Header.jsx` — remove props, use store for currentUser, view, setView, logout
- `Toast.jsx` — remove props, use store for toast
- `useHeartbeat.js` — accept null user, read from store if needed

- [ ] **Step 2: Build and fix any errors**

```bash
cd client && npm run build 2>&1
```

Fix any import or prop errors until build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ client/src/hooks/
git commit -m "refactor: all components read from Zustand store, remove prop drilling"
```

---

## Task 14: Tailwind CSS Setup

**Files:**
- Modify: `client/vite.config.js`
- Create: `client/src/index.css` (replace existing)
- Modify: `client/src/main.jsx`
- Create: `tailwind.config.js` (optional for v4)

- [ ] **Step 1: Configure Vite for Tailwind v4**

```js
// client/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 2: Replace index.css with Tailwind directives**

```css
/* client/src/index.css */
@import "tailwindcss";

/* Custom theme tokens */
@theme {
  --color-primary: #f59e0b;
  --color-primary-dark: #d97706;
  --color-bg: #fafaf9;
  --color-bg-card: #ffffff;
  --color-text: #1c1917;
  --color-text-muted: #78716c;
  --color-border: #e7e5e4;
  --color-error: #ef4444;
  --color-success: #22c55e;
}
```

- [ ] **Step 3: Update main.jsx to import index.css instead of App.css**

```jsx
// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ApolloProvider } from "@apollo/client/react";
import client from "./apollo";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <ApolloProvider client={client}>
    <App />
  </ApolloProvider>
);
```

- [ ] **Step 4: Start migrating one component (Header) as proof of concept**

Replace Header.jsx CSS classes with Tailwind utility classes. Keep App.css as fallback for non-migrated components.

- [ ] **Step 5: Build**

```bash
cd client && npm run build 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add client/vite.config.js client/src/index.css client/src/main.jsx client/src/components/Header.jsx
git commit -m "feat: setup Tailwind CSS v4, migrate Header component"
```

---

## Task 15: Tailwind Migration (Remaining Components)

**Files:**
- Modify: All components (progressive migration)
- Delete: `client/src/App.css` (once fully migrated)

- [ ] **Step 1-N: Migrate each component one by one**

For each component:
1. Replace CSS class names with Tailwind utility classes
2. Remove component-specific CSS from App.css
3. Build and verify

**Migration order (simple → complex):**
1. Toast.jsx
2. UploadImage.jsx
3. ImageCropModal.jsx
4. CommentItem.jsx
5. Composer.jsx
6. Sidebar.jsx
7. Search.jsx
8. Profile.jsx
9. Feed.jsx
10. PostCard.jsx
11. ChatLobby.jsx
12. Chat.jsx
13. GroupChat.jsx
14. CreateGroup.jsx
15. Header.jsx (already done)

**After all migrated:** Delete `App.css` and remove the import from `App.jsx`.

- [ ] **Step: Final build + verify**

```bash
cd client && npm run build 2>&1
```

- [ ] **Step: Commit**

```bash
git add -A
git commit -m "feat: complete Tailwind CSS migration, delete App.css"
```

---

## Task 16: WebRTC Meeting Component

**Files:**
- Create: `client/src/components/Meeting.jsx`
- Create: `client/src/components/MeetingControls.jsx`

- [ ] **Step 1: Create MeetingControls (mute/camera/hangup)**

```jsx
// client/src/components/MeetingControls.jsx
import useStore from "../store";

export default function MeetingControls({ onToggleMic, onToggleCam, onHangup, isMuted, isCamOff }) {
  const showToast = useStore((s) => s.showToast);

  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-gray-900 rounded-b-xl">
      <button
        onClick={onToggleMic}
        className={`p-3 rounded-full transition ${isMuted ? "bg-red-500 text-white" : "bg-gray-700 text-white hover:bg-gray-600"}`}
        title={isMuted ? "Activer le micro" : "Couper le micro"}
      >
        {isMuted ? "🔇" : "🎤"}
      </button>
      <button
        onClick={onToggleCam}
        className={`p-3 rounded-full transition ${isCamOff ? "bg-red-500 text-white" : "bg-gray-700 text-white hover:bg-gray-600"}`}
        title={isCamOff ? "Activer la caméra" : "Couper la caméra"}
      >
        {isCamOff ? "📷" : "📹"}
      </button>
      <button
        onClick={onHangup}
        className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition"
        title="Quitter la réunion"
      >
        📞
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create Meeting component with WebRTC + GraphQL signaling**

```jsx
// client/src/components/Meeting.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useSubscription } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";
import MeetingControls from "./MeetingControls";

const LEAVE_MEETING = gql`
  mutation LeaveMeeting($meetingId: ID!) { leaveMeeting(meetingId: $meetingId) }
`;

const SEND_SIGNAL = gql`
  mutation SendSignal($meetingId: ID!, $toUserId: ID!, $type: String!, $payload: String) {
    sendMeetingSignal(meetingId: $meetingId, toUserId: $toUserId, type: $type, payload: $payload)
  }
`;

const SIGNAL_SUB = gql`
  subscription OnMeetingSignal($meetingId: ID!) {
    meetingSignal(meetingId: $meetingId) {
      meetingId fromUserId toUserId type payload
    }
  }
`;

const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function Meeting({ meeting }) {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const setView = useStore((s) => s.setView);

  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [peers, setPeers] = useState(new Map()); // userId -> { stream, pc }

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const pcsRef = useRef({}); // userId -> RTCPeerConnection

  const [leaveMeeting] = useMutation(LEAVE_MEETING);
  const [sendSignal] = useMutation(SEND_SIGNAL);

  // Get local media
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      })
      .catch(() => showToast("Impossible d'accéder à la caméra/micro", "error"));
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Create peer connection for a remote user
  const createPeer = useCallback((remoteUserId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[remoteUserId] = pc;

    // Add local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    // On remote stream
    pc.ontrack = (e) => {
      setPeers((prev) => new Map(prev).set(remoteUserId, e.streams[0]));
    };

    // On ICE candidate → send signal
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({
          variables: {
            meetingId: meeting.id,
            toUserId: remoteUserId,
            type: "ice-candidate",
            payload: JSON.stringify(e.candidate),
          },
        });
      }
    };

    return pc;
  }, [meeting.id, sendSignal]);

  // Handle incoming signals
  useSubscription(SIGNAL_SUB, {
    variables: { meetingId: meeting.id },
    onData: async ({ data: { data } }) => {
      const sig = data?.meetingSignal;
      if (!sig || sig.fromUserId === String(currentUser.id)) return;

      if (sig.type === "offer") {
        const pc = createPeer(sig.fromUserId);
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sig.payload)));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          variables: {
            meetingId: meeting.id,
            toUserId: sig.fromUserId,
            type: "answer",
            payload: JSON.stringify(answer),
          },
        });
      } else if (sig.type === "answer") {
        const pc = pcsRef.current[sig.fromUserId];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sig.payload)));
      } else if (sig.type === "ice-candidate") {
        const pc = pcsRef.current[sig.fromUserId];
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(sig.payload)));
      }
    },
  });

  // Hangup
  const handleHangup = async () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    await leaveMeeting({ variables: { meetingId: meeting.id } });
    setView("chat");
    showToast("Réunion terminée");
  };

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    setIsMuted(!isMuted);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = isCamOff; });
    setIsCamOff(!isCamOff);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">🎥 {meeting.title}</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <p className="text-white text-sm p-2">Toi ({currentUser.name})</p>
        </div>
        {Array.from(peers.entries()).map(([userId, stream]) => (
          <RemoteVideo key={userId} userId={userId} stream={stream} />
        ))}
      </div>
      <MeetingControls
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onHangup={handleHangup}
        isMuted={isMuted}
        isCamOff={isCamOff}
      />
    </div>
  );
}

function RemoteVideo({ userId, stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      <p className="text-white text-sm p-2">Utilisateur #{userId}</p>
    </div>
  );
}
```

- [ ] **Step 3: Add Meeting to App.jsx view routing**

In App.jsx, add:
```jsx
import Meeting from "./components/Meeting";
// ...
{view === "meeting" && <Meeting meeting={meetingTarget} />}
```

Add `meetingTarget` to Zustand store:
```js
meetingTarget: null,
openMeeting: (meeting) => set({ meetingTarget: meeting, view: "meeting" }),
```

- [ ] **Step 4: Build**

```bash
cd client && npm run build 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Meeting.jsx client/src/components/MeetingControls.jsx client/src/store.js client/src/App.jsx
git commit -m "feat: add WebRTC meeting component with signaling via GraphQL subscriptions"
```

---

## Task 17: Final Integration Test

- [ ] **Step 1: Delete DB, restart server, test full flow**

```bash
rm -f src/social.db src/social.db-shm src/social.db-wal
node src/server.js &
ping -n 3 127.0.0.1 >nul
```

Test sequence:
1. Register → login → get JWT
2. Create post with JWT in header
3. Like, comment (verify auth required)
4. Rate limit test (rapid requests)
5. Create meeting
6. Verify WebSocket connection with auth

- [ ] **Step 2: Full curl test**

```bash
# Register
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query":"mutation{register(name:\"Alice\",email:\"alice@test.com\",password:\"123456\"){accessToken user{id name role}}}"}' > /tmp/auth.json

# Extract token
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/auth.json')).data.register.accessToken)")

# Authenticated request
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"query":"{me{id name role}}"}' | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.errors?'FAIL: '+j.errors[0].message:'me(): '+j.data.me.name+' role='+j.data.me.role)"

# Unauthenticated → should fail
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query":"{me{id name}}"}' | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.errors?'Auth gate OK: '+j.errors[0].message:'FAIL: should be blocked')"
```

- [ ] **Step 3: Update MEMORY.md**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete auth stack, Zustand, Zod, rate limiting, WebRTC meetings"
```
