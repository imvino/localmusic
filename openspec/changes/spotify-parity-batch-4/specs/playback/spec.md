# Spec Delta — playback (modified)

## ADDED Requirements

### Requirement: Smart shuffle mode
Shuffle play SHALL offer an optional "smart" variant that interleaves
recommendation-sourced songs into the shuffled queue — Spotify's sparkle
shuffle analog. Injected songs MUST pass the same content-block filters and
skip-penalty de-ranking as other suggestion consumers, MUST respect a
per-artist spacing cap, and MUST be visually distinguishable or at least
revertable (turning smart shuffle off restores a pure shuffle of the
member's own content).

#### Scenario: Smart shuffle injects suggestions
- **WHEN** a member enables smart shuffle and shuffles a context (playlist,
  artist, library)
- **THEN** the queue contains the context's songs in shuffled order plus
  interleaved catalog suggestions at a bounded ratio, each passing the
  blocklist and explicit filters

#### Scenario: Off means pure shuffle
- **WHEN** smart shuffle is disabled (the default)
- **THEN** shuffle behavior is byte-for-byte the pre-existing pure shuffle —
  no injected songs, no extra fetches

#### Scenario: Injected songs count normally
- **WHEN** an injected song plays past the threshold
- **THEN** it records play history/counts identically to a member-chosen
  song — this is also the feedback loop that validates the feature

#### Scenario: Suggestion fetch fails mid-queue
- **WHEN** the suggestions call errors
- **THEN** the queue degrades to pure shuffle of context songs — playback
  is never blocked on smart-shuffle fill

### Requirement: Injected songs obey the queue/permutation discipline
The queue model forbids mid-list insertion while a shuffle permutation
exists, and every queue mutation must invalidate in-flight crossfade
commits. Injected songs MUST be appended to the queue with their indices
spliced into the permutation at interleaved positions (the existing
play-next mechanism), and both inject and strip MUST invalidate any
in-flight crossfade/queue-commit guard.

#### Scenario: Inject under an active shuffle
- **WHEN** smart shuffle adds songs while a shuffle permutation is active
- **THEN** injected entries appear at interleaved permutation positions,
  existing permutation indices stay valid, and a pending crossfade cannot
  commit a stale next-index

#### Scenario: Strip mid-playback
- **WHEN** smart shuffle is turned off while an injected song is current
- **THEN** unplayed injected entries are removed from queue + permutation,
  the current song keeps playing, and playback continues pure from the next
  position

### Requirement: Smart shuffle excludes negative signals
Songs the member has repeatedly skipped (existing `skipCounts` penalty) or
hidden MUST NOT be injected, and injected songs that get skipped feed the
same skip-count signal so poor suggestions self-correct over time.

#### Scenario: Skipped suggestion is not re-injected
- **WHEN** a previously injected song accumulated skip signals
- **THEN** subsequent smart shuffles exclude or de-rank it
