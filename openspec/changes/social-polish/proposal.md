# Proposal: social-polish

## Why

Family/friends on the remote app expect the everyday Spotify touch-points:
sharing a song link, reading lyrics, typed-ahead search, and a Discover page
that actually surfaces fresh content. Today: search fires an API call per
keystroke; `/api/charts`/`/api/trending`/`/api/featured-playlists` exist but
render nothing; there's no way to share or read lyrics.

## What changes

- **Lyrics**: `GET /api/lyrics/:id` — JioSaavn official `lyrics.getLyricsById`
  first, LRCLIB (`lrclib.net`, open-source) fallback by title/artist/duration.
  Client: "View lyrics" in TrackMenu + button in FullScreenPlayer → modal
  panel (synced-highlight is out of scope; plain scrollable lyrics).
- **Share**: TrackMenu "Share" item + album/artist header share buttons —
  `navigator.share` with `window.location`-based deep link, clipboard
  fallback + toast.
- **Search polish**: 300ms debounce on `useSearch` input; recent-searches
  list on the empty-query state (localStorage, tap to re-search, clearable);
  autocomplete quick-results while typing (reuse the same `/api/search` —
  just render top results as a dropdown under the input, not a new endpoint).
- **Discovery content**: wire `/api/charts`, `/api/trending`,
  `/api/featured-playlists` into DiscoverView rows; each item navigates to
  its detail page.

## Capabilities

- `lyrics` — NEW
- `search` — NEW
- `discovery` — NEW (browse surfaces: charts/trending/featured rows)
- `playback` — MODIFIED (track menu gains Share + Lyrics items)
- `artist-profiles` — MODIFIED (share button on artist/album headers)

## Impact

- **Server**: one new route `/api/lyrics/:id`; existing dead endpoints get
  consumers
- **Client**: LyricsModal, TrackMenu additions, SearchView input flow,
  DiscoverView rows, share helpers
- **Deps**: none (LRCLIB is plain fetch, no SDK)
- **Risk**: LRCLIB rate limits → lyrics fail soft ("Lyrics unavailable");
  charts/trending data shape variance → defensive normalization
