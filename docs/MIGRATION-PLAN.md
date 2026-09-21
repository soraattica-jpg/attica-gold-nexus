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

## Completed: phase 2, Admin Messages preview

Six message/UI-refresh endpoints and the private-message-only portion of PUT /api/agents/:id are now extracted. Exact original ranges, shared-state dependencies, original behavior limitations, test-auth policy and verification are in `docs/ADMIN-MESSAGES-NEXT.md`. No other agent update logic was moved. API inventory distinguishes the partial agent endpoint from fully migrated routes.

## Following feature slices

1. Customer History with shared identity resolution and source-specific mappings.
2. Reports, then Billing / bill lookup with filter, snapshot and attribution parity.
3. SMS abstraction retaining Kaleyra/SolutionsInfini; URL shortening remains separate. No real sends in tests.
4. Follow-ups, Agent Intake, Agent Status.
5. Outgoing Dialer, Incoming Calls, Asterisk / AMI / Queues last.

Keep 2–4 low-risk modules isolated before considering promotion. Do not replace existing business rules with simplified sample functions. WATI remains a separate optional integration slice.

## Production cutover (not executed)

- Recheck live file hashes and incorporate subsequent production fixes before promotion. Never overwrite newer fixes with the captured baseline.
- Require a fully isolated staging run for the affected feature, preserving endpoint paths, request bodies, response shapes, error codes, authorization and registration order.
- Run a controlled real-provider geocoding smoke test before Branches promotion: authentication, timeout, response mapping and failure/fallback behavior, with no database writes. MariaDB parity is verified; live geocoding remains an open gate.
- Capture the existing deployed release and service/proxy configuration for rollback.
- Plan a maintenance window or verified parallel API-only cutover; do not assume zero interruption. Keep exactly one production scheduler.
- Switch only after review/approval of the concrete tested candidate. Monitor API failures, submissions and worker health, and roll back to the captured release if needed.

## Current production status

Phases 1 and 2 make no production deployment. The production service remains `/root/attica-api/server.js` on port 3001. The persistent preview is loopback-only on 3101 and reads a separate 253-row branch snapshot through a SELECT-only database account. Its 197 active branches match production. Admin Messages uses a separate staging-only DML account and synthetic message/agent schema; authenticated test requests publish only to an in-memory test sink. A second staging database covers mutation tests with rollback. SIP trunks, queue strategy, routing and messaging configuration are outside this change.

## Verification follow-up

- `docs/REVIEW-VERIFICATION.json`: seven read-only HTTP parity probes against production, normal restart, crash recovery, logging, deployed frontend scan and unchanged production file hashes.
- `npm test`: 99 passing tests; `npm run test:database`: seven passing real MariaDB tests. Both modules cover contracts, database behavior and denied production access; Admin Messages adds reconnect, expiry, concurrency, authorization and event-failure cases.
- `deployment/attica-api-next-preview.service`: installed and enabled, `Restart=always`, structured journald logs, loopback binding, blocked access to production source, configuration and database files.
- Credentials: `/etc/attica-next/preview-db.json` (SELECT-only snapshot) and `/etc/attica-next/contract-db.json` (writes only to the separate contract-test database). Both are root-only and outside Git. Branches receives only its read credential through systemd LoadCredential. The Admin Messages preview additionally reads ignored, root-only `.private/messages-preview-db.json` and `.private/message-actors.json`; its contract tests use `.private/messages-contract-db.json`. No production credentials are used by either adapter.
- Branches and unrelated preview mutations reject POST/PUT/DELETE with 405 by design. Admin Messages test-authenticated mutations are allowed only against synthetic staging data. Compatibility of the underlying mutation handlers is tested directly with original handlers on the contract-test database. Do not describe the public preview's write-block policy as the production mutation contract.
- Production list ignores page/limit/sort/filter inputs and returns every active branch. Autocomplete uses `q` and LIMIT 15; nearby uses location or coordinates and LIMIT 10. This refactor preserves those behaviors rather than adding pagination.
- Live geocoding services are not enabled on port 3101. Google/Photon order, failure fallbacks and request arguments are covered through injected test adapters; real provider/network availability is not certified by this verification.
- Production source/service/proxy and call handling remain unchanged. No live mutation endpoints were exercised.

## Next feature: Customer History

Admin Messages is complete for the isolated preview, not production promotion. Evidence and exact locations are in `docs/ADMIN-MESSAGES-NEXT.md` and `docs/ADMIN-MESSAGES-VERIFICATION.json`. Customer History is next so its lookup service can be verified before Agent Intake depends on it.
