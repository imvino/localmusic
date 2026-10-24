# sleep-timer

## Purpose

Defines the sleep timer: pause playback after a chosen interval or at the
end of the current track.

## Requirements

### Requirement: Sleep timer pauses playback

The settings area SHALL offer a sleep timer (Off / 15 / 30 / 60 minutes /
End of track). On expiry the app pauses playback and confirms with a toast.
The setting is per-session (not persisted).

#### Scenario: Timed expiry
- **WHEN** a 15-minute timer is set
- **THEN** playback pauses 15 minutes later with a toast

#### Scenario: End of track
- **WHEN** "End of track" is selected
- **THEN** playback stops after the current song finishes (repeat-one still
  ends it — the flag clears on the first `ended` event)

#### Scenario: Cancel
- **WHEN** the user selects Off
- **THEN** any pending timer is cancelled
