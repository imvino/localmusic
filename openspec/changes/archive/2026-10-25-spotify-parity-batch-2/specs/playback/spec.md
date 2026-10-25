# Spec Delta

## ADDED Requirements

### Requirement: Crossfade duration selector (new UI)
"Smooth transitions" is a boolean toggle today. This change SHALL replace it with a duration selector offering off / 1s / 3s / 5s / 10s — same compact chip-popover pattern as the sleep timer. An existing `'on'` value migrates to `3s`; `'off'` stays off. Any duration enables true crossfade.

#### Scenario: Selector replaces toggle
- **WHEN** a member opens Settings
- **THEN** "Smooth transitions" shows a duration chip (e.g. "5s") that opens a preset popover, not a boolean toggle

### Requirement: True crossfade on natural queue advance
When a crossfade duration is set and the queue has a next song, the player SHALL overlap the outgoing track's fade-out with the incoming track's fade-in using a second audio element, starting the incoming track `crossfadeSeconds` before the outgoing ends. At no point SHALL both elements be silent. Manual interactions (skip, queue replace, selecting a different song, repeat-one replay) use the EXISTING hard-cut/fade path — crossfade applies only to the natural queue-advance path until proven stable.

#### Scenario: Natural track end with 5s crossfade
- **WHEN** crossfade is set to 5s and a song approaches its end with a next song queued
- **THEN** the next song starts ~5s early, volumes cross linearly, and no silence gap is audible

#### Scenario: Repeat-one does not crossfade
- **WHEN** repeat mode is "one" and a song ends
- **THEN** the same song replays on the primary element — no secondary element is started (there is no next queue index)

#### Scenario: Manual skip uses the existing path
- **WHEN** a member taps Next during playback (including mid-crossfade)
- **THEN** the current hard-cut/fade behavior applies and any in-flight crossfade is aborted (secondary element paused + released)

### Requirement: Crossfade element discipline
ALL playback mutations (seek, pause/resume, bitrate switch, sleep-timer stop/end-of-track, visibility-resume, volume, queue-replace, queue-remove) MUST operate on the element currently audible. At crossfade commit, the outgoing element's `ended`/`timeupdate`/`error` handlers MUST be detached before the roles swap, so it cannot double-advance the queue or fire sleep-EOT. The existing 500ms fade-in on `playing` MUST be suppressed on the secondary element (its volume is driven by the crossfade loop). The incoming element streams at the bitrate current at prefetch time; a mid-crossfade bitrate change applies to the audible element only.

#### Scenario: Pause mid-crossfade
- **WHEN** a member pauses while both elements are playing
- **THEN** both pause; resume resumes whichever element is live at that moment — never both

#### Scenario: Sleep timer end-of-track mid-crossfade
- **WHEN** sleep-EOT is armed and the outgoing song's `ended` would fire after commit
- **THEN** it does NOT double-fire or cut the incoming track — EOT resolves against the audible element's end

#### Scenario: Bitrate switch mid-crossfade
- **WHEN** a member changes quality while a crossfade is in flight
- **THEN** the currently audible element switches per existing logic; the prefetch already in flight completes at its original bitrate (no mid-flight restart)

#### Scenario: Secondary element failure falls back
- **WHEN** the secondary element fails to load or play (network, stream 404)
- **THEN** the transition completes via the existing hard-cut path — the song still advances, no stuck silence

### Requirement: Secondary-element handler ownership
Listeners are attached per-element at role assignment. The SECONDARY element MUST NOT write `playHistory`/`playCounts` (no phantom plays on abort), MUST NOT drive progress UI, MediaSession position state, adaptive-bitrate logic, or the warm probe — those stay keyed to the element currently audible. The secondary's own `ended`/`timeupdate` are inert; commit comes only from the outgoing element's end/fade-done. Only after role swap do history/count writes follow the new current element.

#### Scenario: No phantom plays on abort
- **WHEN** a crossfade starts and the member manually skips before commit
- **THEN** the incoming song records NO playCounts/playHistory entry — its `playing` event fired on the secondary, which is inert

#### Scenario: Progress stays on the audible track
- **WHEN** a crossfade is in flight
- **THEN** the progress bar and lock-screen position track the outgoing (audible) element until commit, then the incoming

### Requirement: Data-saver mode
Settings SHALL include a "Data saver" toggle (persisted, synced for members, device-local for guests). When ON, the app MUST cap `maxBitrate` at 96 (the same mechanism the existing "Low Data" quality option uses — capping `maxBitrate`, not rewriting the stream URL — so the adaptive upgrade effect cannot climb back to 160/320), and MUST skip the low-impact "warm" Range probe used to smooth track boundaries. The quality control SHALL show an overridden state while data-saver is on; enabling it when quality is already "Low Data" is idempotent. When OFF, prior behavior resumes.

#### Scenario: Data saver pins quality
- **WHEN** a member enables data saver with quality set to 320kbps
- **THEN** streams cap at 96kbps AND the adaptive buffer-health upgrade cannot exceed it, until data saver is disabled

#### Scenario: Idempotent with Low Data
- **WHEN** quality is already "Low Data" (96k) and the member enables data saver
- **THEN** nothing changes in stream quality (only the warm probe stops)

#### Scenario: Guests get device-local behavior
- **WHEN** a guest enables data saver
- **THEN** it applies to that device's playback only and never writes to a member sync doc

## MODIFIED Requirements

None — repeat/shuffle/queue semantics are unchanged.
