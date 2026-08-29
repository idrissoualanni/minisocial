# MEMORY.md — MiniSocial

## Session: Fix auth + Zod + validation

- [Fix Zod validation schemas] → erreurs: schemas still had `authorId`/`senderId`/`creatorId` removed from typeDefs → fix: updated all schemas, removed stale params
- [Fix Zod validate() helper] → erreurs: `result.error.errors.map()` crashed (Zod v4 uses `.issues`) → fix: changed to `result.error.issues.map()`
- [Fix refresh token rotation] → erreurs: old token still accepted after rotate → fix: added `jti` (unique ID) to `signRefreshToken` payload — two calls in same second produced identical JWT strings
- [Fix rate limiter IPv6] → erreurs: `ERR_ERL_KEY_GEN_IPV6` warning → fix: added `validate: { xForwardedTrustProxy: false }` and normalized IPv6-mapped IPv4 in `keyGenerator`
- [Fix createMeeting resolver] → erreurs: still used Zod `creatorId` from old schema → fix: passes only `{ title }` to validate
- [Full integration test] → 19/19 passed (auth, tokens, posts, comments, likes, meetings, presence)

## Session: Architecture feed intelligent

- [Ajout section Feed intelligent dans docs/architecture-recherche-chiffrement.md] → erreurs: aucune → fix: nouvelle §6 décrivant l'approche hybride 3 signaux (contenu TF-IDF, engagement Jaccard, proximité sociale), cold start, calcul à la demande, évolution vers modèle entraîné

## Session: Design profil + mise à jour feed avec follow

- [Ajout §6 Design page profil dans architecture-recherche-chiffrement.md] → erreurs: aucune → fix: maquette ASCII complète (cover, avatar flottant, infos, stats, tabs, empty state), composants shadcn nécessaires, schéma SQL/GraphQL pour follow, description de ce qu'il manque
- [Mise à jour §7 Feed intelligent → 5 signaux] → erreurs: aucune → fix: ajout follow direct (w₁=0.30) et co-following (w₅=0.20), renumérotation signaux 1→3/2→4/3→5, mise à jour architecture (exploration forcée 5-10%), cold start enrichi, évolution ML avec 5 features
- [Mise à jour priorité] → erreurs: aucune → fix: table follows + bouton suivre devient #1 (bloquant pour l'algo), refonte profil #2, feed intelligent #3

## Session: Recherche et ajout optimisation messagerie

- [Ajout §8 Optimisation messagerie dans architecture-recherche-chiffrement.md] → erreurs: aucune → fix: inbox vs requests (follow mutuel → inbox, inconnu → requests), règle de routage (1 seul message dans request), rate limiting (messages/follows/requests par heure), trust levels 0-3 progressifs, spam score comportemental optionnel, mise à jour compatibilité et priorité

## Session: Architecture LiveKit + UX Feed

- [Ajout §9 LiveKit dans architecture-recherche-chiffrement.md] → erreurs: aucune → fix: architecture système complète (schéma ASCII, flux pas à pas, fichiers à créer/modifier, packages, env vars, intégration avec meetings SQL)
- [Ajout §12 UX/UI Feed dans architecture-recherche-chiffrement.md] → erreurs: aucune → fix: état des lieux visuel, analyse de ce qui est bon/manque, patterns exclus (tabs/stories) avec justification réseau textuel, priorité d'amélioration (skeleton > pagination > save > animation > formats)

## Session: Production Migration (Juillet 2026)

- [Phase 1 — TS Frontend] → fix: tous .jsx→.tsx, build OK
- [Phase 1B — Restructuration] → fix: 7 dossiers features (chat/feed/meeting/layout/profile/search/shared)
- [Phase 2 — shadcn/ui] → fix: 12 composants installés (button, input, card, avatar, dialog, etc.)
- [Phase 5 — TS Backend] → fix: 16 fichiers .ts créés, package.json scripts corrigés (tsx)
- [Fix serveur backend] → erreurs: EADDRINUSE + auth 404 → fix: kill process + `app.use("/api/auth", ...)` au lieu de `app.all`
- [Phase 3 — TanStack Query] → fix: 6 hooks (useMe, usePosts, useComments, useChat, useGroups, useUsers), migré App/Feed/Sidebar/ChatLobby. Apollo conservé pour subs+muts
- [Phase 4 — Vitest + MSW] → fix: config Vitest, handlers MSW, 1er test useMe PASS 2/2
- [Phase 6 — Drizzle ORM] → fix: schema.ts (15 tables pgTable), drizzle.config.ts, drizzle-client.ts, dependencies installées
- [MIGRATION SQLite → PostgreSQL] → erreurs: driver better-sqlite3 async incompatible → fix: réécriture complète des 5 resolvers en Drizzle ORM (async/await), removed better-sqlite3 + @types/better-sqlite3
- [Neon PostgreSQL] → erreurs: install locale PG cassée (lib manquantes), account Vercel lié → fix: compte Neon indépendant, projet minisocial créé
- [Better Auth + Neon] → erreurs: ECONNREFUSED (drizzle adapter crée pool séparé), colonnes camelCase vs snake_case → fix: pg.Pool direct dans auth.ts (Kysely interne), tables Better Auth créées manuellement avec bonnes colonnes, additionalFields ajoutés (last_seen, bio, role, banned)
- [Signup HTTP 200 ✅] → Utilisateur créé sur Neon PostgreSQL, Better Auth fonctionnel

## Session: Review phases 1-6 + fixes

- [Fix WS_URL wss→ws] → erreurs: prod build utilisait wss:// sur serveur HTTP → crash Apollo Invariant Violation → fix: détection protocol-aware (ws:// ou wss:// selon window.location.protocol) dans client/src/config.ts
- [Fix Feed.tsx Apollo v4] → erreurs: `document:` inexistant (v4 exige `query:`), type Comment résolvait vers DOM global → fix: `query:`, import alias `Comment as FeedComment`, typage générique `<{ postCreated: Post }>`
- [Fix App.tsx types] → erreurs: useMe renvoie `Me | null | undefined`, store attend `User | null` → fix: `currentUser ?? null` (2 occurrences)
- [Fix Vitest ramassait e2e] → erreurs: e2e/app.spec.ts (Playwright) exécuté par Vitest → fix: `include: ['src/**/*.{test,spec}.{ts,tsx}']` dans vite.config.js
- [Fix useMe.test vi] → erreurs: `vi` non importé → fix: `import { vi } from 'vitest'`
- [Review complète] → tsc backend 0, tsc frontend 0, vitest 2/2, build OK, serveur :4000 up (GraphQL 200, Better Auth 200, WS connecté + subs acceptées)
- [Point d'attention] → Apollo Client encore utilisé pour les subscriptions (décision à prendre), chunk 559KB > 500KB (code-splitting)

## Session: Config opencode globale (16 août 2026)

- [Diagnostic MCP] → erreurs: `opencode mcp list` crash (postinstall opencode-ai jamais exécuté) → fix: `node postinstall.mjs` dans node_modules global, CLI 1.18.4 OK
- [Ajout 6 plugins globaux dans ~/.config/opencode/opencode.jsonc] → erreurs: aucun → fix: oh-my-opencode, @tarquinen/opencode-dcp (AGPL-3.0), opencode-mem, opencode-vibeguard, opencode-websearch-cited, opencode-background-agents — redémarrage opencode requis
- [Alerte sécurité] → token GitHub gho_ en clair dans opencode.jsonc → recommandé: variable d'environnement {env:GITHUB_TOKEN} + révocation
- [Note] → opencode-supermemory non installé (doublon mem), opencode-notifier non installé (doublon notify.ps1)

## Session: Fix bugs + retrait stats (21 août 2026)

- [Retrait panneau Statistiques] → erreurs: aucun → fix: bloc supprimé de client/src/components/layout/Sidebar.tsx (lignes 16-37), liste Membres conservée. tsc ✅ vitest 2/2 ✅ build ✅
- [Debug bug query posts] → erreurs: `Failed query select ... from posts` via GraphQL alors que SQL brute OK sur Neon ; test isolé Drizzle+pg.Pool SSL → RAW OK (config DB saine) ; serveur dev instable dans session bash (processus nohup tués entre appels, Start-Process PS non concluant) → fix: EN ATTENTE — prochaine étape logger `error.cause` (DrizzleQueryError) dans resolver/formatError pour voir l'erreur pg réelle
- [Clarification bug app_users=0] → non-bug probable: contextFn lit les COOKIES (navigateur les envoie automatiquement), le Bearer curl était un artefact de test → table se remplira au premier login navigateur

## Session: Corrections frontend (29 août 2026)

- [Cause racine bug "Failed query" posts] → erreurs: .env jamais chargé par les scripts npm (DATABASE_URL absent → pg.Pool sans connectionString → DrizzleQueryError masquant) → fix: `tsx --env-file-if-exists=.env` dans scripts dev et start (package.json)
- [Architecture mutations posts unifiée] → erreurs: lectures TanStack Query mais mutations Apollo cache jamais peuplé → cache.modify no-op silencieux (posts/likes/comments morts sans WS) → fix: NOUVEAU client/src/hooks/usePostMutations.ts (useCreatePost/useDeletePost/useUpdatePost/useAddComment/useToggleLike, cache ['posts'], sans optimistic), Composer.tsx + PostCard.tsx réécrits sur ces hooks, PostCard garde useSubscription(LIKE_TOGGLED) Apollo → setQueryData TanStack
- [Subscriptions mortes en dev] → erreurs: proxy Vite '/graphql' sans ws:true → fix: ajout ws: true dans vite.config.js
- [Parcours inscription cassé] → erreurs: signUp.email ne pose pas de cookie → reload → écran login → fix: auto-login signIn.email explicite après signup dans RegisterPage.tsx, fallback toast si login échoue
- [ReactQueryDevtools en prod] → fix: conditionné à import.meta.env.DEV dans QueryProvider.tsx
- [Champ mort store] → fix: toast: null supprimé de store.ts (interface + impl)
- [Vérifications] → tsc frontend EXIT 0, vitest 2/2, vite build OK (chunk 560.09 kB/b 163.76 gzip warning), playwright e2e EXIT 0
- [Déploiement] → commit + push master, redéploiement Render déclenché (service srv-da7i5kp42hec73btuks0)
