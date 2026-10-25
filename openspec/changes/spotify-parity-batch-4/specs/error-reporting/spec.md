# Spec Delta — error-reporting (new capability)

## Purpose
Server-side capture of client crashes and runtime errors so the app owner
can see real failures in the field — without any hosted third-party
dependency (the app keeps a no-external-logs posture; Sentry was rejected
for this private deployment).

## ADDED Requirements

### Requirement: Client errors are reported to the server
Uncaught errors, React error-boundary catches, and unhandled promise
rejections on signed-in clients SHALL be POSTed to `/api/log-error` with:
error message, stack (truncated), route/view context, app version, and a
coarse client fingerprint (device type — never tokens or user content).
Guest clients MAY report (the endpoint must not require auth) but MUST be
rate-limited per IP.

#### Scenario: A crash becomes a stored record
- **WHEN** a member's client hits an error boundary
- **THEN** a row lands server-side within the session containing message,
  stack, and route — enough to reproduce

#### Scenario: Report storms are bounded
- **WHEN** a client enters an error loop
- **THEN** per-client and per-IP rate limits cap stored rows (dedup by
  message+stack signature is permitted)

#### Scenario: No secrets leave the client
- **WHEN** any error is reported
- **THEN** the payload contains no auth tokens, no localStorage contents, no
  song lyrics or user-entered text — only error context

### Requirement: Reporting never destabilizes the app
The reporting path MUST be fire-and-forget: reporting failure MUST be
swallowed silently, MUST NOT enqueue unbounded retries, and MUST NOT throw
into already-broken code paths.

#### Scenario: Server down during a crash
- **WHEN** an error occurs while the server is unreachable
- **THEN** the client behaves exactly as if reporting did not exist (the
  error boundary still renders; no secondary failure)

### Requirement: Stored errors are bounded and inspectable
The `client_errors` table MUST have a hard retention cap — dedup alone is
insufficient since a flood of *distinct* signatures bypasses it — via row
cap (oldest evicted) or TTL. An owner-facing way to inspect recent errors
SHALL exist — at minimum an authenticated admin/owner-readable endpoint or
documented SQLite query.

#### Scenario: Owner reviews last week's crashes
- **WHEN** the owner inspects stored errors
- **THEN** they see recent errors grouped/deduped enough to spot the top
  crash signatures
