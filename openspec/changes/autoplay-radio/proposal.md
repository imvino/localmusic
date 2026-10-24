# Proposal: autoplay-radio

## Why

The queue dead-ends — when it ends, music stops (repeat-off spec). Spotify's
core "never stop" loop is missing: no autoplay of similar songs, no radio,
and artist pages don't render the bio/similar-artist data the API already
returns. For a family app, music that never stops is the single most
Spotify-feeling gap left.

## What changes

- **Autoplay**: when the queue exhausts with repeat off, fetch similar songs
  via a new `GET /api/songs/:id/suggestions` server route (upstream
  `/songs/:id/suggestions` exists on the fallback API chain), filter out
  songs already in queue/recent history, append ~20, continue seamlessly.
  Toggleable (persisted, default ON), subtle toast on first extension.
- **Song radio**: TrackMenu "Go to song radio" — plays the song then a queue
  of its suggestions.
- **Artist radio**: button on artist headers — shuffled top songs blended
  with suggestions seeded from the top tracks.
- **Artist profile content**: render `bio` (collapsible) and `similarArtists`
  (clickable row) on the artist detail view — data already returned by
  `/api/artist/:id` (server.js ~2356-2386), just unrendered.

## Capabilities

- `playback` — MODIFIED: autoplay extension at queue end; ADDED: radio
  seeding requirements
- `artist-profiles` — NEW: bio + similar-artists rendering

## Impact

- **Server**: one new prod-safe route (`/api/songs/:id/suggestions`), same
  normalization/isLocal decoration pattern as `/api/songs`
- **Client**: `handleNext`/`onEnded` end-of-queue path, TrackMenu item,
  artist detail page sections, sidebar autoplay toggle
- **Deps**: none new
- **Risk**: suggestions endpoint may 404/empty on some ids → graceful stop
  (autoplay is best-effort, never blocks playback)
