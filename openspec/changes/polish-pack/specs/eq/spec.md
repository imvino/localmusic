# Spec Delta

## Purpose

Defines sound shaping: a 3-band equalizer and a smooth-transition toggle,
both applied to the playback element via Web Audio.

## ADDED Requirements

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

### Requirement: Smooth transitions (volume ramp)

A persisted toggle SHALL fade the current track's volume to 0 over ~500ms
on track end/change and fade the next track in.

#### Scenario: Track change with transitions on
- **WHEN** a track ends or the user skips with the toggle on
- **THEN** volume ramps down, the next track starts, and volume ramps back up

#### Scenario: Toggle off
- **WHEN** the toggle is off
- **THEN** tracks change instantly as before
