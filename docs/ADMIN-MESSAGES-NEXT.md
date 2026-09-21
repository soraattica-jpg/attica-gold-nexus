# Next extraction: Admin Messages (not yet migrated)

The verification follow-up intentionally completes the Branches gates before starting another feature deployment.

## Original registrations

| Endpoint | Baseline server.js line | Current status |
| --- | --- | --- |
| GET /api/ui-refresh | 29834 | PENDING |
| POST /api/ui-refresh | 29838 | PENDING |
| GET /api/admin-broadcast | 29851 | PENDING |
| GET /api/admin-broadcast/history | 29886 | PENDING |
| POST /api/admin-broadcast | 29904 | PENDING |
| DELETE /api/admin-broadcast | 29951 | PENDING |

## Dependency boundaries

- Repository: `attica_admin_broadcasts` and the minimal `attica_agents` recipient/private-message projection. Use a staging-only table copy with synthetic agent/message records; do not import real admin messages.
- Rules: recipient scopes, expiry choices, IST end-of-day expiry, serialization, active broadcast selection, private/broadcast message de-duplication and history limit.
- Shared mutable state: `uiRefreshState` is also read by agent serialization and written by other features (baseline lines 2674–2685, 11102 and 27895). Inject a getter/setter to preserve that single state object during extraction; do not silently introduce a second store or alter worker/event semantics.
- Pure/helper functions: `serializeAdminBroadcastRecord` (658), `getActiveAdminBroadcast` (676), `adminBroadcastAppliesToAgent` (691), `getAdminBroadcastExpiryDate` (703), `normalizeAgentId`, `parsePositiveInteger`, date conversion.
- Preserve existing application middleware and any caller authorization. Inventory the authorization boundary explicitly before exposing migrated mutations; do not assume splitting a route adds permission enforcement.
- Existing refresh uses tokens consumed by polling. Do not introduce new WebSocket events during a behavior-preserving extraction.

## Required characterization cases

1. No broadcast; missing/unknown agent; logged-out agent; non-agent account.
2. All/online/incoming/outgoing/follow-up/manual-dial audiences, access flags and current work mode.
3. Public broadcast combined with private message, duplicate text and whitespace handling.
4. All expiry choices, IST midnight, expired rows, newest active selection and deterministic ordering.
5. Missing message, invalid scope/expiry, 500-character truncation and sender fields.
6. Supersede existing active message; audit columns; clear result; empty and populated history with default/min/max limits.
7. Preserve current partial-failure and error contracts; any transaction or authorization improvement belongs to a separate explicit behavior change.
8. Shared refresh token visibility to agent serialization; unchanged request/response field names.
9. No messages sent to production agents, no production table writes, and no call/SIP/AMI/job startup in staging.

After these tests and real staging-database verification pass, mark the extracted registrations MIGRATED + TESTED. Keep call routing, queues, Hold/Transfer, autodial and AMI last.
