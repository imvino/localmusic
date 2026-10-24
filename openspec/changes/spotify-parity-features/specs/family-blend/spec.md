# Spec Delta

## Purpose
Client-side social feature letting two family members intersect their listening data via a shareable link — the friends-and-family stand-in for Spotify Blend.

## ADDED Requirements

### Requirement: Blend link creation
A signed-in user MUST be able to generate a link encoding their top-played song ids (from durable play counts), shareable through the OS share sheet or clipboard. Local-collection songs MUST be excluded before encoding (they cannot resolve on another device).

#### Scenario: Create blend link
- **WHEN** a signed-in user chooses "Create Blend" and has play counts
- **THEN** a URL is produced that encodes up to 50 top song ids plus minimal metadata, local ids excluded, and is copied or shared

#### Scenario: Guest cannot blend
- **WHEN** a signed-out user attempts Blend creation
- **THEN** the sign-in flow opens instead

#### Scenario: Insufficient listening history
- **WHEN** a signed-in user has fewer than 5 play-count entries
- **THEN** the "Create Blend" action is disabled or hidden — a near-empty link produces a meaningless overlap

### Requirement: Blend resolution
Opening a Blend link MUST intersect the encoded ids with the viewer's own liked songs and play history and show the overlap. Viewing works for guests; saving the merged playlist requires sign-in (the pending action MUST survive the sign-in + initial sync pull ordering).

#### Scenario: Member sees overlap and saves
- **WHEN** a signed-in user opens a valid Blend link
- **THEN** the view lists shared songs, shows "N songs in common", and offers a one-tap merged playlist save

#### Scenario: Guest previews without overlap
- **WHEN** a guest opens a valid Blend link
- **THEN** the creator's top songs render (resolvable via the songs batch endpoint), the overlap section shows a sign-in prompt, and the save action is gated

#### Scenario: Empty overlap handled
- **WHEN** a signed-in viewer shares zero songs with the creator
- **THEN** the view shows the creator's top songs with a "no overlap yet" message and still offers import

#### Scenario: Unresolvable ids degrade gracefully
- **WHEN** some encoded ids cannot be resolved (delisted or local songs encoded by an older client)
- **THEN** they are skipped silently and the displayed counts reflect only resolved songs
