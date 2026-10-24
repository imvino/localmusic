# Spec Delta

## Purpose

Defines offline resilience: audio already fetched by the player keeps
playing with no network, including seeks within cached songs.

## ADDED Requirements

### Requirement: Streamed audio is cached by the service worker

The service worker SHALL cache `/api/stream/` audio responses (any origin,
statuses 0/200/206) CacheFirst with `RangeRequestsPlugin`, capped at ~200
entries / 30 days.

#### Scenario: Replay a heard song offline
- **WHEN** the network is down and the user replays a previously-streamed
  song at the same URL (id + bitrate)
- **THEN** it plays from cache without a network request

#### Scenario: Seek within a cached song
- **WHEN** the user seeks inside a cached song
- **THEN** the range request is served from cache (not a fresh download)

### Requirement: Cache is bounded

The audio cache SHALL expire old entries (LRU within the cap) so it cannot
grow without limit.

#### Scenario: Cache eviction
- **WHEN** more than the entry cap is cached
- **THEN** the oldest entries are evicted automatically
