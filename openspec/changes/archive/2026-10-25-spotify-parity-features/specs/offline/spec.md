# Spec Delta

## ADDED Requirements

### Requirement: Offline status banner
The app MUST display a persistent but unobtrusive banner whenever connectivity is lost — detected via `navigator.onLine`/online-offline events AND the existing periodic server health check (the health check is the backstop where browser online events are unreliable, e.g. iOS standalone PWA). The banner MUST distinguish "no internet" from "server unreachable".

#### Scenario: Going offline shows banner
- **WHEN** the browser reports offline or the health check fails while online status is ambiguous
- **THEN** an offline indicator is visible app-wide

#### Scenario: Reconnect hides banner
- **WHEN** connectivity is restored (online event or health check recovers)
- **THEN** the banner disappears

### Requirement: Downloads storage meter
The Downloads view MUST show total storage used by downloaded audio and available device storage when the platform exposes storage estimates.

#### Scenario: Storage usage displayed
- **WHEN** a signed-in user opens Downloads and the browser supports storage estimates
- **THEN** a meter shows bytes used by the downloads cache and overall quota usage

#### Scenario: Estimate unavailable degrades
- **WHEN** storage estimates are unavailable (e.g. older Safari)
- **THEN** the view shows downloaded item count without the meter, no error
