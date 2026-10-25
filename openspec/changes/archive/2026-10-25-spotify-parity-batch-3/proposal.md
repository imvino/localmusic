# Proposal: spotify-parity-batch-3 — infrastructure parity batch

## Why

Batch-2 closed most feature-surface gaps. What remains before this feels like
"real Spotify" for a friends-and-family household is infrastructure-shaped:

1. **Storage fragility.** Per-user library docs live as whole-file JSON writes
   (`data/users/<id>.json`). The sync PUT path is serialized today, but a
   crash mid-write can still leave a truncated JSON file — and every
   family-activity read parses every file in the directory. `better-sqlite3`
   gives crash-atomic upserts + indexed reads with zero ops.
2. **No live social layer.** The batch-2 family activity feed is a 60s-stale
   poll. A WebSocket presence channel makes "X is listening now" *live* —
   the feature Spotify can't do for a private household.
3. **No Chromecast.** Living-room playback is the biggest felt-parity gap.
   The CAF sender SDK is free; streams already go through our `/api/stream/:id`
   proxy so a receiver can fetch them.
4. **Volume jumps.** Mixed JioSaavn catalog + local files = jarring loudness
   differences. Spotify normalizes; we don't. A gain stage already exists in
   the EQ chain to hang normalization off.

## What Changes

- **`storage` capability (new):** user library docs move from JSON files to a
  single `data/app.db` SQLite database via `better-sqlite3`. One-time
  migration imports existing `data/users/*.json`. Same `loadUserData` /
  `saveUserData` contract — no route changes.
- **`family-activity` (modified):** add live presence. Server hosts a `ws`
  endpoint; authenticated members broadcast `{nowPlaying}` when a song starts
  (and only when `shareActivity` is on). Discover shows "Listening now" chips.
- **`playback` (modified):** two additions —
  - **Chromecast sender**: cast button in the player when a cast device is
    reachable; the receiver plays `/api/stream/:id` via a LAN-reachable URL.
    Explicitly disabled when the API base isn't LAN-reachable (e.g. the page
    was opened via `localhost` while the device can't reach it — actually the
    phone *can* reach localhost's host IP; see design D3).
  - **Loudness normalization**: per-track gain compensation computed from a
    rolling loudness measurement of the decoded signal, applied through a
    `GainNode` — target ≈ -14 LUFS-ish normalized loudness, Spotify-style.

## Out of scope

- Real-time collaborative queue (Jam) — needs a session protocol, not just presence.
- Multi-device Connect-style handoff — needs playback-state sync, not just metadata.
- Podcasts/audiobooks, lossless, offline-first PWA revamp — unchanged from batch-2 audit.
- Server-side loudness analysis (ffmpeg pre-pass) — client-side measurement chosen instead (design D4).

## Capabilities

| Capability | Change |
|---|---|
| `storage` | NEW — SQLite-backed per-user library documents |
| `family-activity` | MODIFIED — live presence channel |
| `playback` | MODIFIED — Chromecast sender + loudness normalization |
