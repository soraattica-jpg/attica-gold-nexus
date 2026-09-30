# Follow-Ups modular preview

Six registrations are extracted behind routes → controller → service → repository adapters:

- `GET /api/followups` (`server.js:22951–22988`)
- `POST /api/followups/load-rnr-disconnected` (`server.js:22990–23013`)
- `POST /api/followups` (`server.js:23170–23175`)
- `PUT /api/followups/:id` (`server.js:23262–23267`)
- `GET /api/status-followups` (`server.js:29290–29310`)
- `PUT /api/status-followups/:id` (`server.js:29312–29380`)

The generated candidate injects the existing production expiry, selection, RNR/disconnected loader, persistence, auto-dial synchronization and status-queue collaborators at the original registration positions. Port 3101 uses only `attica_next_followups`, synthetic numbers and a no-telephony adapter. Its database account has no access to the production schema. Maintenance loads report `telephonyTriggered:false`; no scheduler, originate action or queue worker runs.

Compatibility covers limit clamping, expiry-before-list, loader flags, save/update responses and status lifecycle. MariaDB checks cover persistence, dry-run behavior and isolated queue updates. `scripts/verify-followups-preview.mjs` proves authenticated HTTP behavior, restart persistence, database denial and unchanged production source/service state.
