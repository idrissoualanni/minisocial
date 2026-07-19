# MEMORY.md — MiniSocial

## Session: Fix auth + Zod + validation

- [Fix Zod validation schemas] → erreurs: schemas still had `authorId`/`senderId`/`creatorId` removed from typeDefs → fix: updated all schemas, removed stale params
- [Fix Zod validate() helper] → erreurs: `result.error.errors.map()` crashed (Zod v4 uses `.issues`) → fix: changed to `result.error.issues.map()`
- [Fix refresh token rotation] → erreurs: old token still accepted after rotate → fix: added `jti` (unique ID) to `signRefreshToken` payload — two calls in same second produced identical JWT strings
- [Fix rate limiter IPv6] → erreurs: `ERR_ERL_KEY_GEN_IPV6` warning → fix: added `validate: { xForwardedTrustProxy: false }` and normalized IPv6-mapped IPv4 in `keyGenerator`
- [Fix createMeeting resolver] → erreurs: still used Zod `creatorId` from old schema → fix: passes only `{ title }` to validate
- [Full integration test] → 19/19 passed (auth, tokens, posts, comments, likes, meetings, presence)

## Known Issues (none remaining)

- All tasks completed and verified
