# eq

## Purpose

Defines sound shaping: a 3-band equalizer and a smooth-transition toggle,
both applied to the playback element via Web Audio.

## Requirements

### Requirement: Equalizer adjusts playback audio

Settings SHALL offer a 3-band EQ (low/mid/high, ±12dB) with presets
(Flat, Bass Boost, Vocal, Treble). Band values and enabled state persist
across reloads. The AudioContext graph SHALL be created lazily on first
enable and left connected permanently (bypass = flat gains) — the element
source is never detached.

#### Scenario: Enable EQ
- **WHEN** the user enables EQ and raises bass
- **THEN** subsequent playback audibly boosts low frequencies

#### Scenario: Persistence
- **WHEN** the user reloads with EQ enabled and custom bands
- **THEN** the same gains apply to new playback without re-enabling

#### Scenario: Preset selection
- **WHEN** the user picks a preset
- **THEN** the three bands set to the preset's gains immediately

#### Scenario: Persisted enable across reload
- **WHEN** the user reloads with EQ left enabled and presses play
- **THEN** the suspended AudioContext resumes inside the play gesture and
  audio is audible with the saved gains — persisted-on must never produce
  silence

### Requirement: Smooth transitions (volume ramp)

A persisted toggle SHALL fade audio through track changes: on a user skip
(or auto-advance), the outgoing track ramps toward 0 (~400ms) and the
incoming track fades in from 0. On natural track end the next track simply
fades in — nothing exists to fade out.

#### Scenario: Skip with transitions on
- **WHEN** the user skips or the queue advances with the toggle on
- **THEN** volume ramps down, the next track starts, and volume ramps back up

#### Scenario: Fade-in only at track start
- **WHEN** playback resumes from pause or recovers from a buffer stall
- **THEN** no fade occurs (fade-in applies only when `currentTime` is near 0)

#### Scenario: Toggle off
- **WHEN** the toggle is off
- **THEN** tracks change instantly as before
