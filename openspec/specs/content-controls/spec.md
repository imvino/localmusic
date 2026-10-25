# content-controls Specification

## Purpose
Negative-taste and family-safety controls: let members AND guests hide songs/artists from their surfaces and filter explicit content, so discovery reflects what the household actually wants to hear.

## Requirements

### Requirement: Hide song and artist
Any user (member or guest) SHALL be able to hide a song ("Don't play this") or an artist ("Don't play this artist") from each song's overflow menu — the entries are NOT auth-gated (matching Play next / Add to queue which are also ungated). Guest hides are device-local under a guest-scoped storage key that MUST be excluded from the user-switch wipe; member hides persist under member-scoped keys and sync via library sync.

Hidden entries MUST be stored as `id → {id, name, artist, album, image, duration, hiddenAt}` objects (mirror the `likedMeta` shape) so the Settings list and de-emphasized rows render without a lookup. Member keys are `hiddenSongs`/`hiddenArtists`; guest keys are `guestHiddenSongs`/`guestHiddenArtists` (+ `guestDataSaver` for D6). A selection helper (e.g. `useBlocklist()`/`blocklistKeys(isSignedIn)`) picks the member or guest key set at every call site — TrackMenu, Settings, `isContentBlocked`, filters.

All six member keys (`hiddenSongs`, `hiddenArtists`, `explicitFilter`, `dataSaver`, `removedHiddenSongs`, `removedHiddenArtists`) MUST be added to the wipe-on-user-switch list (`PERSONAL_KEYS`); guest keys MUST be absent from it so a guest's hides survive a member's sign-in/out cycle on a shared device.

Sync merge semantics (BOTH client pull and server PUT): hidden lists merge per-entry by `hiddenAt` LWW (newest `hiddenAt` wins per id — mirroring `likedMeta`), then filter by the dedicated tombstones (`tomb.ts <= hiddenAt` keeps the entry; `tomb.ts > hiddenAt` removes it). Re-hide after un-hide survives naturally because the new `hiddenAt` postdates the tombstone. `explicitFilter`/`dataSaver` merge by plain newest-write LWW. Un-hide tombstones MUST NOT be written to `removedSongs`/`removedArtists` (a tombstone there newer than `likedAt` would unlike the song).

Hidden songs and hidden artists' songs MUST be excluded from every suggestion-injection path: autoplay (`extendQueue`/`pickSuggestions`), song radio, artist radio's merge path (`handleArtistRadio` builds its own queue and MUST filter through the same check), and Daily Mixes / Weekly Mix. They MUST also be filtered out when building a queue from play-all or shuffle of a playlist.

#### Scenario: Hide stops autoplay repeats
- **WHEN** a user hides a song and later autoplay fetches suggestions containing it
- **THEN** that song is never appended to the queue

#### Scenario: Hide artist suppresses their tracks
- **WHEN** a member hides an artist whose songs appear in a discovery rail or artist radio build
- **THEN** those songs are excluded (artist matching uses the same normalized-name comparison as the followed-artist rail)

#### Scenario: Guest hides are device-local
- **WHEN** a guest hides a song, then a member signs in on the same device
- **THEN** the member's OWN blocklist is active while signed in (guest hides do not leak into it), and the guest's hidden entries return and apply after sign-out — never pushed to any member's sync doc

#### Scenario: Un-hide propagates without un-liking
- **WHEN** a member un-hides a song that is also liked, then syncs
- **THEN** the song is un-hidden on other devices AND remains liked (dedicated tombstone kind)

#### Scenario: Manage hidden content
- **WHEN** a member opens Settings → Hidden content
- **THEN** hidden songs and artists render with names/metadata from stored entries (no fetches) and each can be un-hidden

### Requirement: Hidden-content playback semantics
Hidden songs SHALL remain in playlists they already belong to (membership is preserved). When a user plays all / shuffles a playlist, hidden songs MUST be excluded from the built queue. In every list (playlists, Liked Songs, search results) hidden songs MUST render de-emphasized; an explicit tap on a hidden row or an explicit "Add to queue" SHALL play/queue it (direct user intent overrides the passive-suppression contract). Liked Songs MUST render hidden songs de-emphasized with the same direct-play rule.

#### Scenario: Play-all filters hidden
- **WHEN** a member presses Play or Shuffle on a playlist containing 2 hidden songs among 20
- **THEN** the queue builds with 18 songs and the hidden rows remain de-emphasized in the list

#### Scenario: Direct tap still plays
- **WHEN** a member taps a de-emphasized hidden row or adds it to queue manually
- **THEN** it plays/queues normally (suppression applies to passive surfaces only)

### Requirement: Explicit-content filter
Settings SHALL include an "Allow explicit content" toggle (default ON). When OFF, songs flagged explicit MUST be hidden from search results, typeahead suggestions, and discovery rails; rendered dimmed and non-playable in contexts where removal is wrong (e.g., inside an album's own track list); and never injected by autoplay/radio/mixes.

The block check MUST inspect `song.explicitContent` AND `song.more_info?.explicit_content` (truthy/`'1'`/`1`) — `explicitContent` is NOT normalized to top-level on all payloads today, and suggestions/autoplay/mix feeds are raw fetches that bypass the React Query decode boundary. The server SHALL also normalize `explicitContent` onto song results in `/api/search`, `/api/songs/:id/suggestions`, and the new `/api/search/suggestions` so surfaces can rely on the top-level flag going forward. When the upstream does not flag a song, it is treated as clean.

#### Scenario: Filter blocks explicit in search
- **WHEN** a member disables "Allow explicit content" and searches
- **THEN** results contain no songs flagged explicit by either field shape

#### Scenario: Explicit inside an album view
- **WHEN** an album contains an explicit track and the filter is off
- **THEN** that row renders dimmed with an E badge and tapping it does nothing

#### Scenario: Autoplay never injects explicit
- **WHEN** the filter is off and suggestions arrive via the raw-fetch path (no boundary normalization)
- **THEN** `more_info.explicit_content`-flagged songs are still excluded by the injection filter
