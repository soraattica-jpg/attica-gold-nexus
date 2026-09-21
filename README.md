# Attica API: incremental modularization

Branches is extracted and verified in `/root/attica-api-next`. Production remains `/root/attica-api`, port 3001, with its existing process and source unchanged.

## Run and verify

```sh
cd /root/attica-api-next
npm ci --ignore-scripts
npm run prepare:runtime
npm test
npm run test:database
node scripts/api-inventory.js --tested
python3 scripts/verify-preview.py
```

`verify-preview.py` performs read-only comparisons against production, then restarts and deliberately crashes **only** `attica-api-next-preview.service` to verify recovery. It also scans deployed frontend assets and the reverse proxy. The database tests write only to `attica_api_next_contract` and roll back changes.

## Preview service

- URL: `http://127.0.0.1:3101/health`, loopback-only.
- Unit: `attica-api-next-preview.service`, installed/enabled, `Restart=always`.
- Database: `attica_api_next_preview`, a snapshot of 253 branch records (197 active at capture).
- Login: `attica_next_read`, SELECT-only on that snapshot; no access to production tables.
- HTTP mutations: blocked with 405. Underlying create/update/delete contracts are verified against original handlers using the separate staging database.
- Logs: `journalctl -u attica-api-next-preview.service`. Structured request/error records include request ID, route, status and duration; exclude query values, bodies and SQL details.
- Credentials: `/etc/attica-next`, root-only, loaded through systemd credentials. No credentials in Git.
- Geocoding: test adapters only; no external provider calls from preview. Coordinates-based results match production on the captured dataset. Provider contracts/fallbacks have isolated tests, but live provider availability is outside verification.
- `ATTICA_PREVIEW_DATA=synthetic npm start` offers the original synthetic mode without database credentials (stop the existing preview or choose a different staging port first).

The preview cannot invoke Asterisk, send messages, or start production jobs. The deployed frontend/proxy still points to 3001; port 3101 is not publicly proxied.

## Architecture and status

- `app.js` / `server.js`: isolated preview composition and startup; no legacy server import.
- `modules/branches/`: six routes → HTTP controllers → business service → database repository.
- `config/preview-database.js`: limited read-only staging connection.
- `middleware/request-logger.js`: structured preview request/error logging.
- `shared/string.js`: extracted legacy string cleaning.
- `tests/`: 36 contract/HTTP/structure/logging tests and three real MariaDB tests.
- `docs/API-INVENTORY.md` / `.json`: all six Branches entries marked MIGRATED + TESTED (candidate only), with original line ranges.
- `docs/MIGRATION-PLAN.md`: exact replacement locations and deployment boundaries.
- `docs/ADMIN-MESSAGES-NEXT.md`: next feature's dependency and test checklist; not yet migrated.
- `docs/VERIFICATION.json`: historical first-pass evidence; `docs/REVIEW-VERIFICATION.json`: current follow-up evidence.

This is an incremental extraction, not a completed monolith rewrite. The full candidate removes 139 lines from the original 34,845-line server. `runtime/server.js` is a generated review artifact with startup disabled because legacy initialization still creates schema, runs jobs and changes Asterisk queues.

Private baseline and generated runtime are excluded from Git because the legacy source contains embedded credentials. Hashes in `docs/BASELINE.json` verify the snapshot. Fresh checkouts need the matching private baseline files before characterization tests can run. Never replace newer production fixes using an old snapshot.

The live SMS provider is Kaleyra / SolutionsInfini, with stored Smler URLs. Its eventual module must preserve that integration; MSG91 is not being introduced.
