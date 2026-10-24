# Design

## Context

- `/api/charts`, `/api/trending`, `/api/featured-playlists` exist server-side
  (server.js ~1690-1877) but nothing consumes them.
- `useSearch` fires per keystroke (hooks/useApi.js:61) — no debounce.
- LRCLIB (`lrclib.net/api/get?track_name&artist_name&duration`) is the
  open-source lyrics fallback; JioSaavn official `lyrics.getLyricsById` via
  `fetchFromMusicServiceOfficial` is the primary.

## Decisions

- **`GET /api/lyrics/:id`**: first resolve the song (reuse `/api/song/:id`
  internals — id, name, artist, duration) → try official `lyrics.getLyricsById`
  via existing `fetchFromMusicServiceOfficial` → else LRCLIB
  `api/get?track_name=&artist_name=&duration=`. Response `{success, data:{lyrics,source}}` or `{success:true,data:null}`.
- **Lyrics UI**: `LyricsModal` (portal, scrollable, backdrop). Trigger from
  TrackMenu item + a mic icon in FullScreenPlayer controls row. No sync —
  plain text (LRCLIB plain lyrics; synced when the source returns lrc →
  render plain for v1).
- **Share**: `shareUrl` builder — `/discover/album/:id`, `/discover/artist/:id`,
  song → album link when known else `?q=` search link. `navigator.share`
  when available, else `navigator.clipboard.writeText` + toast "Link copied".
- **Search debounce**: debounce the *query* fed to `useSearch` by 300ms
  inside SearchView (local `debouncedQuery` state; the URL/input stays live).
- **Recent searches**: `localStorage 'recentSearches'` array (max 8, dedupe,
  newest-first); append on result-bearing searches (on submit/click of a
  result); render on empty-query state with a Clear control.
- ~~**Autocomplete**: the header search input gets a dropdown rendering the
  debounced search's top results~~ **Deferred** — not in the spec delta; the
  debounced results page + recents cover the interaction. Revisit if the
  family finds search-on-another-page clunky.
- **Discover rows**: `useCharts`, `useTrending`, `useFeaturedPlaylists`
  hooks; render HorizontalScroll rows; items route to album/playlist detail
  (charts/trending entries are song-or-album shaped — route by `type`/`id`).
  Defensive: `Array.isArray(data)` guards everywhere.

## Risks / Trade-offs

- [LRCLIB 503/rate-limit] → lyrics fail soft; cache per song id in
  TanStack query (5min staleTime)
- [Charts/trending item shape varies across upstream fallbacks] → normalize
  minimally client-side (id/name/image/type); skip unrenderable items
- [Autocomplete dropdown over-scrolls page] → absolutely positioned under
  input with max-height + scroll
