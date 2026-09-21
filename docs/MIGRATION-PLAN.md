# Migration plan and validation record

## Completed: phase 1, isolated Branches slice

Six routes extracted:

- GET /api/branches
- POST /api/branches
- PUT /api/branches/:id
- DELETE /api/branches/:id
- GET /api/branches/search-nearby
- GET /api/branches/autocomplete

The service preserves URL precedence, create defaults, update aliases, soft deletion, nearby geocoder order, distance calculation/radius fallback and empty autocomplete error responses. SQL stays in the repository. The original database proxy is injected so async request/transaction routing stays intact. The nearby service receives existing Google/Photon helpers; their implementation has not moved yet.

Verification: 32 legacy-versus-module cases, one HTTP test, one unchanged-statements test, one route-order test: **35 passing tests**. Syntax check passed for the generated full candidate. These checks establish the extracted Branches contract, not full-system production readiness. No real SMS, hold/transfer, queue, bill or customer-history flow was exercised.

Private baseline recorded before changes; Git baseline commit and production/staging marker branches exist. `refactor/modular-server` contains candidate work. Marker branches are not deployment automation.

## Next phase: startup and adapter isolation

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
- Review geocoding adapters and test Branches against a separate MySQL database; current contract tests use scripted database responses.
- Capture the existing deployed release and service/proxy configuration for rollback.
- Plan a maintenance window or verified parallel API-only cutover; do not assume zero interruption. Keep exactly one production scheduler.
- Switch only after review/approval of the concrete tested candidate. Monitor API failures, submissions and worker health, and roll back to the captured release if needed.

## Current production status

Phase 1 makes no production deployment. The production service remains `/root/attica-api/server.js` on port 3001. The optional preview is loopback-only on 3101 and uses synthetic Branches data. SIP trunks, queue strategy, routing and messaging configuration are outside this change.
