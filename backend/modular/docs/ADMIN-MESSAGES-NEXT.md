# Admin Messages: migrated and tested in preview

## Scope and exact source replacements

Locations refer to the hash-verified private baseline in `docs/BASELINE.json`.

| Endpoint | Original server.js range | Status |
| --- | --- | --- |
| GET /api/ui-refresh | 29834–29836 | MIGRATED + TESTED |
| POST /api/ui-refresh | 29838–29849 | MIGRATED + TESTED |
| GET /api/admin-broadcast | 29851–29884 | MIGRATED + TESTED |
| GET /api/admin-broadcast/history | 29886–29902 | MIGRATED + TESTED |
| POST /api/admin-broadcast | 29904–29949 | MIGRATED + TESTED |
| DELETE /api/admin-broadcast | 29951–29971 | MIGRATED + TESTED |
| PUT /api/agents/:id | 30128–30351 | PARTIAL: adminMessage-only payload TESTED |

The generic agent update handler stays byte-for-byte unchanged. An interceptor immediately before it handles only a body containing `adminMessage` and no other keys. Status, login, access, queues and other agent updates are not migrated. The preview rejects these unrelated mutation payloads with 405.

Removed constants/helpers: `ADMIN_BROADCAST_SCOPES` at 655; `ADMIN_BROADCAST_EXPIRIES` at 656; `serializeAdminBroadcastRecord` at 658–674; `getActiveAdminBroadcast` at 676–689; `adminBroadcastAppliesToAgent` at 691–701; `getAdminBroadcastExpiryDate` at 703–726. Helpers used elsewhere remain in the monolith. `scripts/prepare-runtime.js` mounts the six routes at original line 29834 and inserts the private-message interceptor at line 30128. All unrelated statements and route ordering are tested against the original snapshot.

## Architecture

`modules/admin-messages/` contains routes, controller, service, repository, validation, tests and an index factory. SQL is confined to the repository. The service receives an explicit event publisher and shared refresh-state getter/setter. The controller preserves existing response/error contracts. Authorization is injected at the routing boundary.

Save → publish invalidation → transport reloads current eligible message. Events carry scope/agent identity and kind, never message bodies. This prevents a delayed event from overwriting the newest stored broadcast. A transport failure leaves the saved record available to polling/reconnect without inserting it again.

The production baseline uses polling and `uiRefreshState`, not an Admin Messages WebSocket channel. Shared state is also read at original lines 2674–2685 and written near 11102 and 27895. The generated disabled candidate continues using that shared object and legacy polling; no new production socket/event contract is claimed. Port 3101 uses `events/test-admin-message-sink.js` only. Its test-agent adapter models intake opening, reconnect, display refresh, expiry polling and transient failures. No frontend was switched to it.

## Compatibility and intentional staging boundaries

- Preserve all six recipient groups: all, online, incoming, outgoing, follow-up, manual-dial. All/online require logged-in agents; other groups additionally use the existing access flags (manual also requires manual-outgoing status). An offline agent can resolve an unexpired eligible message after logging back in.
- Preserve active selection, newest sent_at/id order, expiry choices including IST end-of-day, 500-character trimming, combined private/broadcast text and duplicate-text removal, clear audit, history limits, success/error JSON, SQL order and refresh state shape.
- Baseline message routes have **no route-level authorization**. The preview deliberately requires root-only test bearer credentials; agents may read only their own message and refresh state. Only test admins may mutate or inspect audit history. Sender/clear audit identities come from the authenticated test actor, never a forged body. This safety boundary is not claimed as production auth parity. Production authorization needs a separate reviewed integration before promotion.
- Broadcast replacement remains the original clear → insert → read sequence. It is not atomic: simultaneous admins can leave multiple active rows; the newest sent_at/id wins for display and both records remain in history. Tests characterize this behavior; a single-active transactional guarantee would be a separate behavior change.
- Private messages remain `attica_agents.admin_message`, with no independent expiry or audit-history table in the original implementation. Broadcast expiry/audit behavior is preserved. No new private-message semantics are invented.
- The generated full runtime remains unconditionally disabled. Its legacy pass-through auth adapter documents the original contract and is not suitable for public deployment.

## Data and delivery isolation

Branches continues using its existing SELECT-only snapshot account. Messaging writes only to `attica_next_messages_preview`, with synthetic TEST_* agents and synthetic announcements. Contract tests use `attica_next_messages_contract`; no production messages or agents were copied. Only the broadcast table definition was copied. Message accounts have DML grants on their own schema only; production reads and writes are explicitly denied in verification.

Provisioning: `scripts/provision-admin-message-staging.py`, refusing to replace an existing schema. Root-only credentials/test tokens are in ignored `.private/` (directory 0700, files 0600). Tests never print tokens. The preview service retains its loopback bind, network restriction, blocked production paths, journald logging and automatic restart. Diagnostic `/__test/admin-message-events` requires a test administrator and returns test metadata only.

No real SMS, WebSocket recipient, Asterisk command, queue update or job starts. Kaleyra/SolutionsInfini and Smler configuration remain unchanged.

## Verification evidence

- `npm test`: **99 passed**, including 63 Admin Messages legacy-contract/HTTP/expiry/adapter tests and the existing 36 Branches/structural/logging tests.
- `npm run test:database`: **7 passed**, including four Admin Messages tests on actual isolated MariaDB and the three Branches database tests.
- All/online/incoming/outgoing/follow-up/manual recipient rules, individual message, missing/invalid payloads, each expiry choice, database errors, clear/history and unauthorized access are characterized.
- Real MariaDB checks cover next-intake and offline reconnect, restart of service objects, expiry/clear/private composition, concurrent admins, reordered events, persisted audit and event-sink failure. Contract writes roll back; concurrent tests clean only their dedicated synthetic schema.
- `scripts/verify-admin-messages-preview.mjs` verifies authenticated HTTP on 3101, forged audit identity rejection, no production DB grants, synthetic send/clear/private display, metadata-only sink, restart persistence, cleanup, and unchanged production process/source. Evidence: `docs/ADMIN-MESSAGES-VERIFICATION.json`.
- `scripts/verify-preview.py` rechecks seven production read comparisons, Branches write blocking, preview normal/crash recovery, request/error logs, frontend/proxy isolation and source hashes. Evidence: `docs/REVIEW-VERIFICATION.json`.
- Generated candidate syntax passes; 315 net server.js lines removed across both extracted modules. This is not a completed monolith migration.

## Next gates

Customer History → Reports → Billing lookup → SMS abstraction retaining Kaleyra → Follow-ups → Agent Intake → Agent Status → Outgoing → Incoming → Asterisk/AMI/queues. Keep production unchanged until 2–4 low-risk modules and shared middleware/adapters are proven.

Before Branches promotion, run one controlled real-provider geocoding integration smoke test through the production adapter against noncustomer test coordinates/address. Verify authentication, timeout, response mapping and failure/fallback handling without any database mutation. The preview currently stubs Google/Photon; live provider integration is still unverified. This gate has not been marked complete.
