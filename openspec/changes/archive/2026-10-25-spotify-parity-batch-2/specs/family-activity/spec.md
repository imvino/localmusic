# Spec Delta

## Purpose
A friends-and-family social layer: let household members who opt in see each other's recent plays — the one "social" feature this architecture genuinely supports.

## ADDED Requirements

### Requirement: Activity sharing opt-in
Settings SHALL include "Share my listening activity" (default OFF). A member's recent plays MUST NOT be visible to anyone while OFF. The flag lives in the member's synced library doc with a timestamp (`shareActivity` + `shareActivityAt`). BOTH the server PUT merge AND the client pull merge MUST resolve the flag by comparing `shareActivityAt` (newest write wins) — a plain overwrite lets a stale device's push re-enable sharing after an opt-out. The server PUT whitelist MUST be extended to persist `shareActivity`, `shareActivityAt`, and `displayName` (unknown fields are currently dropped silently).

#### Scenario: Default is private
- **WHEN** a member has never toggled the setting
- **THEN** their activity does not appear in any other member's feed

#### Scenario: Stale device cannot re-enable
- **WHEN** a member opts out on device A while device B holds a stale doc with sharing on, and B pushes before pulling
- **THEN** the timestamped flag resolves to the newest write — the opt-out wins

### Requirement: Family activity endpoint
`GET /api/family/activity` (authenticated) SHALL scan the per-user library docs and return, per opted-in member, their recent plays: `{memberName, song, artist, image, ts}` rows merge-sorted newest-first, capped at 50 total. Members who have not opted in MUST NOT appear, including partial/leaked fields. `memberName` resolves from the doc's `displayName`; when absent, the server SHALL look it up via `clerkClient.users.getUser(userId)` (secret key already configured) using first name, falling back to "Member" — and cache the resolved name back into the doc. The endpoint reads N user docs per request (the store loads one doc per request today — this is new, and acceptable at household scale).

#### Scenario: Only opted-in members appear
- **WHEN** two members exist, one opted in and one not, and a third member requests the feed
- **THEN** only the opted-in member's entries are returned

#### Scenario: Unauthenticated request
- **WHEN** a guest requests `/api/family/activity`
- **THEN** the server responds 401 (consistent with other member endpoints)

#### Scenario: Name resolves for pre-existing docs
- **WHEN** a member opted in before `displayName` persistence existed
- **THEN** the feed still renders their real name via the Clerk lookup fallback

#### Scenario: Entry shape
- **WHEN** the feed returns entries
- **THEN** each carries memberName, song name, artist, image, and ts — enough to render "Appa played X" without a second lookup

### Requirement: Activity feed surface
Signed-in members SHALL see a "Family activity" section on Discover's member area when at least one *other* member has opted in and has entries. Tapping an entry plays or navigates to that song. The member's own entries are labeled "You". When nobody shares, the surface shows an empty-state nudge to enable sharing rather than disappearing silently (visible only to members who would benefit).

#### Scenario: Feed renders for member
- **WHEN** a signed-in member opens Discover and another member has opted in with plays
- **THEN** rows render "MemberName played Song — Artist" newest first

#### Scenario: Nobody shares
- **WHEN** no member has opted in
- **THEN** members see an empty-state prompt to enable sharing; guests see nothing

#### Scenario: Guests see nothing
- **WHEN** a guest browses Discover
- **THEN** no family-activity surface renders and no request fires
