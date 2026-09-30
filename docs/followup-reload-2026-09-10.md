# Telugu routing and 15-day follow-up reload

## Scope

Investigate Telugu call connection failures and load eligible RNR and pending
follow-up records from the preceding 15 days. No agent mode changes, forced
hangups, PBX restarts, or dialplan changes were performed.

## Findings

- At 06:33 UTC (12:03 IST), the preceding 30 minutes of the Telugu queue log
  contained 9 queue entries and 9 connects, with 1-2 seconds of queue waiting.
  This is evidence of working routing, not an end-to-end audio quality test.
- The Tata SIP registration was Registered. Telugu queue members were available.
- Recent unsuccessful outgoing attempts from extensions 2006, 2063 and 2008
  have BUSY CDR outcomes. The same extensions also have ANSWERED calls.
  These outcomes alone do not identify whether the recipient or carrier caused
  the failure. An exact affected agent, number and time is still useful.
- AG049 has an unfinished intake with a confirmed end at 05:43:06 UTC and no
  explicitly selected disposition. That workflow correctly prevents a new call.
  It was not cleared or submitted with invented details.

## Reload correction

The existing RNR loader could reopen an expired follow-up while keeping its
expired follow-up and auto-dial expiry dates. Explicit manual reloads now renew
the expired follow-up window and copy that expiry into its queue entry.
Automatic reloads do not renew existing expired follow-ups.

Added local maintenance options `reason: "rnr"` and `dryRun: true` to the existing
`POST /api/followups/load-rnr-disconnected?days=15` endpoint. Existing default
reason selection is unchanged. The patch is in
`deployment/followup-reload-server.patch`.

The API workers were replaced one at a time; the cluster parent and Asterisk
remained running. No frontend deployment was needed for this change.

## Applied data changes

- Reloaded 8 existing eligible RNR follow-ups using the existing audited loader.
- Restored 116 eligible pending follow-ups missing from the auto-dial queue.
- Total: 124 queue entries loaded; this is not a promise of 124 connected calls.
- Live dispatch subsequently assigned, dialed and completed RNR entries.
- All loaded entries were in the follow-up work mode with valid expiry dates.
- Verification found no blocked numbers and no duplicate open phone entries.
- A second pending-only dry run returned 0 candidates.

Blocked numbers, existing open queues, terminal stop states, today's retry
limits, connected-today exclusions and future callback schedules are preserved.
The 15-day historical selection does not change the existing 7-day queue
retention policy or restore every previously completed/expired follow-up.

`scripts/load-pending-followups.mjs` is a server-local maintenance utility;
it defaults to dry run. Applying requires `--apply`. Each source follow-up is
locked and rechecked in a transaction before creating or restoring its queue
entry. Live assignments are not displaced.

## Verification and backup

- `node --check /root/attica-api/server.js`
- `node scripts/verify-followup-reload.mjs`: 13 checks passed in a disposable
  schema-only test database, including dry run, scope, expiry, schedule and
  duplicate behavior. The test database was removed afterwards.
- `node scripts/load-pending-followups.mjs --days=15`: 0 remaining candidates.

Private preimages, loader response, restored IDs and verification snapshots are
under `/root/attica-api/backups/followup-15days-2026-09-10/`. These contain customer
data and are not published in the frontend or repository.
