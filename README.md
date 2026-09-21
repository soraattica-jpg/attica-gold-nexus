# Attica API: incremental modularization

Phase 1 is a Branches extraction in an isolated workspace. It is not a replacement for the production API yet.

## Current layout

- `server.js`: small synthetic preview entrypoint, loopback port 3101.
- `app.js`: side-effect-free app factory for the extracted feature.
- `modules/branches/`: routes → controller → service → repository, six existing routes.
- `shared/string.js`: the original string-cleaning semantics.
- `scripts/`: baseline verification, API inventory, deterministic full-candidate generation.
- `tests/`: legacy handler comparisons and HTTP checks; synthetic fixtures only.
- `docs/API-INVENTORY.md`: route registration inventory and migration status.
- `baseline/`: private, untracked snapshot of production source and manifests.
- `runtime/`: private, untracked generated full candidate. Startup is explicitly disabled.

The actual production API is `/root/attica-api` on port **3001**. Port 3015 is also occupied. No production file, proxy, database, SIP configuration, or service is changed by this workspace.

The small preview server is **not** evidence that the 34,845-line monolith has been fully modularized. The full candidate removes 139 lines from server.js in this first extraction; all other features remain legacy.

## Verify

```sh
cd /root/attica-api-next
npm ci --ignore-scripts
npm run prepare:runtime
npm test
node scripts/api-inventory.js --tested
```

The contract tests evaluate only the six original Branches handler definitions and their two pure helpers in a VM with scripted dependencies. They never import the legacy server, connect to MySQL, send messages, or invoke Asterisk. Tests compare response bodies, statuses, normalized SQL, parameters, geocoder calls and errors. Two structural tests verify unrelated statements and endpoint registration order remain identical in the full candidate.

The snapshot hash is checked before generating or testing a candidate. `baseline/` is deliberately not committed: the source contains existing embedded credentials. Preserve the local private snapshot; do not publish it or a generated runtime. Fresh checkouts need the same five files listed in `docs/BASELINE.json` from the private baseline, with matching hashes.

## Local preview

```sh
npm start
curl http://127.0.0.1:3101/health
curl http://127.0.0.1:3101/api/branches
curl 'http://127.0.0.1:3101/api/branches/autocomplete?q=Te'
curl 'http://127.0.0.1:3101/api/branches/search-nearby?lat=12.9&lng=77.6'
```

`ATTICA_STAGING_PORT` selects an unused non-production port. The preview is read-only and labelled `X-Attica-Staging: synthetic-data-only`. It returns a clearly marked demonstration branch. Mutations return 405, unmigrated routes return 404. Real geocoding, database writes, scheduled jobs, credentials, and telephony are absent.

A transient `attica-api-next-preview.service` may be used to keep this preview running until reboot; it is separate from `attica-api.service`. Check with `systemctl status attica-api-next-preview.service`. Stop only that preview unit to remove it. This preview is not publicly proxied.

## Migration boundaries

The full candidate mounts the extracted handlers at their original positions, using the existing `pool` proxy and geocoding helpers. It does not introduce new database pools, alter authentication, rewrite API paths, or change error handling globally. Production modules remain ES modules (`type: module`).

The original startup performs schema writes, shared-state cleanup, Asterisk queue changes and scheduler work. Changing a port or disabling clustering does not isolate it. Therefore `runtime/server.js` refuses startup. Do not remove this guard until startup adapters and staging resources are isolated.

The live SMS provider remains **Kaleyra / SolutionsInfini**; stored short URLs are Smler. The future messaging extraction must preserve that configuration, not introduce MSG91 based on an example directory name.

See `docs/MIGRATION-PLAN.md` for remaining phases and cutover requirements.
