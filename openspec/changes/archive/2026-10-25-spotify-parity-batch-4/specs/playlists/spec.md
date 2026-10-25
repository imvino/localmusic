# Spec Delta — playlists (modified)

## ADDED Requirements

### Requirement: Playlist sharing produces a short server link
The Share action on a playlist SHALL POST the playlist payload to the share
endpoint and copy the returned short `/s/:code` URL (see the `share-links`
capability for server behavior). If the endpoint fails, the client MUST fall
back to the existing base64 `/shared/:data` payload URL so sharing never
breaks offline. The share sheet content is otherwise unchanged.

#### Scenario: Share copies a short link
- **WHEN** a signed-in member shares a playlist with the server reachable
- **THEN** the clipboard contains `https://<host>/s/<code>`, not a
  multi-kilobyte base64 URL

#### Scenario: Fallback preserves sharing
- **WHEN** the share endpoint is unreachable or rejects the payload
- **THEN** the client copies a working `/shared/:data` link and, if
  distinguishable, notes the link is the long form

#### Scenario: Local-file handling preserved
- **WHEN** the playlist contains local files
- **THEN** the short-link payload excludes them with the same `lc` marker
  semantics the payload encoder uses today
