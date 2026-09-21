# Migration plan and validation record

## Completed: phase 1, isolated Branches slice

Exact original locations in the hash-verified private baseline (not moving current line numbers):

| Endpoint | Original source range | Candidate status |
| --- | --- | --- |
| GET /api/branches | `server.js:29405–29420` | MIGRATED + TESTED |
| POST /api/branches | `server.js:29422–29433` | MIGRATED + TESTED |
| PUT /api/branches/:id | `server.js:29435–29449` | MIGRATED + TESTED |
| DELETE /api/branches/:id | `server.js:29451–29456` | MIGRATED + TESTED |
| GET /api/branches/search-nearby | `server.js:29459–29531` | MIGRATED + TESTED |
| GET /api/branches/autocomplete | `server.js:30581–30591` | MIGRATED + TESTED |

`serializeBranchRow` was replaced at original `server.js:29383–29403` by dependency wiring. The five catalog/nearby registrations are mounted at original line 29405; autocomplete stays at its original registration position, line 30581. See `scripts/prepare-runtime.js` for the AST-based replacement and `docs/BASELINE.json` for the source hash.

The service preserves URL precedence, create defaults, update aliases, soft deletion, nearby geocoder order, distance calculation/radius fallback and empty autocomplete error responses. SQL stays in the repository. The original database proxy is injected so async request/transaction routing stays intact. The nearby service receives existing Google/Photon helpers; their implementation has not moved yet.

Verification: 32 legacy-versus-module cases, one HTTP test, one unchanged-statements test, one route-order test, and one logging test: **36 passing contract/HTTP/structure/logging tests**, plus **3 real MariaDB tests**. Syntax check passed for the generated full candidate. These checks establish the extracted Branches contract, not full-system production readiness. No real SMS, hold/transfer, queue, bill or customer-history flow was exercised.

Private baseline recorded before changes; Git baseline commit and production/staging marker branches exist. `refactor/modular-server` contains candidate work. Marker branches are not deployment automation.

## Infrastructure track: startup and adapter isolation

1. Move database configuration behind explicit injected executors and backend-only environment configuration; retain the AsyncLocalStorage pool proxy and pool sizing behavior.
2. Separate import/registration from schema initialization, queue updates, filesystem writes and job startup. Preserve the single scheduler / multiple API worker topology.
3. Prepare a separate staging database and provider stubs, including no-op Asterisk adapters. Do not start a duplicate scheduler against production.
4. Test startup, shutdown, worker restarts, configuration errors and absence of side effects when modules are imported.

## Following feature slices

Extract one feature per reviewed and verified change:

1. Admin broadcasts and UI refresh, retaining audience, expiry, authorization and audit behavior.
2. Kaleyra SMS send/log/DLR handling; preserve request authentication, callback validation, provider IDs and delivery statuses. Keep provider keys backend-only. No real message sends for automated tests.
3. WATI with stubbed external requests.
4. Customer history/profile using the existing identity rules and source-specific field mappings.
5. Reporting and billing with snapshot, filters, deduplication and attribution parity tests.
6. Follow-ups, intake/drafts/finalization, agent status and session handling.
7. Outgoing/incoming call handling, queue management and Asterisk controls last, using captured event fixtures before controlled telephony tests.

Do not replace business rules using simplified example status/phone functions. Extract existing behavior first; any accuracy correction should be a separate change with its own tests.

## Production cutover (not executed)

- Recheck live file hashes and incorporate subsequent production fixes before promotion. Never overwrite newer fixes with the captured baseline.
- Require a fully isolated staging run for the affected feature, preserving endpoint paths, request bodies, response shapes, error codes, authorization and registration order.
- Review geocoding adapters and test Branches against a separate MySQL database; real MariaDB tests now compare original and modular handlers on isolated snapshots; provider geocoding remains stubbed in the preview.
- Capture the existing deployed release and service/proxy configuration for rollback.
- Plan a maintenance window or verified parallel API-only cutover; do not assume zero interruption. Keep exactly one production scheduler.
- Switch only after review/approval of the concrete tested candidate. Monitor API failures, submissions and worker health, and roll back to the captured release if needed.

## Current production status

Phase 1 makes no production deployment. The production service remains `/root/attica-api/server.js` on port 3001. The persistent preview is loopback-only on 3101 and reads a separate 253-row branch snapshot through a SELECT-only database account. Its 197 active branches match production. A second staging database covers mutation tests with rollback. SIP trunks, queue strategy, routing and messaging configuration are outside this change.

## Verification follow-up

- `docs/REVIEW-VERIFICATION.json`: seven read-only HTTP parity probes against production, normal restart, crash recovery, logging, deployed frontend scan and unchanged production file hashes.
- `npm test`: 36 passing tests; `npm run test:database`: three passing real MariaDB tests covering all six routes, stored-column parity, rollback and denied production access.
- `deployment/attica-api-next-preview.service`: installed and enabled, `Restart=always`, structured journald logs, loopback binding, blocked access to production source, configuration and database files.
- Credentials: `/etc/attica-next/preview-db.json` (SELECT-only snapshot) and `/etc/attica-next/contract-db.json` (writes only to the separate contract-test database). Both are root-only and outside Git. Preview receives only its read credential through systemd LoadCredential.
- Preview rejects POST/PUT/DELETE with 405 by design. Compatibility of the underlying mutation handlers is tested directly with original handlers on the contract-test database. Do not describe the public preview's write-block policy as the production mutation contract.
- Production list ignores page/limit/sort/filter inputs and returns every active branch. Autocomplete uses `q` and LIMIT 15; nearby uses location or coordinates and LIMIT 10. This refactor preserves those behaviors rather than adding pagination.
- Live geocoding services are not enabled on port 3101. Google/Photon order, failure fallbacks and request arguments are covered through injected test adapters; real provider/network availability is not certified by this verification.
- Production source/service/proxy and call handling remain unchanged. No live mutation endpoints were exercised.

## Next feature: Admin Messages

The next extraction is **Admin Messages**, not startup of the full runtime or any call-control code. Its exact dependency/contract checklist is in `docs/ADMIN-MESSAGES-NEXT.md`. It is not marked migrated or tested yet. Subsequent order: Kaleyra SMS, Customer History, Reports, Billing lookup, Follow-ups, Agent Intake, Agent Status, Outgoing Dialer, Incoming Calls, Asterisk/AMI/queues last. WATI can be handled as a separate integration slice when needed.
