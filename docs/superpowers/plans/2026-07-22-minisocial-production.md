# MiniSocial Production Migration — Plan d'Implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer MiniSocial de JS/SQLite vers une stack production-ready (TypeScript, PostgreSQL, Redis, shadcn/ui, TanStack Query) avec déploiement gratuit.

**Architecture:** Frontend React 19 + Vite + shadcn/ui sur Vercel. Backend Express + Apollo + Drizzle ORM sur Railway. PostgreSQL + Redis managés. Images sur Cloudflare R2.

**Tech Stack:** TypeScript, React 19, Vite, shadcn/ui, Tailwind CSS v4, TanStack Query v5, graphql-request, Vitest, Playwright, Drizzle ORM, PostgreSQL, Upstash Redis, Express, Apollo Server, Better Auth, Cloudflare R2.

**Contraintes:** Plans gratuits uniquement (Vercel Hobby, Railway $5 trial, Upstash free tier, Cloudflare R2 free tier).

---

## RÈGLES OBLIGATOIRES

### Règle 1 — Vérification de code obligatoire
Après **chaque** étape de modification de code, on lance la vérification correspondante :
- **Frontend TS** : `npx tsc --noEmit` dans `client/`
- **Backend TS** : `npx tsc --noEmit` dans `./`
- **Build** : `npm run build` dans `client/`
- **Test** : `npx vitest run` ou `npx playwright test`
- **Commit** : on ne commit que si la vérification passe

### Règle 2 — Tâches atomiques
Chaque étape modifie **un seul fichier** ou **un seul aspect** du projet. Durée cible : 2-5 minutes. Si une étape échoue, on corrige avant de passer à la suivante.

### Règle 3 — Pas de régression
Si une vérification échoue, on résout le problème avant toute tâche suivante. Jamais de "on fixera plus tard".

---

## PHASE 1 — TypeScript Frontend (client/)

### Task 1.1 : Installer TypeScript + dépendances types

- [ ] **Step 1** : Installer TypeScript et types React dans `client/`

```bash
cd client && npm install -D typescript @types/react @types/react-dom
```

- [ ] **Step 2** : Vérifier l'installation

```bash
cd client && npx tsc --version
```
Attendu : `Version 5.x.x`

- [ ] **Step 3** : Commit

```bash
git add client/package.json client/package-lock.json
git commit -m "deps(client): add TypeScript + React types"
```

---

### Task 1.2 : Créer `tsconfig.json` pour le client

- [ ] **Step 1** : Créer `client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 2** : Vérifier que `tsc` ne plante pas sur les fichiers existants (il y aura des erreurs, c'est normal — on les fixe dans les steps suivantes)

```bash
cd client && npx tsc --noEmit 2>&1 | head -20
```
Attendu : des erreurs (fichiers JS pas encore renommés) — on avance.

- [ ] **Step 3** : Commit

```bash
git add client/tsconfig.json
git commit -m "config(client): add tsconfig.json strict mode"
```

---

### Task 1.3 : Créer `vite-env.d.ts` pour les types Vite

- [ ] **Step 1** : Créer `client/src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 2** : Commit

```bash
git add client/src/vite-env.d.ts
git commit -m "types(client): add Vite env declaration"
```

---

### Task 1.4 : Ajouter `@/` path alias dans Vite config

- [ ] **Step 1** : Lire `client/vite.config.js`

- [ ] **Step 2** : Ajouter l'alias `@` dans `resolve.alias`

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/auth': 'http://localhost:3000',
      '/graphql': 'http://localhost:3000',
    },
  },
})
```

- [ ] **Step 3** : Vérifier le build

```bash
cd client && npm run build 2>&1 | tail -5
```
Attendu : build success (warnings possibles, pas d'erreurs fatales)

- [ ] **Step 4** : Commit

```bash
git add client/vite.config.js
git commit -m "config(client): add @ path alias in vite config"
```

---

### Task 1.5 : Renommer `config.js` → `config.ts`

- [ ] **Step 1** : Renommer

```bash
mv client/src/config.js client/src/config.ts
```

- [ ] **Step 2** : Ajouter les types au contenu

```typescript
const API_BASE = import.meta.env.DEV ? '' : 'https://api.minisocial.app'
const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:3000/graphql`
  : 'wss://api.minisocial.app/graphql'

export { API_BASE, WS_URL }
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/config.ts
```
Attendu : pas d'erreurs

- [ ] **Step 4** : Commit

```bash
git add client/src/config.ts
git commit -m "refactor(client): rename config.js → config.ts"
```

---

### Task 1.6 : Renommer `utils.js` → `utils.ts`

- [ ] **Step 1** : Renommer

```bash
mv client/src/utils.js client/src/utils.ts
```

- [ ] **Step 2** : Lire le fichier, ajouter types aux fonctions

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/utils.ts
```

- [ ] **Step 4** : Commit

```bash
git add client/src/utils.ts
git commit -m "refactor(client): rename utils.js → utils.ts"
```

---

### Task 1.7 : Renommer `store.js` → `store.ts`

- [ ] **Step 1** : Renommer

```bash
mv client/src/store.js client/src/store.ts
```

- [ ] **Step 2** : Lire le fichier. Ajouter un type `User` pour le state zustand

```typescript
interface User {
  id: string
  name: string
  email: string
  avatar?: string
  bio?: string
  role?: string
}

interface AuthState {
  currentUser: User | null
  setCurrentUser: (user: User | null) => void
}
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/store.ts
```

- [ ] **Step 4** : Commit

```bash
git add client/src/store.ts
git commit -m "refactor(client): rename store.js → store.ts with User type"
```

---

### Task 1.8 : Renommer `apollo.js` → `apollo.ts`

- [ ] **Step 1** : Renommer

```bash
mv client/src/apollo.js client/src/apollo.ts
```

- [ ] **Step 2** : Ajouter types

```typescript
import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'
import { API_BASE, WS_URL } from './config'

const httpLink = new HttpLink({
  uri: `${API_BASE}/graphql`,
  credentials: 'include',
})

const wsLink = typeof window !== 'undefined'
  ? new GraphQLWsLink(
      createClient({
        url: WS_URL,
        connectionParams: () => ({
          cookies: document.cookie,
        }),
      })
    )
  : null

const splitLink = wsLink
  ? split(
      ({ query }) => {
        const def = getMainDefinition(query)
        return def.kind === 'OperationDefinition' && def.operation === 'subscription'
      },
      wsLink,
      httpLink
    )
  : httpLink

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
})

export default client
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/apollo.ts
```

- [ ] **Step 4** : Commit

```bash
git add client/src/apollo.ts
git commit -m "refactor(client): rename apollo.js → apollo.ts with types"
```

---

### Task 1.9 : Renommer `auth-client.js` → `auth-client.ts`

- [ ] **Step 1** : Renommer

```bash
mv client/src/lib/auth-client.js client/src/lib/auth-client.ts
```

- [ ] **Step 2** : Ajouter types Better Auth

```typescript
import { createAuthClient } from 'better-auth/client'

const authClient = createAuthClient({
  baseURL: '',
})

export const { signIn, signUp, signOut, useSession } = authClient
export default authClient
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/lib/auth-client.ts
```

- [ ] **Step 4** : Commit

```bash
git add client/src/lib/auth-client.ts
git commit -m "refactor(client): rename auth-client.js → auth-client.ts"
```

---

### Task 1.10 : Renommer `main.jsx` → `main.tsx`

- [ ] **Step 1** : Renommer

```bash
mv client/src/main.jsx client/src/main.tsx
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/main.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/main.tsx
git commit -m "refactor(client): rename main.jsx → main.tsx"
```

---

### Task 1.11 : Renommer `App.jsx` → `App.tsx`

- [ ] **Step 1** : Renommer

```bash
mv client/src/App.jsx client/src/App.tsx
```

- [ ] **Step 2** : Ajouter les types React (props, state, etc.)

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/App.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/App.tsx
git commit -m "refactor(client): rename App.jsx → App.tsx with types"
```

---

### Task 1.12 : Renommer chaque hook `.js` → `.ts`

Pour chaque hook dans `client/src/hooks/` :

- [ ] **Step 1** : Renommer `useHeartbeat.js` → `useHeartbeat.ts`

```bash
mv client/src/hooks/useHeartbeat.js client/src/hooks/useHeartbeat.ts
```

- [ ] **Step 2** : Ajouter type retour au hook

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/hooks/useHeartbeat.ts
```

- [ ] **Step 4** : Commit

```bash
git add client/src/hooks/useHeartbeat.ts
git commit -m "refactor(client): rename useHeartbeat.js → .ts"
```

- [ ] **Step 5** : Renommer `useNotifications.js` → `useNotifications.ts`

```bash
mv client/src/hooks/useNotifications.js client/src/hooks/useNotifications.ts
```

- [ ] **Step 6** : Vérifier

```bash
cd client && npx tsc --noEmit src/hooks/useNotifications.ts
```

- [ ] **Step 7** : Commit

```bash
git add client/src/hooks/useNotifications.ts
git commit -m "refactor(client): rename useNotifications.js → .ts"
```

- [ ] **Step 8** : Renommer `useSystemNotifications.js` → `useSystemNotifications.ts`

```bash
mv client/src/hooks/useSystemNotifications.js client/src/hooks/useSystemNotifications.ts
```

- [ ] **Step 9** : Vérifier

```bash
cd client && npx tsc --noEmit src/hooks/useSystemNotifications.ts
```

- [ ] **Step 10** : Commit

```bash
git add client/src/hooks/useSystemNotifications.ts
git commit -m "refactor(client): rename useSystemNotifications.js → .ts"
```

---

### Task 1.13 : Renommer chaque composant `.jsx` → `.tsx`

Pour **chaque** fichier dans `client/src/components/` :

```bash
for f in client/src/components/*.jsx; do
  mv "$f" "${f%.jsx}.tsx"
done
```

Puis pour les pages :

```bash
for f in client/src/pages/*.jsx; do
  mv "$f" "${f%.jsx}.tsx"
done
```

- [ ] **Step 1** : Renommer tous les composants

- [ ] **Step 2** : Vérifier TypeScript global

```bash
cd client && npx tsc --noEmit
```
Attendu : il y aura des erreurs de types — on les fixe dans les tasks suivantes

- [ ] **Step 3** : Commit

```bash
git add client/src/
git commit -m "refactor(client): rename all .jsx → .tsx"
```

---

### Task 1.14 : Fixer les erreurs TypeScript dans `Header.tsx`

- [ ] **Step 1** : Lire `client/src/components/Header.tsx`

- [ ] **Step 2** : Ajouter interface pour les props

```typescript
interface HeaderProps {
  user?: {
    id: string
    name: string
    email: string
    avatar?: string
  } | null
  onSignOut?: () => void
}
```

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Header.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Header.tsx
git commit -m "types(client): add HeaderProps interface to Header.tsx"
```

---

### Task 1.15 : Fixer les erreurs TypeScript dans `Sidebar.tsx`

- [ ] **Step 1** : Lire `client/src/components/Sidebar.tsx`

- [ ] **Step 2** : Ajouter types pour les props et le state

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Sidebar.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Sidebar.tsx
git commit -m "types(client): add types to Sidebar.tsx"
```

---

### Task 1.16 : Fixer les erreurs TypeScript dans `PostCard.tsx`

- [ ] **Step 1** : Lire `client/src/components/PostCard.tsx`

- [ ] **Step 2** : Ajouter types pour les props (post, comments, likes, etc.)

```typescript
interface Post {
  id: string
  content: string
  image?: string
  authorId: string
  author?: { id: string; name: string; avatar?: string }
  createdAt: string
}

interface PostCardProps {
  post: Post
  currentUserId?: string
}
```

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/PostCard.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/PostCard.tsx
git commit -m "types(client): add PostCardProps interface to PostCard.tsx"
```

---

### Task 1.17 : Fixer les erreurs TypeScript dans `Chat.tsx`

- [ ] **Step 1** : Lire `client/src/components/Chat.tsx`

- [ ] **Step 2** : Ajouter types pour messages, sender, receiver

```typescript
interface Message {
  id: string
  content: string
  senderId: string
  receiverId: string
  createdAt: string
}

interface ChatProps {
  receiverId: string
  receiverName: string
}
```

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Chat.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Chat.tsx
git commit -m "types(client): add Message and ChatProps types to Chat.tsx"
```

---

### Task 1.18 : Fixer les erreurs TypeScript dans `Feed.tsx`

- [ ] **Step 1** : Lire `client/src/components/Feed.tsx`

- [ ] **Step 2** : Ajouter types pour les posts et les filtres

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Feed.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Feed.tsx
git commit -m "types(client): add types to Feed.tsx"
```

---

### Task 1.19 : Fixer les erreurs TypeScript dans `ChatLobby.tsx`

- [ ] **Step 1** : Lire `client/src/components/ChatLobby.tsx`

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/ChatLobby.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/ChatLobby.tsx
git commit -m "types(client): add types to ChatLobby.tsx"
```

---

### Task 1.20 : Fixer les erreurs TypeScript dans `Meeting.tsx`

- [ ] **Step 1** : Lire `client/src/components/Meeting.tsx`

- [ ] **Step 2** : Ajouter types pour WebRTC (RTCPeerConnection, ICE, SDP)

```typescript
interface MeetingProps {
  meetingId: string
  userId: string
}
```

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Meeting.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Meeting.tsx
git commit -m "types(client): add MeetingProps to Meeting.tsx"
```

---

### Task 1.21 : Fixer les erreurs TypeScript dans `GroupChat.tsx`

- [ ] **Step 1** : Lire `client/src/components/GroupChat.tsx`

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/GroupChat.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/GroupChat.tsx
git commit -m "types(client): add types to GroupChat.tsx"
```

---

### Task 1.22 : Fixer les erreurs TypeScript dans `Profile.tsx`

- [ ] **Step 1** : Lire `client/src/components/Profile.tsx`

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Profile.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Profile.tsx
git commit -m "types(client): add types to Profile.tsx"
```

---

### Task 1.23 : Fixer les erreurs TypeScript dans `Search.tsx`

- [ ] **Step 1** : Lire `client/src/components/Search.tsx`

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/Search.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/Search.tsx
git commit -m "types(client): add types to Search.tsx"
```

---

### Task 1.24 : Fixer les erreurs TypeScript dans les composants restants

Pour chaque composant restant (`Toast`, `Composer`, `CommentItem`, `CreateGroup`, `IncomingCall`, `ImageCropModal`, `MeetingControls`, `UploadImage`) :

- [ ] **Step 1** : Lire le fichier

- [ ] **Step 2** : Ajouter types props + state

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/components/NOM_DU_FICHIER.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/NOM_DU_FICHIER.tsx
git commit -m "types(client): add types to NOM_DU_FICHIER.tsx"
```

(Répéter pour chaque composant)

---

### Task 1.25 : Fixer les erreurs TypeScript dans les pages

Pour chaque page (`LoginPage.tsx`, `RegisterPage.tsx`) :

- [ ] **Step 1** : Lire le fichier

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
cd client && npx tsc --noEmit src/pages/NOM_DE_LA_PAGE.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/pages/NOM_DE_LA_PAGE.tsx
git commit -m "types(client): add types to NOM_DE_LA_PAGE.tsx"
```

---

### Task 1.26 : Vérification globale TypeScript frontend

- [ ] **Step 1** : Lancer la vérification complète

```bash
cd client && npx tsc --noEmit
```
Attendu : **0 erreurs**

- [ ] **Step 2** : Si des erreurs restent, les fixer une par une

- [ ] **Step 3** : Relancer la vérification

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 4** : Commit final Phase 1

```bash
git add client/
git commit -m "feat(client): complete TypeScript migration - zero errors"
```

---

## PHASE 1B — Restructuration Frontend (dossiers par feature)

> **Objectif :** Réorganiser `client/src/components/` en dossiers par feature avant d'ajouter shadcn/ui et TanStack Query. Plus propre, plus maintainable, plus scale.

### Structure cible

```
client/src/
  components/
    ui/             ← shadcn/ui (Phase 2)
    chat/           ← Chat, ChatLobby, GroupChat, CreateGroup
    feed/           ← Feed, PostCard, Composer, CommentItem
    meeting/        ← Meeting, MeetingControls, IncomingCall
    layout/         ← Header, Sidebar
    profile/        ← Profile
    search/         ← Search
    shared/         ← Toast, ImageCropModal, UploadImage
  hooks/            ← (inchangé)
  pages/            ← (inchangé)
  providers/        ← QueryProvider (Phase 3)
  lib/              ← auth-client, graphql-client, utils
  types/            ← types TypeScript partagés
  stores/           ← (optionnel) zustand stores
```

### Task R.1 : Créer la structure de dossiers

- [ ] **Step 1** : Créer tous les dossiers

```bash
mkdir -p client/src/components/{chat,feed,meeting,layout,profile,search,shared}
mkdir -p client/src/types
```

- [ ] **Step 2** : Vérifier

```bash
ls client/src/components/
```

Attendu : `chat/  feed/  layout/  meeting/  profile/  search/  shared/` (plus les fichiers restants temporairement)

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ client/src/types/
git commit -m "refactor(client): create feature directory structure"
```

---

### Task R.2 : Déplacer les composants chat

- [ ] **Step 1** : Déplacer

```bash
mv client/src/components/Chat.jsx client/src/components/chat/
mv client/src/components/ChatLobby.jsx client/src/components/chat/
mv client/src/components/GroupChat.jsx client/src/components/chat/
mv client/src/components/CreateGroup.jsx client/src/components/chat/
```

- [ ] **Step 2** : Mettre à jour les imports dans `App.jsx`

Avant :
```javascript
import ChatLobby from "./components/ChatLobby";
import Chat from "./components/Chat";
import GroupChat from "./components/GroupChat";
```

Après :
```javascript
import ChatLobby from "./components/chat/ChatLobby";
import Chat from "./components/chat/Chat";
import GroupChat from "./components/chat/GroupChat";
```

- [ ] **Step 3** : Chercher d'autres fichiers qui importent ces composants

```bash
grep -r "from.*components/Chat\|from.*components/GroupChat\|from.*components/CreateGroup\|from.*components/ChatLobby" client/src/ --include="*.jsx" --include="*.tsx" --include="*.ts" -l
```

Mettre à jour tous les fichiers trouvés.

- [ ] **Step 4** : Vérifier build

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 5** : Commit

```bash
git add client/src/
git commit -m "refactor(client): move chat components to components/chat/"
```

---

### Task R.3 : Déplacer les composants feed

- [ ] **Step 1** : Déplacer

```bash
mv client/src/components/Feed.jsx client/src/components/feed/
mv client/src/components/PostCard.jsx client/src/components/feed/
mv client/src/components/Composer.jsx client/src/components/feed/
mv client/src/components/CommentItem.jsx client/src/components/feed/
```

- [ ] **Step 2** : Mettre à jour les imports dans `App.jsx`

```javascript
import Feed from "./components/feed/Feed";
```

- [ ] **Step 3** : Chercher les autres imports

```bash
grep -r "from.*components/Feed\|from.*components/PostCard\|from.*components/Composer\|from.*components/CommentItem" client/src/ --include="*.jsx" --include="*.tsx" -l
```

- [ ] **Step 4** : Vérifier build

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 5** : Commit

```bash
git add client/src/
git commit -m "refactor(client): move feed components to components/feed/"
```

---

### Task R.4 : Déplacer les composants meeting

- [ ] **Step 1** : Déplacer

```bash
mv client/src/components/Meeting.jsx client/src/components/meeting/
mv client/src/components/MeetingControls.jsx client/src/components/meeting/
mv client/src/components/IncomingCall.jsx client/src/components/meeting/
```

- [ ] **Step 2** : Mettre à jour les imports dans `App.jsx`

```javascript
import Meeting from "./components/meeting/Meeting";
import IncomingCall from "./components/meeting/IncomingCall";
```

- [ ] **Step 3** : Chercher les autres imports

```bash
grep -r "from.*components/Meeting\|from.*components/IncomingCall\|from.*components/MeetingControls" client/src/ --include="*.jsx" --include="*.tsx" -l
```

- [ ] **Step 4** : Vérifier build

- [ ] **Step 5** : Commit

```bash
git add client/src/
git commit -m "refactor(client): move meeting components to components/meeting/"
```

---

### Task R.5 : Déplacer les composants layout

- [ ] **Step 1** : Déplacer

```bash
mv client/src/components/Header.jsx client/src/components/layout/
mv client/src/components/Sidebar.jsx client/src/components/layout/
```

- [ ] **Step 2** : Mettre à jour les imports dans `App.jsx`

```javascript
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
```

- [ ] **Step 3** : Chercher les autres imports

```bash
grep -r "from.*components/Header\|from.*components/Sidebar" client/src/ --include="*.jsx" --include="*.tsx" -l
```

- [ ] **Step 4** : Vérifier build

- [ ] **Step 5** : Commit

```bash
git add client/src/
git commit -m "refactor(client): move layout components to components/layout/"
```

---

### Task R.6 : Déplacer Profile + Search

- [ ] **Step 1** : Déplacer

```bash
mv client/src/components/Profile.jsx client/src/components/profile/
mv client/src/components/Search.jsx client/src/components/search/
```

- [ ] **Step 2** : Mettre à jour les imports dans `App.jsx`

```javascript
import Profile from "./components/profile/Profile";
import Search from "./components/search/Search";
```

- [ ] **Step 3** : Chercher les autres imports

- [ ] **Step 4** : Vérifier build

- [ ] **Step 5** : Commit

```bash
git add client/src/
git commit -m "refactor(client): move Profile and Search to feature folders"
```

---

### Task R.7 : Déplacer les composants shared

- [ ] **Step 1** : Déplacer

```bash
mv client/src/components/Toast.jsx client/src/components/shared/
mv client/src/components/ImageCropModal.jsx client/src/components/shared/
mv client/src/components/UploadImage.jsx client/src/components/shared/
```

- [ ] **Step 2** : Mettre à jour les imports dans `App.jsx`

```javascript
import Toast from "./components/shared/Toast";
```

- [ ] **Step 3** : Chercher les autres imports

```bash
grep -r "from.*components/Toast\|from.*components/ImageCropModal\|from.*components/UploadImage" client/src/ --include="*.jsx" --include="*.tsx" -l
```

- [ ] **Step 4** : Vérifier build

- [ ] **Step 5** : Commit

```bash
git add client/src/
git commit -m "refactor(client): move shared components to components/shared/"
```

---

### Task R.8 : Créer les types partagés

- [ ] **Step 1** : Créer `client/src/types/index.ts`

```typescript
// === User ===
export interface User {
  id: string
  name: string
  email: string
  avatar?: string | null
  bio?: string | null
  role?: string
  postCount?: number
  isOnline?: boolean
}

// === Post ===
export interface Post {
  id: string
  content: string
  image?: string | null
  authorId: string
  author?: Pick<User, 'id' | 'name' | 'avatar'>
  createdAt: string
  comments?: Comment[]
  likes?: Like[]
}

// === Comment ===
export interface Comment {
  id: string
  content: string
  authorId: string
  author?: Pick<User, 'id' | 'name'>
  postId: string
  createdAt: string
}

// === Like ===
export interface Like {
  id: string
  userId: string
  postId: string
}

// === Message ===
export interface Message {
  id: string
  content: string
  senderId: string
  receiverId?: string
  groupId?: string
  createdAt: string
}

// === Group ===
export interface Group {
  id: string
  name: string
  creatorId: string
  members?: User[]
  messages?: Message[]
}

// === Meeting ===
export interface Meeting {
  meetingId: string
  meetingTitle: string
  fromUser?: Pick<User, 'id' | 'name'>
  toUserId: string
}
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/types/index.ts
```

- [ ] **Step 3** : Commit

```bash
git add client/src/types/index.ts
git commit -m "feat(client): add shared TypeScript type definitions"
```

---

### Task R.9 : Vérification globale post-restructuration

- [ ] **Step 1** : Vérifier qu'aucun fichier ne reste à la racine de `components/`

```bash
ls client/src/components/*.jsx client/src/components/*.tsx 2>/dev/null
```

Attendu : aucun fichier (tout est dans des sous-dossiers)

- [ ] **Step 2** : Vérifier le build

```bash
cd client && npm run build 2>&1 | tail -10
```

Attendu : BUILD SUCCESS

- [ ] **Step 3** : Si des erreurs d'imports, les fixer

- [ ] **Step 4** : Relancer le build

- [ ] **Step 5** : Commit final

```bash
git add client/src/
git commit -m "refactor(client): verify restructuring — all imports correct"
```

---

## PHASE 2 — shadcn/ui + Tailwind v4

### Task 2.1 : Installer shadcn/ui CLI

- [ ] **Step 1** : Installer la CLI shadcn

```bash
cd client && npm install -D @shadcn/ui
```

- [ ] **Step 2** : Vérifier

```bash
cd client && npx shadcn --version
```

- [ ] **Step 3** : Commit

```bash
git add client/package.json
git commit -m "deps(client): add shadcn/ui CLI"
```

---

### Task 2.2 : Initialiser shadcn/ui

- [ ] **Step 1** : Lancer l'initialisation

```bash
cd client && npx shadcn@latest init
```

Choisir : New project → React → Tailwind CSS → Path alias `@/`

- [ ] **Step 2** : Vérifier que `components.json` et `lib/utils.ts` sont créés

```bash
ls client/components.json client/src/lib/utils.ts
```

- [ ] **Step 3** : Vérifier le build

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4** : Commit

```bash
git add client/
git commit -m "feat(client): initialize shadcn/ui with Tailwind v4"
```

---

### Task 2.3 : Ajouter composant Button de shadcn

- [ ] **Step 1** : Installer Button

```bash
cd client && npx shadcn@latest add button
```

- [ ] **Step 2** : Vérifier que `src/components/ui/button.tsx` existe

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/components/ui/button.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/components/ui/button.tsx
git commit -m "feat(client): add shadcn Button component"
```

---

### Task 2.4 : Ajouter composant Input de shadcn

- [ ] **Step 1** : Installer Input

```bash
cd client && npx shadcn@latest add input
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/components/ui/input.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/input.tsx
git commit -m "feat(client): add shadcn Input component"
```

---

### Task 2.5 : Ajouter composant Card de shadcn

- [ ] **Step 1** : Installer Card

```bash
cd client && npx shadcn@latest add card
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/components/ui/card.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/card.tsx
git commit -m "feat(client): add shadcn Card component"
```

---

### Task 2.6 : Ajouter composant Avatar de shadcn

- [ ] **Step 1** : Installer Avatar

```bash
cd client && npx shadcn@latest add avatar
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/components/ui/avatar.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/avatar.tsx
git commit -m "feat(client): add shadcn Avatar component"
```

---

### Task 2.7 : Ajouter composant Dialog de shadcn

- [ ] **Step 1** : Installer Dialog

```bash
cd client && npx shadcn@latest add dialog
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/components/ui/dialog.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/dialog.tsx
git commit -m "feat(client): add shadcn Dialog component"
```

---

### Task 2.8 : Ajouter composant DropdownMenu de shadcn

- [ ] **Step 1** : Installer DropdownMenu

```bash
cd client && npx shadcn@latest add dropdown-menu
```

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/dropdown-menu.tsx
git commit -m "feat(client): add shadcn DropdownMenu component"
```

---

### Task 2.9 : Ajouter composant Badge de shadcn

- [ ] **Step 1** : Installer Badge

```bash
cd client && npx shadcn@latest add badge
```

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/badge.tsx
git commit -m "feat(client): add shadcn Badge component"
```

---

### Task 2.10 : Ajouter composant ScrollArea de shadcn

- [ ] **Step 1** : Installer ScrollArea

```bash
cd client && npx shadcn@latest add scroll-area
```

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/scroll-area.tsx
git commit -m "feat(client): add shadcn ScrollArea component"
```

---

### Task 2.11 : Ajouter composants restants shadcn

Installer au besoin : `textarea`, `separator`, `tooltip`, `skeleton`, `toast`

- [ ] **Step 1** : Installer chaque composant

```bash
cd client && npx shadcn@latest add textarea separator tooltip skeleton toast
```

- [ ] **Step 2** : Vérifier TypeScript globale

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3** : Commit

```bash
git add client/src/components/ui/
git commit -m "feat(client): add remaining shadcn components"
```

---

### Task 2.12 : Vérification build complet shadcn

- [ ] **Step 1** : Build complet

```bash
cd client && npm run build 2>&1 | tail -10
```
Attendu : build success

- [ ] **Step 2** : Commit si nécessaire

```bash
git commit --allow-empty -m "verify(client): shadcn/ui build passes"
```

---

## PHASE 3 — TanStack Query + MSW (Data Fetching)

### Task 3.1 : Installer TanStack Query + graphql-request

- [ ] **Step 1** : Installer

```bash
cd client && npm install @tanstack/react-query graphql-request graphql
```

- [ ] **Step 2** : Installer les DevTools

```bash
cd client && npm install -D @tanstack/react-query-devtools
```

- [ ] **Step 3** : Vérifier

```bash
cd client && npm ls @tanstack/react-query graphql-request
```

- [ ] **Step 4** : Commit

```bash
git add client/package.json
git commit -m "deps(client): add TanStack Query + graphql-request"
```

---

### Task 3.2 : Créer le GraphQL client avec graphql-request

- [ ] **Step 1** : Créer `client/src/lib/graphql-client.ts`

```typescript
import { GraphQLClient } from 'graphql-request'
import { API_BASE } from '@/config'

export const graphqlClient = new GraphQLClient(`${API_BASE}/graphql`, {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
})
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/lib/graphql-client.ts
```

- [ ] **Step 3** : Commit

```bash
git add client/src/lib/graphql-client.ts
git commit -m "feat(client): create graphql-request client"
```

---

### Task 3.3 : Créer QueryClient provider

- [ ] **Step 1** : Créer `client/src/providers/QueryProvider.tsx`

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/providers/QueryProvider.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/providers/QueryProvider.tsx
git commit -m "feat(client): create QueryClient provider with devtools"
```

---

### Task 3.4 : Wrapper App avec QueryProvider

- [ ] **Step 1** : Modifier `client/src/main.tsx`

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApolloProvider } from '@apollo/client/react'
import client from './apollo'
import QueryProvider from './providers/QueryProvider'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <QueryProvider>
        <App />
      </QueryProvider>
    </ApolloProvider>
  </StrictMode>
)
```

> Note : On garde ApolloProvider temporairement pendant la migration. On le retirera quand toutes les queries seront migrées.

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/main.tsx
```

- [ ] **Step 3** : Vérifier build

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4** : Commit

```bash
git add client/src/main.tsx
git commit -m "feat(client): wrap App with QueryProvider (parallel to Apollo)"
```

---

### Task 3.5 : Migrer `GET_ME` dans App.tsx vers TanStack Query

- [ ] **Step 1** : Lire `client/src/App.tsx` et identifier le `useQuery(GET_ME)`

- [ ] **Step 2** : Créer `client/src/hooks/useMe.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'

const GET_ME = gql`
  query GetMe {
    me {
      id
      name
      email
      avatar
      bio
      role
    }
  }
`

interface Me {
  id: string
  name: string
  email: string
  avatar?: string
  bio?: string
  role?: string
}

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => graphqlClient.request(GET_ME).then((res) => res.me),
    retry: false,
  })
}
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/hooks/useMe.ts
```

- [ ] **Step 4** : Commit

```bash
git add client/src/hooks/useMe.ts
git commit -m "feat(client): create useMe hook with TanStack Query"
```

---

### Task 3.6 : Utiliser useMe dans App.tsx (côté TanStack)

- [ ] **Step 1** : Modifier `App.tsx` pour utiliser `useMe` en parallèle

Ajouter en haut du composant :

```typescript
import { useMe } from './hooks/useMe'
// ... dans le composant :
const { data: tanstackUser, isLoading: tanstackLoading } = useMe()
```

Utiliser `tanstackUser` pour le sync store (en parallèle de l'ancien Apollo GET_ME pendant transition)

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/App.tsx
```

- [ ] **Step 3** : Vérifier build

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4** : Commit

```bash
git add client/src/App.tsx
git commit -m "feat(client): use useMe (TanStack) alongside Apollo GET_ME"
```

---

### Task 3.7 : Migrer GET_POSTS dans Feed.tsx

- [ ] **Step 1** : Créer `client/src/hooks/usePosts.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'

const GET_POSTS = gql`
  query GetPosts($limit: Int, $offset: Int) {
    posts(limit: $limit, offset: $offset) {
      id
      content
      image
      createdAt
      author { id name avatar }
      comments { id content author { id name } }
      likes { id userId }
    }
  }
`

export function usePosts(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['posts', limit, offset],
    queryFn: () => graphqlClient.request(GET_POSTS, { limit, offset }),
  })
}
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/hooks/usePosts.ts
```

- [ ] **Step 3** : Commit

```bash
git add client/src/hooks/usePosts.ts
git commit -m "feat(client): create usePosts hook with TanStack Query"
```

---

### Task 3.8 : Migrer GET_COMMENTS dans PostCard.tsx

- [ ] **Step 1** : Créer `client/src/hooks/useComments.ts`

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/hooks/useComments.ts
git commit -m "feat(client): create useComments hook with TanStack Query"
```

---

### Task 3.9 : Migrer GET_CHAT_PERMISSION + GET_MESSAGES dans Chat.tsx

- [ ] **Step 1** : Créer `client/src/hooks/useChat.ts`

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/hooks/useChat.ts
git commit -m "feat(client): create useChat hook with TanStack Query"
```

---

### Task 3.10 : Migrer GET_MY_GROUPS dans ChatLobby.tsx

- [ ] **Step 1** : Créer `client/src/hooks/useGroups.ts`

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/hooks/useGroups.ts
git commit -m "feat(client): create useGroups hook with TanStack Query"
```

---

### Task 3.11 : Migrer GET_ALL_USERS dans Sidebar.tsx

- [ ] **Step 1** : Créer `client/src/hooks/useUsers.ts`

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/hooks/useUsers.ts
git commit -m "feat(client): create useUsers hook with TanStack Query"
```

---

### Task 3.12 : Retirer ApolloProvider (migration complète)

Quand toutes les queries sont migrées :

- [ ] **Step 1** : Retirer `<ApolloProvider>` de `main.tsx`

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import QueryProvider from './providers/QueryProvider'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>
)
```

- [ ] **Step 2** : Supprimer `client/src/apollo.ts` (plus nécessaire)

- [ ] **Step 3** : Désinstaller Apollo

```bash
cd client && npm uninstall @apollo/client
```

- [ ] **Step 4** : Vérifier TypeScript globale

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 5** : Vérifier build

```bash
cd client && npm run build
```

- [ ] **Step 6** : Commit

```bash
git add client/
git commit -m "refactor(client): remove Apollo Client, fully migrated to TanStack Query"
```

---

## PHASE 4 — Vitest + MSW (Tests)

### Task 4.1 : Installer Vitest

- [ ] **Step 1** : Installer Vitest + jsdom

```bash
cd client && npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2** : Ajouter le script test dans `client/package.json`

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3** : Commit

```bash
git add client/package.json
git commit -m "deps(client): add Vitest + React Testing Library"
```

---

### Task 4.2 : Configurer Vitest dans vite.config

- [ ] **Step 1** : Modifier `client/vite.config.js`

```javascript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  server: {
    proxy: {
      '/api/auth': 'http://localhost:3000',
      '/graphql': 'http://localhost:3000',
    },
  },
})
```

- [ ] **Step 2** : Créer `client/src/test/setup.ts`

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 3** : Vérifier que Vitest tourne

```bash
cd client && npx vitest run --reporter=verbose 2>&1 | tail -10
```
Attendu : 0 tests trouvés (normal, pas encore de fichiers .test.ts)

- [ ] **Step 4** : Commit

```bash
git add client/vite.config.js client/src/test/setup.ts
git commit -m "config(client): configure Vitest with jsdom environment"
```

---

### Task 4.3 : Installer MSW

- [ ] **Step 1** : Installer MSW

```bash
cd client && npm install -D msw
```

- [ ] **Step 2** : Initialiser MSW

```bash
cd client && npx msw init public/ --save
```

- [ ] **Step 3** : Commit

```bash
git add client/package.json client/public/
git commit -m "deps(client): add MSW for API mocking"
```

---

### Task 4.4 : Créer les handlers MSW pour GraphQL

- [ ] **Step 1** : Créer `client/src/test/handlers.ts`

```typescript
import { http, HttpResponse } from 'msw'

const API_URL = 'http://localhost:3000'

export const handlers = [
  http.post(`${API_URL}/graphql`, async ({ request }) => {
    const body = await request.json()
    const operationName = body.operationName

    switch (operationName) {
      case 'GetMe':
        return HttpResponse.json({
          data: {
            me: {
              id: '1',
              name: 'Test User',
              email: 'test@example.com',
              avatar: null,
              bio: null,
              role: 'user',
            },
          },
        })

      case 'GetPosts':
        return HttpResponse.json({
          data: {
            posts: [
              {
                id: '1',
                content: 'Hello world!',
                image: null,
                createdAt: new Date().toISOString(),
                author: { id: '1', name: 'Test User', avatar: null },
                comments: [],
                likes: [],
              },
            ],
          },
        })

      default:
        return HttpResponse.json({ errors: [{ message: 'Unknown operation' }] })
    }
  }),
]
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/test/handlers.ts
```

- [ ] **Step 3** : Commit

```bash
git add client/src/test/handlers.ts
git commit -m "test(client): create MSW GraphQL handlers"
```

---

### Task 4.5 : Créer le setup MSW pour Vitest

- [ ] **Step 1** : Créer `client/src/test/server.ts`

```typescript
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

- [ ] **Step 2** : Modifier `client/src/test/setup.ts`

```typescript
import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

- [ ] **Step 3** : Vérifier que Vitest tourne avec MSW

```bash
cd client && npx vitest run
```
Attendu : passe (0 tests, MSW démarre sans erreur)

- [ ] **Step 4** : Commit

```bash
git add client/src/test/
git commit -m "test(client): setup MSW server for Vitest"
```

---

### Task 4.6 : Écrire le premier test (useMe hook)

- [ ] **Step 1** : Créer `client/src/hooks/__tests__/useMe.test.ts`

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useMe } from '../useMe'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useMe', () => {
  it('returns current user data', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useMe(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
      bio: null,
      role: 'user',
    })
  })
})
```

- [ ] **Step 2** : Lancer le test

```bash
cd client && npx vitest run src/hooks/__tests__/useMe.test.ts
```
Attendu : **PASS**

- [ ] **Step 3** : Commit

```bash
git add client/src/hooks/__tests__/useMe.test.ts
git commit -m "test(client): add useMe hook test with MSW"
```

---

### Task 4.7 : Installer Playwright

- [ ] **Step 1** : Installer Playwright

```bash
cd client && npm install -D @playwright/test
```

- [ ] **Step 2** : Initialiser Playwright

```bash
cd client && npx playwright install chromium
```

- [ ] **Step 3** : Commit

```bash
git add client/package.json
git commit -m "deps(client): add Playwright for E2E testing"
```

---

### Task 4.8 : Configurer Playwright

- [ ] **Step 1** : Créer `client/playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
})
```

- [ ] **Step 2** : Créer le dossier `client/e2e/`

```bash
mkdir -p client/e2e
```

- [ ] **Step 3** : Commit

```bash
git add client/playwright.config.ts
git commit -m "config(client): add Playwright E2E config"
```

---

### Task 4.9 : Écrire le premier test E2E (page load)

- [ ] **Step 1** : Créer `client/e2e/app.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('app loads and shows login page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('text=Connexion')).toBeVisible()
})
```

- [ ] **Step 2** : Lancer le test (nécessite le serveur en cours)

```bash
cd client && npx playwright test e2e/app.spec.ts
```
Attendu : **PASS** (si le serveur tourne sur :5173)

- [ ] **Step 3** : Commit

```bash
git add client/e2e/app.spec.ts
git commit -m "test(client): add first E2E test with Playwright"
```

---

## PHASE 5 — Backend TypeScript + Drizzle ORM

### Task 5.1 : Installer TypeScript + dépendances backend

- [ ] **Step 1** : Installer

```bash
npm install -D typescript @types/node @types/express @types/cors @types/ws
```

- [ ] **Step 2** : Vérifier

```bash
npx tsc --version
```

- [ ] **Step 3** : Commit

```bash
git add package.json package-lock.json
git commit -m "deps(server): add TypeScript + Node types"
```

---

### Task 5.2 : Créer `tsconfig.json` backend

- [ ] **Step 1** : Créer `tsconfig.json` à la racine

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2** : Commit

```bash
git add tsconfig.json
git commit -m "config(server): add tsconfig.json"
```

---

### Task 5.3 : Renommer `db.js` → `db.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/db.js src/db.ts
```

- [ ] **Step 2** : Ajouter types SQLite

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/db.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/db.ts
git commit -m "refactor(server): rename db.js → db.ts"
```

---

### Task 5.4 : Renommer `auth.js` → `auth.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/auth.js src/auth.ts
```

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/auth.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/auth.ts
git commit -m "refactor(server): rename auth.js → auth.ts"
```

---

### Task 5.5 : Renommer `crypto.js` → `crypto.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/crypto.js src/crypto.ts
```

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/crypto.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/crypto.ts
git commit -m "refactor(server): rename crypto.js → crypto.ts"
```

---

### Task 5.6 : Renommer `middleware/auth.js` → `middleware/auth.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/middleware/auth.js src/middleware/auth.ts
```

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/middleware/auth.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/middleware/auth.ts
git commit -m "refactor(server): rename middleware/auth.js → .ts"
```

---

### Task 5.7 : Renommer `middleware/rateLimit.js` → `middleware/rateLimit.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/middleware/rateLimit.js src/middleware/rateLimit.ts
```

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/middleware/rateLimit.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/middleware/rateLimit.ts
git commit -m "refactor(server): rename rateLimit.js → .ts"
```

---

### Task 5.8 : Renommer `utils/validation.js` → `utils/validation.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/utils/validation.js src/utils/validation.ts
```

- [ ] **Step 2** : Ajouter types Zod

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/utils/validation.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/utils/validation.ts
git commit -m "refactor(server): rename validation.js → .ts"
```

---

### Task 5.9 : Renommer `schema/typeDefs.js` → `schema/typeDefs.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/schema/typeDefs.js src/schema/typeDefs.ts
```

- [ ] **Step 2** : Ajouter types

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/schema/typeDefs.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/schema/typeDefs.ts
git commit -m "refactor(server): rename typeDefs.js → .ts"
```

---

### Task 5.10 : Renommer `resolvers/resolvers.js` → `resolvers/resolvers.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/resolvers/resolvers.js src/resolvers/resolvers.ts
```

- [ ] **Step 2** : Ajouter types Context, args, return pour chaque resolver

```typescript
interface Context {
  user: { id: string; name: string; email: string; role: string } | null
}
```

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/resolvers/resolvers.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/resolvers/resolvers.ts
git commit -m "refactor(server): rename resolvers.js → .ts with Context type"
```

---

### Task 5.11 : Renommer `server.js` → `server.ts`

- [ ] **Step 1** : Renommer

```bash
mv src/server.js src/server.ts
```

- [ ] **Step 2** : Ajouter types Express + Apollo

- [ ] **Step 3** : Vérifier

```bash
npx tsc --noEmit src/server.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/server.ts
git commit -m "refactor(server): rename server.js → server.ts"
```

---

### Task 5.12 : Vérification globale backend TypeScript

- [ ] **Step 1** : Lancer la vérification complète

```bash
npx tsc --noEmit
```
Attendu : **0 erreurs**

- [ ] **Step 2** : Fixer les erreurs restantes une par une

- [ ] **Step 3** : Relancer

```bash
npx tsc --noEmit
```

- [ ] **Step 4** : Commit final Phase 5

```bash
git add src/
git commit -m "feat(server): complete TypeScript migration - zero errors"
```

---

## PHASE 6 — Drizzle ORM + PostgreSQL

### Task 6.1 : Installer Drizzle ORM

- [ ] **Step 1** : Installer Drizzle + PostgreSQL driver

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

- [ ] **Step 2** : Vérifier

```bash
npm ls drizzle-orm pg
```

- [ ] **Step 3** : Commit

```bash
git add package.json
git commit -m "deps(server): add Drizzle ORM + pg driver"
```

---

### Task 6.2 : Créer Drizzle schema

- [ ] **Step 1** : Créer `src/db/schema.ts`

Définir les tables : `app_users`, `posts`, `comments`, `likes`, `chat_permissions`, `messages`, `meetings`, `groups`, `group_members`, `group_messages` avec relations et types Drizzle.

- [ ] **Step 2** : Vérifier TypeScript

```bash
npx tsc --noEmit src/db/schema.ts
```

- [ ] **Step 3** : Commit

```bash
git add src/db/schema.ts
git commit -m "feat(server): create Drizzle schema for all tables"
```

---

### Task 6.3 : Créer Drizzle config

- [ ] **Step 1** : Créer `drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

- [ ] **Step 2** : Commit

```bash
git add drizzle.config.ts
git commit -m "config(server): add drizzle.config.ts for PostgreSQL"
```

---

### Task 6.4 : Créer le client Drizzle

- [ ] **Step 1** : Créer `src/db/index.ts`

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
npx tsc --noEmit src/db/index.ts
```

- [ ] **Step 3** : Commit

```bash
git add src/db/index.ts
git commit -m "feat(server): create Drizzle PostgreSQL client"
```

---

### Task 6.5 : Générer la migration

- [ ] **Step 1** : Lancer Drizzle Kit generate

```bash
npx drizzle-kit generate
```

- [ ] **Step 2** : Vérifier que les fichiers de migration sont créés dans `drizzle/`

```bash
ls drizzle/
```

- [ ] **Step 3** : Commit

```bash
git add drizzle/
git commit -m "feat(server): generate initial PostgreSQL migration"
```

---

### Task 6.6 : Upstash Redis pour PubSub

- [ ] **Step 1** : Installer graphql-redis-subscriptions

```bash
npm install graphql-redis-subscriptions ioredis
```

- [ ] **Step 2** : Créer `src/redis.ts`

```typescript
import Redis from 'ioredis'

export const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
npx tsc --noEmit src/redis.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/redis.ts
git commit -m "feat(server): add Upstash Redis for PubSub"
```

---

### Task 6.7 : Modifier server.ts pour utiliser Redis PubSub

- [ ] **Step 1** : Dans `server.ts`, remplacer `new PubSub()` par `new RedisPubSub({ publisher: redis, subscriber: redis })`

- [ ] **Step 2** : Vérifier TypeScript

```bash
npx tsc --noEmit src/server.ts
```

- [ ] **Step 3** : Commit

```bash
git add src/server.ts
git commit -m "refactor(server): switch PubSub to Redis-backed"
```

---

## PHASE 7 — Infra + Déploiement (Free Tiers)

### Task 7.1 : Créer `.env.example`

- [ ] **Step 1** : Créer `.env.example`

```
# Database
DATABASE_URL=postgresql://user:password@host:5432/minisocial

# Redis (Upstash)
UPSTASH_REDIS_URL=redis://default:xxxx@region-xxxx.upstash.io:6379

# Auth
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_BASE_URL=http://localhost:3000

# Crypto
ENCRYPTION_KEY=your-32-char-hex-key

# Frontend
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 2** : Commit

```bash
git add .env.example
git commit -m "chore: add .env.example for documentation"
```

---

### Task 7.2 : Ajouter `.gitignore` pour les secrets

- [ ] **Step 1** : Vérifier que `.gitignore` contient `.env`

- [ ] **Step 2** : Ajouter si nécessaire

```
.env
.env.local
.env.production
```

- [ ] **Step 3** : Commit

```bash
git add .gitignore
git commit -m "chore: ensure .env files are gitignored"
```

---

### Task 7.3 : Créer `railway.toml`

- [ ] **Step 1** : Créer `railway.toml` à la racine

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node dist/server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

- [ ] **Step 2** : Commit

```bash
git add railway.toml
git commit -m "infra: add railway.toml config"
```

---

### Task 7.4 : Configurer GitHub Actions CI

- [ ] **Step 1** : Créer `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit

  typecheck-client:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: cd client && npm ci
      - run: cd client && npx tsc --noEmit

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: cd client && npm ci
      - run: cd client && npm run build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: cd client && npm ci
      - run: cd client && npx vitest run
```

- [ ] **Step 2** : Commit

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (typecheck + build + test)"
```

---

## PHASE 8 — Storybook

### Task 8.1 : Installer Storybook

- [ ] **Step 1** : Initialiser Storybook

```bash
cd client && npx storybook@latest init
```

- [ ] **Step 2** : Vérifier que `client/.storybook/` existe

- [ ] **Step 3** : Commit

```bash
git add client/.storybook/ client/src/stories/
git commit -m "feat(client): initialize Storybook 8 with Vite builder"
```

---

### Task 8.2 : Créer une story pour Button

- [ ] **Step 1** : Créer `client/src/stories/Button.stories.tsx`

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = {
  args: { children: 'Button', variant: 'default' },
}
export const Secondary: Story = {
  args: { children: 'Secondary', variant: 'secondary' },
}
export const Destructive: Story = {
  args: { children: 'Delete', variant: 'destructive' },
}
```

- [ ] **Step 2** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/stories/Button.stories.tsx
```

- [ ] **Step 3** : Commit

```bash
git add client/src/stories/Button.stories.tsx
git commit -m "feat(client): add Button story for Storybook"
```

---

### Task 8.3 : Story pour Card

- [ ] **Step 1** : Créer `client/src/stories/Card.stories.tsx`

- [ ] **Step 2** : Vérifier TypeScript

- [ ] **Step 3** : Commit

```bash
git add client/src/stories/Card.stories.tsx
git commit -m "feat(client): add Card story for Storybook"
```

---

## PHASE 9 — Sentry (Monitoring Erreurs)

### Task 9.1 : Installer Sentry frontend

- [ ] **Step 1** : Installer Sentry

```bash
cd client && npm install @sentry/react
```

- [ ] **Step 2** : Initialiser Sentry dans `main.tsx`

```typescript
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.2,
  environment: import.meta.env.MODE,
})
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
cd client && npx tsc --noEmit src/main.tsx
```

- [ ] **Step 4** : Commit

```bash
git add client/src/main.tsx
git commit -m "feat(client): add Sentry error monitoring"
```

---

### Task 9.2 : Installer Sentry backend

- [ ] **Step 1** : Installer

```bash
npm install @sentry/node
```

- [ ] **Step 2** : Initialiser dans `server.ts`

```typescript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.2,
  environment: process.env.NODE_ENV || 'development',
})
```

- [ ] **Step 3** : Vérifier TypeScript

```bash
npx tsc --noEmit src/server.ts
```

- [ ] **Step 4** : Commit

```bash
git add src/server.ts
git commit -m "feat(server): add Sentry error monitoring"
```

---

## PHASE 10 — Nettoyage Final

### Task 10.1 : Supprimer les anciens fichiers JS non utilisés

- [ ] **Step 1** : Vérifier qu'il ne reste pas de `.js` dans `src/` (sauf config files)

```bash
find src/ -name "*.js" -not -path "*/node_modules/*"
```

- [ ] **Step 2** : Supprimer les fichiers `.js` résiduels si existants

- [ ] **Step 3** : Commit

```bash
git add -A
git commit -m "chore(server): remove residual .js files after TS migration"
```

---

### Task 10.2 : Vérification finale globale

- [ ] **Step 1** : Typecheck backend

```bash
npx tsc --noEmit
```
Attendu : **0 erreurs**

- [ ] **Step 2** : Typecheck frontend

```bash
cd client && npx tsc --noEmit
```
Attendu : **0 erreurs**

- [ ] **Step 3** : Build frontend

```bash
cd client && npm run build
```
Attendu : **BUILD SUCCESS**

- [ ] **Step 4** : Tests

```bash
cd client && npx vitest run
```
Attendu : **ALL PASSING**

- [ ] **Step 5** : Commit

```bash
git add -A
git commit -m "chore: final verification - all checks passing"
```

---

### Task 10.3 : Mettre à jour MEMORY.md

- [ ] **Step 1** : Mettre à jour `MEMORY.md` avec le résumé de la migration

```markdown
## Session: Production Migration (July 2026)

- [TypeScript frontend migration] → fix: renommage .js→.tsx, tsconfig strict
- [shadcn/ui setup] → fix: Button, Input, Card, Avatar, Dialog, etc.
- [TanStack Query migration] → fix: remplacement Apollo Client
- [Vitest + MSW setup] → fix: tests unitaires avec mocks GraphQL
- [Playwright E2E] → fix: premier test app loads
- [TypeScript backend migration] → fix: renommage .js→.ts, types Context
- [Drizzle ORM setup] → fix: schema PostgreSQL, migrations
- [Redis PubSub] → fix: Upstash Redis pour GraphQL subscriptions
- [CI GitHub Actions] → fix: typecheck + build + test
- [Storybook] → fix: Button + Card stories
- [Sentry] → fix: error monitoring frontend + backend
```

- [ ] **Step 2** : Commit

```bash
git add MEMORY.md
git commit -m "docs: update MEMORY.md with production migration summary"
```

---

## RÉCAPITULATIF

| Phase | Tâches | Fichiers modifiés | Commandes clés |
|---|---|---|---|
| **1 — TS Frontend** | 26 | ~30 fichiers | `npx tsc --noEmit` |
| **1B — Restructuration** | 9 | ~25 fichiers | réorganisation dossiers + imports |
| **2 — shadcn/ui** | 12 | ~15 fichiers | `npx shadcn@latest add ...` |
| **3 — TanStack Query** | 12 | ~10 fichiers | `npm install @tanstack/react-query` |
| **4 — Vitest + MSW** | 9 | ~6 fichiers | `npx vitest run` |
| **5 — TS Backend** | 12 | ~10 fichiers | `npx tsc --noEmit` |
| **6 — Drizzle + PG** | 7 | ~5 fichiers | `npx drizzle-kit generate` |
| **7 — Infra** | 4 | 4 fichiers | GitHub Actions, Railway |
| **8 — Storybook** | 3 | ~5 fichiers | `npx storybook@latest init` |
| **9 — Sentry** | 2 | 2 fichiers | `npm install @sentry/react` |
| **10 — Nettoyage** | 3 | 3 fichiers | vérification finale |
| **TOTAL** | **~99 tâches** | **~115 fichiers** | |

**Règle appliquée** : Chaque étape inclut une vérification de code (tsc, build, test) avant de passer à la suivante.
