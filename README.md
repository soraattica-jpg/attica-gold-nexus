# Attica API: incremental modularization

Branches, Admin Messages, Customer History, core call Reports, Billing/customer-data lookup, Kaleyra SMS, Follow-Ups, Agent Intake, Agent Status reads, and Rates/Pledge Places are extracted and tested in `/root/attica-api-next`. Production remains `/root/attica-api`, port 3001, with its process and source unchanged. No production frontend points to the preview.

## Run and verify

```sh
cd /root/attica-api-next
npm ci --ignore-scripts
npm run prepare:runtime
npm test
npm run test:database
npm run check:large-files
node scripts/api-inventory.js --tested
python3 scripts/verify-preview.py
node scripts/verify-admin-messages-preview.mjs
node scripts/verify-customer-history-preview.mjs
node scripts/verify-reports-preview.mjs
node scripts/verify-billing-preview.mjs
node scripts/verify-sms-preview.mjs
node scripts/verify-reference-data-preview.mjs
node scripts/verify-route-ownership.mjs
```

The verification scripts restart **only** `attica-api-next-preview.service`; `verify-preview.py` also deliberately crashes it to test automatic recovery and performs read-only production Branches comparisons. The message verifier sends only synthetic announcements to the isolated preview and clears them afterward. Never change its target to production.

Current results: **164 contract/HTTP/structure/logging tests + 25 real MariaDB tests passed**. The generated candidate also passes syntax checks.

## Preview service

- `http://127.0.0.1:3101/health`: loopback-only, persistent systemd service, automatic restart, no jobs or telephony.
- Branches: SELECT-only account on `attica_api_next_preview` (253 snapshot rows, 197 active). Mutations remain blocked with 405; underlying contracts are verified against original handlers on `attica_api_next_contract`.
- Admin Messages: test-authenticated requests only, synthetic TEST_* agents/messages on `attica_next_messages_preview`. Separate contract database `attica_next_messages_contract`. Both message accounts are denied production table access.
- Customer History: authenticated reads against synthetic `attica_next_customer_history`; its account is SELECT-only and cannot access production tables.
- Reports core: five authenticated dashboard/detail/summary/list/export routes over the same synthetic SELECT-only calls dataset; list pagination counts the complete matching population and CSV export streams the full filtered scope.
- Billing lookup: two authenticated customer-data routes over a dedicated synthetic SELECT-only schema; external customer-data calls and background synchronization are disabled.
- SMS: send/log/DLR routes use the Kaleyra provider contract with an isolated writable test database and fake-only delivery sink. No real SMS or provider credential is used.
- Follow-Ups: list/load/save/update and status queue routes use an isolated synthetic database. No scheduler, auto-dialer or telephony action exists in preview.
- Agent Intake: form save, pending restore, workflow read and explicit mutation use an isolated schema. Draft restart persistence is verified and there is no preview auto-submit timer or telephony adapter.
- Agent Status reads: agent list, detail and session history are exposed from synthetic preview data without Asterisk/PJSIP access.
- Reference data: rates and pledge-place CRUD is authenticated and process-local; restart restores fixtures and no database is accessed.
- Test delivery: injected in-memory event sink, no production sockets or recipients. Authenticated test administrators can inspect `/__test/admin-message-events`; payloads contain invalidation metadata only. Persisted state supplies reconnect/next-intake displays.
- Logs: `journalctl -u attica-api-next-preview.service`; correlated request/error records omit query values, bodies and SQL details.
- Credentials: Branches uses root-only `/etc/attica-next` via systemd credentials. Messaging uses root-only, ignored `.private/` config/test actors. No credentials in Git or verification output.
- Provisioning: `scripts/provision-admin-message-staging.py` creates synthetic message fixtures once and refuses to overwrite existing schemas. Fresh checkouts also require the original private Branches fixtures/credentials and hash-matching baseline.
- Geocoding: test adapters only. A controlled live-provider authentication/timeout/mapping/failure smoke test remains required before Branches promotion.
- `ATTICA_PREVIEW_DATA=synthetic npm start` retains the original Branches-only synthetic mode; use an unused staging port if 3101 is already running.

The installed service's original description still says read-only; Branches is read-only, while the isolated message schema intentionally accepts authenticated test writes. Network and filesystem restrictions remain in force.

## Architecture and evidence

- `modules/branches/`: six routes, controller, service and repository.
- `modules/seo-marketing/`: IST date/query normalization, response-cache
  policy, controller, route contract and injected repository boundary for the
  seven SEO/Marketing endpoints. It is in progress and not preview-mounted;
  see `docs/SEO-MARKETING.md`.
- `modules/reference-data/`: four rate and two pledge-place routes with injected persistence.
- `modules/call-records/`, `agent-management/`, `call-control/`, `lead-ingestion/`, `marketing/`, `auto-dial/`, and `location-ivr/`: strict owners for the remaining preserved legacy handlers.
- `modules/admin-messages/`: six message/UI refresh routes plus message-only agent update interception, controller, service, repository, validation and tests.
- `modules/customer-history/`: four customer lookup/profile/history routes with one shared identity resolver.
- `modules/reports/`: five core call-report routes with full-dataset aggregation, server-side pagination and streaming CSV export.
- `modules/billing/`: date-based billed-customer list and normalized customer/bill lookup with strict and local fallback behavior.
- `modules/sms/` and `integrations/sms/providers/kaleyra.client.js`: SMS orchestration, audit persistence, DLR handling and the existing Kaleyra provider contract.
- `events/test-admin-message-sink.js`: test transport and reconnect/display adapter, separate from business logic.
- `config/preview-admin-messages.js` and `middleware/preview-message-auth.js`: isolated persistence and test-actor authorization.
- `docs/API-INVENTORY.md`: all 120 `server.js` path registrations have explicit feature owners; 45 have controller/service extraction and 75 retain byte-preserved handlers behind seven bounded feature route contracts.
- `docs/MIGRATION-PLAN.md` and `docs/ADMIN-MESSAGES-NEXT.md`: exact original source locations, preserved behavior, remaining gates.
- `docs/MODULE-MAP.md` and `docs/DEVELOPMENT-RULES.md`: permanent
  module-first ownership and oversized-file review rules for every new change.
- `docs/ADMIN-MESSAGES-VERIFICATION.json` and `docs/REVIEW-VERIFICATION.json`: running preview, restart, database boundary and production-isolation evidence. `docs/VERIFICATION.json` is historical first-phase evidence.

Legacy Admin Messages uses polling/refresh tokens, not an existing feature WebSocket. The preview adds no live socket delivery. Legacy message routes also lack route-level authorization; production auth integration is an explicit pre-promotion gate. Concurrent broadcasts retain the original newest-record selection and nontransactional replacement; private-message expiry/audit does not exist in the baseline. See the detailed module report before promotion.

This completes route ownership, not the full business-logic decomposition. The generic compatibility registry is removed. The generated candidate removes about 1,434 lines from the original server and startup remains unconditionally disabled. Feature-owned preserved handlers still contain legacy side effects and the candidate must never be launched. The private baseline and runtime are excluded from Git because the legacy source contains embedded credentials; `docs/BASELINE.json` records the hashes.

Further work is controller/service extraction of the 75 feature-owned preserved handlers, with call handling, Asterisk, AMI and queues last. Kaleyra/SolutionsInfini remains the SMS provider; Smler URLs, Asterisk, SIP, queues and dialer behavior remain unchanged.
