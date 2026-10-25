# Tasks — spotify-parity-batch-3

## 1. Dependencies + storage migration

- [ ] 1.1 `npm i better-sqlite3 ws` in the ROOT package (better-sqlite3 v11+ for Node-20 prebuilds); verify `node -e "require('better-sqlite3')"` loads
- [ ] 1.2 Create `src/store.js`: `store` = `{load(userId), save(userId,doc), all(cb)}`; sqlite backend (table `users(user_id PK, doc, ts)`); try/catch require → JSON fallback scanning `data/users/` AND `data/users/migrated/` (newest mtime wins on dup ids)
- [ ] 1.3 Startup migration BEFORE `app.listen`: row absent → INSERT; row older than file mtime → UPDATE; either way file → `data/users/migrated/`; unparseable → `migrated/failed/` + one logged warning; never delete, never crash, never warn-loop
- [ ] 1.4 Rewire `loadUserData`/`saveUserData` to `store.load`/`store.save`; port `/api/family/activity` to `store.all` (remove its `readdirSync`)
- [ ] 1.5 Verify: PUT→GET round-trip; seeded legacy file imports + moves; `/api/family/activity` identical; fallback path serves migrated files

## 2. WebSocket presence

- [ ] 2.1 Server: `WebSocketServer({server, path:'/ws/presence', maxPayload:64*1024})`; connId per socket; first msg `{type:'auth',token}` → `clerkClient.verifyToken` → `auth:ok`; else policy-close before any broadcast
- [ ] 2.2 Server: presence map keyed `userId#connId`, entry `ts` stamped server-side at receipt (client ts ignored); on `now`/`idle` check sender doc `shareActivity===true` before relay; dedupe broadcast by userId (newest ts); `displayName` w/ Clerk fallback + doc cache-back; broadcast ONLY when the serialized deduped view changed
- [ ] 2.3 Server: ≥5s between accepted `now` frames per conn EXCEPT when song id differs (fast skip updates immediately); 30s sweep drops entries >90s; conn close removes only that conn's entry
- [ ] 2.4 Client `usePresence`: SKIP entirely when no Clerk key (mirror AuthGate's HAS_CLERK — Clerk-free dev forces isSignedIn=true with null token); connect when signed-in + shareActivity + !privateSession; `getToken()` re-fetched EVERY (re)connect; close socket on sign-out; `now` on song start + 45s heartbeat while playing; `idle` on stop/pause>60s/privateSession-on/shareActivity-off/beforeunload; backoff 1s→30s; re-announce on reconnect
- [ ] 2.5 Discover "Listening now" row: member chips (name — song · artist), excludes self, gone when empty/offline/signed-out
- [ ] 2.6 Vite dev-proxy `/ws` → `:3001` with `ws:true`

## 3. Chromecast

- [ ] 3.1 `GET /api/lan`: `requireUser` + `rateLimited`; returns `{origin}` only when request Host is localhost/private-IPv4 (else `{origin:null}`)
- [ ] 3.2 Client `cast.js`: lazy-load CAF script; `{available, casting, cast(song,positionSec), stop()}`; init context on demand
- [ ] 3.3 Cast URL resolution per D3 — step 0: `base = API_BASE || window.location.origin` (VITE_API_URL unset in dev = relative URLs through the proxy); then public/LAN-IP as-is, localhost → `/api/lan`; unresolvable → button hidden; `isLocal` allowed
- [ ] 3.4 Cast button in PlayerBar + FullScreenPlayer (casting indicator, disconnect); on connect pause local element + `loadMedia` at current position
- [ ] 3.5 Session controller: poll `getMediaSession().idleReason`; `FINISHED` → recordPlayStats(finished song) + advance pointer + `loadMedia` next queued; disconnect → local paused, queue intact

## 4. Loudness normalization

- [ ] 4.1 `eq.js` rewrite: `Map<element,{source,normGain,analyser}>` registry — source→normGain→shared chain, analyser tap per element
- [ ] 4.2 `ensureGraph(el)` is the ONLY Map entry point: (a) lazily at first play gesture when `eqEnabled || normalizeVolume`, (b) in `startCrossfade` for `inEl` BEFORE `inEl.play()`; NEVER from the mount-time prefs effect for the normalize-only case (suspended-ctx trap); `ctx.resume()` on every play path while either is on (default normalize-ON/EQ-OFF must produce audio)
- [ ] 4.3 RMS loop on audible element: 500ms samples, ~15s window, `setTargetAtTime` toward `clamp(-20-rmsDb,±12)`; freeze an element's gain while `fadingRef`/`xfadeRef` covers it
- [ ] 4.4 `normalizeVolume` pref: Settings row, member+guest scoping, default on; disable = normGain→1 (never disconnect a captured source)
- [ ] 4.5 Server: `Access-Control-Allow-Origin: *` on the `/api/stream` LOCAL-FILE branch only (`/music/` already sits behind the global cors middleware — don't touch it)

## 5. Sync keys + hygiene

- [ ] 5.1 `normalizeVolume`/`guestNormalizeVolume` in every key enumeration: PUT whitelist+merge, slim push, pull merge, `PERSONAL_KEYS`/`GUEST_KEYS`, `pushSnapshot`, personalData wipe. Cast state NOT persisted
- [ ] 5.2 `.gitignore`: `data/app.db*`; `data/users/migrated/`

## 6. Verification

- [ ] 6.1 `node --check`; boot; curl `/api/lan` (401 unauth), `/api/me/library` (401), `/api/family/activity` (401)
- [ ] 6.2 WS: real Clerk token → `auth:ok` + member broadcasts; bad token → close; TWO conns same user → deduped single row; close one → row survives
- [ ] 6.3 Presence persistence: play a track >90s (or fake long ts) → member still listed (heartbeat path); pause 60s+ or privateSession on → `idle` → entry gone
- [ ] 6.4 Migration: seed `data/users/test_*.json` → restart → row in DB + file in `migrated/`; corrupt json → `migrated/failed/` + no warn-loop on second boot
- [ ] 6.5 Client: `vitest` all pass; `vite build` clean
- [ ] 6.6 Browser pass: "Listening now" across two sessions; normalize toggle changes measured gain (RMS delta of a quiet vs loud song within target band); cast button hidden where LAN origin unresolvable; presence re-announce after server restart
- [ ] 6.7 Regression: crossfade still works with normGain in chain (no mid-fade boost — gain frozen during fade; normalize-ON/EQ-OFF + crossfade → BOTH songs normalized); play-count threshold still counts; EQ still works per-element; heartbeat that changes nothing does NOT re-broadcast
