# Agent Intake modular preview

Four intake registrations are extracted:

- `POST /api/intake-forms` (`server.js:31494–31553`)
- `GET /api/intake-workflow/pending` (`server.js:31555–31568`)
- `GET /api/intake-workflow` (`server.js:31570–31573`)
- `POST /api/intake-workflow` (`server.js:31575–31582`)

The existing `intake-workflow.mjs` remains the authoritative production workflow engine. Candidate wiring injects its `read`, `readPending` and `mutate` operations plus the existing locked intake upsert, endpoint-idle guard, IVR cache sync and serializer. This preserves draft revisions, call/intake identity, explicit submission, error status mapping and pending restore behavior. Hangup event ingestion, Asterisk, Hold, Transfer and routing stay outside this route slice.

The preview stores only synthetic records in `attica_next_intake`. It has no timer, auto-submit job, Asterisk adapter or production schema grants. Drafts survive preview restart; final submission is explicit and leaves `autoSubmitAt` null. See `INTAKE-VERIFICATION.json`.
