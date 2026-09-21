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

## Completed: phase 3, Customer History preview

Four read routes are extracted with shared customer-ID/primary/alternate-mobile resolution. Exact source locations, collaborator boundaries and verification are in `docs/CUSTOMER-HISTORY.md` and `docs/CUSTOMER-HISTORY-VERIFICATION.json`. The preview uses a synthetic SELECT-only MariaDB schema. Remote customer-data sync remains legacy.

## Completed: phase 4, core call Reports preview

Five core call-report endpoints are MIGRATED + TESTED: dashboard statistics, date details, full-dataset report summary, server-side list pagination and streaming CSV export. See `docs/REPORTS-CORE.md`. SEO/marketing reporting remains a separate feature; the already-separated baseline `md-reporting.mjs` remains unchanged.

## Completed: phase 5, Billing / customer-data lookup preview

Two read endpoints are extracted with their date-list and normalized-phone lookup behavior. Exact source locations, strict/cached/local/remote fallback behavior and isolation evidence are in `docs/BILLING.md` and `docs/BILLING-VERIFICATION.json`. The preview uses a dedicated synthetic SELECT-only MariaDB schema and never calls the external customer-data API or starts background billing synchronization.

## Completed: phase 6, SMS abstraction retaining Kaleyra

Send, log and delivery-callback routes now use an SMS service plus an injected Kaleyra provider client. Exact route locations, payload/audit behavior and fake-delivery isolation are in `docs/SMS-KALEYRA.md` and `docs/SMS-VERIFICATION.json`. Preview sends go only to an in-memory fake sink and isolated SMS schema; no provider credential or network request is used.

## Completed: phase 7, Follow-Ups preview

Six follow-up and status-queue registrations are MIGRATED + TESTED. Exact source ranges and isolation details are in `docs/FOLLOWUPS.md` and `docs/FOLLOWUPS-VERIFICATION.json`. The preview uses a dedicated writable synthetic schema, starts no jobs and exposes no Asterisk/dialer adapter. Production candidate wiring retains the existing queue and auto-dial collaborators.

## Following feature slices

1. Agent Intake, Agent Status.
2. Outgoing Dialer, Incoming Calls, Asterisk / AMI / Queues last.

Keep 2–4 low-risk modules isolated before considering promotion. Do not replace existing business rules with simplified sample functions. WATI remains a separate optional integration slice.

## Production cutover (not executed)

- Recheck live file hashes and incorporate subsequent production fixes before promotion. Never overwrite newer fixes with the captured baseline.
- Require a fully isolated staging run for the affected feature, preserving endpoint paths, request bodies, response shapes, error codes, authorization and registration order.
- Run a controlled real-provider geocoding smoke test before Branches promotion: authentication, timeout, response mapping and failure/fallback behavior, with no database writes. MariaDB parity is verified; live geocoding remains an open gate.
- Capture the existing deployed release and service/proxy configuration for rollback.
- Plan a maintenance window or verified parallel API-only cutover; do not assume zero interruption. Keep exactly one production scheduler.
- Switch only after review/approval of the concrete tested candidate. Monitor API failures, submissions and worker health, and roll back to the captured release if needed.

## Current production status

Phases 1–7 make no production deployment. The production service remains `/root/attica-api/server.js` on port 3001. The persistent preview is loopback-only on 3101. Branches uses a SELECT-only snapshot, Admin Messages uses synthetic staging-only records and a test sink, Customer History, Reports and Billing use synthetic SELECT-only schemas, SMS uses an isolated writable test schema plus fake provider, and Follow-Ups uses an isolated synthetic schema with no dialer. SIP trunks, queue strategy and routing configuration are outside this change.

## Verification follow-up

- `docs/REVIEW-VERIFICATION.json`: seven read-only HTTP parity probes against production, normal restart, crash recovery, logging, deployed frontend scan and unchanged production file hashes.
- `npm test`: 143 passing tests; `npm run test:database`: 22 passing real MariaDB tests. Follow-Up tests cover contracts, persistence, RNR/disconnected dry-run behavior, restart recovery and production isolation.
- `deployment/attica-api-next-preview.service`: installed and enabled, `Restart=always`, structured journald logs, loopback binding, blocked access to production source, configuration and database files.
- Credentials: `/etc/attica-next/preview-db.json` (SELECT-only snapshot) and `/etc/attica-next/contract-db.json` (writes only to the separate contract-test database). Both are root-only and outside Git. Branches receives only its read credential through systemd LoadCredential. The Admin Messages preview additionally reads ignored, root-only `.private/messages-preview-db.json` and `.private/message-actors.json`; its contract tests use `.private/messages-contract-db.json`. No production credentials are used by either adapter.
- Branches and unrelated preview mutations reject POST/PUT/DELETE with 405 by design. Admin Messages test-authenticated mutations are allowed only against synthetic staging data. Compatibility of the underlying mutation handlers is tested directly with original handlers on the contract-test database. Do not describe the public preview's write-block policy as the production mutation contract.
- Production list ignores page/limit/sort/filter inputs and returns every active branch. Autocomplete uses `q` and LIMIT 15; nearby uses location or coordinates and LIMIT 10. This refactor preserves those behaviors rather than adding pagination.
- Live geocoding services are not enabled on port 3101. Google/Photon order, failure fallbacks and request arguments are covered through injected test adapters; real provider/network availability is not certified by this verification.
- Production source/service/proxy and call handling remain unchanged. No live mutation endpoints were exercised.

## Next feature: Agent Intake

Migrate draft, final submission and reusable customer-prefill behavior while preserving idempotency, form lifecycle and the existing call identity contract. Customer History remains the shared lookup dependency. Keep hangup, hold, transfer and telephony state outside this slice until the call-control phases.
