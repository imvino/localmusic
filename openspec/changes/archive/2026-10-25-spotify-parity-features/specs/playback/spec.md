# Spec Delta

## ADDED Requirements

### Requirement: Swipe actions on mobile song rows
Touch devices MUST support swipe-left → add to queue and swipe-right → like on song rows, with visual feedback during the gesture and no interference with vertical scrolling. Rows MUST set `touch-action: pan-y` so the browser does not cancel the gesture mid-swipe.

#### Scenario: Swipe left adds to queue
- **WHEN** the user swipes a song row horizontally left on a touch device
- **THEN** the song is added to the play queue and a confirmation shows

#### Scenario: Swipe right toggles like
- **WHEN** the user swipes a song row horizontally right on a touch device and is signed in
- **THEN** the song's like state toggles; if signed out the sign-in flow opens instead

#### Scenario: Vertical scroll unaffected
- **WHEN** the user drags vertically on a song row
- **THEN** the list scrolls normally and no swipe action triggers

#### Scenario: Non-touch devices unaffected
- **WHEN** the app runs on a non-touch device
- **THEN** no swipe affordances render and pointer behavior is unchanged
