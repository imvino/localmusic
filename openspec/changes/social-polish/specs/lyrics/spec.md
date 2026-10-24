# Spec Delta

## Purpose

Defines lyrics display: fetching lyrics for a song (JioSaavn official first,
LRCLIB open-source fallback) and presenting them in a readable panel.

## ADDED Requirements

### Requirement: Lyrics are fetchable per song

The app SHALL provide lyrics for a song when a source has them: server route
`GET /api/lyrics/:id` tries JioSaavn's official lyrics endpoint first, then
LRCLIB matched by title/artist/duration. Unavailable lyrics return a clean
empty result — never an error page.

#### Scenario: Lyrics found
- **WHEN** a song has lyrics in any source
- **THEN** the route returns `{success:true, data:{lyrics, source}}`

#### Scenario: No lyrics
- **WHEN** neither source has lyrics
- **THEN** `{success:true, data:null}` and the UI shows "Lyrics unavailable"

### Requirement: Lyrics are viewable while listening

The track context menu SHALL offer "View lyrics" and the full-screen player
a lyrics control, opening a readable panel of the current song's lyrics.

#### Scenario: Open lyrics from a track
- **WHEN** the user picks "View lyrics" on a song
- **THEN** a panel opens with that song's lyrics (or the unavailable state)

#### Scenario: Lyrics in the player
- **WHEN** the user taps the lyrics control in the full-screen player
- **THEN** the current song's lyrics appear without stopping playback
