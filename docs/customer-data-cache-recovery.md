# Customer Data Empty-Table Recovery

Deployed 2026-09-09 to the call-center server. This does not change bill matching,
agent attribution, permitted statuses, Bill IDs, amounts or weights.

## Cause

The local database had today's billing records, but opening Customer Data awaited
source synchronization and sequential transaction lookups for up to 500 rows.
Remote transaction requests were failing with HTTP 503/network errors. The shared
frontend read helper converted failures into an empty successful-looking result,
and the page displayed zero counts and a new "Last sync" timestamp.
Transaction enrichment also overwrote the source status, causing rows to move
in and out of the Billed/Release filter between synchronization passes.

## Changes

- List requests read the local reporting cache without waiting for external APIs.
- Source and transaction refresh run in the background. Dedicated-connection
  MariaDB named locks prevent duplicate work across API/scheduler processes.
- The existing scheduler refreshes today's billing data every reporting sync
  interval (60 seconds), without overlapping an unfinished enrichment job.
- Transaction failures are not cached as no records and are not marked synced.
  Three consecutive failures stop that batch; later runs can retry.
- The main status stays owned by Customer Data. Transaction status is stored
  separately and cannot replace Release/Billed with a transaction workflow stage.
- The contacted-agent lookup uses the normalized-phone index, with a restricted
  fallback for older calls missing a normalized number.
- Customer Data requests reject HTTP/error/malformed/wrong-date responses.
- The date-specific loader aborts obsolete requests and preserves same-date rows
  on refresh failure. Initial failure shows N/A and an error, not a valid zero.
- Last billing sync comes from the stored billing data, displayed in IST.

## Verification

- `node scripts/verify-customer-data-cache.mjs`: 24 backend checks, with no
  customer writes or external API calls in the test.
- `npm test -- --reporter=dot`: 204 tests passed, including six loader lifecycle
  cases and strict billing API response handling.
- Production build and Node syntax check passed. The existing 57 production-source
  TypeScript diagnostics remain; no new hook/AdminPanel diagnostics were found.
- Read-only comparison: identical 110 phone-to-agent matches; lookup improved
  from 695 ms to 17 ms for the captured cohort.
- Before: today's API returned 107 rows in 13,382 ms. After deployment and further
  live billing, a forced refresh returned 112 rows / 111 contacts in 1,566 ms,
  77,128 bytes. Gross weight existed on 112 rows and net weight on 111 rows.
- Entry bundle: `index-CEheKITc.js`. API/scheduler children rolled without restarting
  Asterisk or forcing active agent browsers to reload.
- Final public HTTPS check after the status-authority correction: 9 September
  returned 115 unique Bill IDs / 113 contacts, 115 gross weights and 114 net weights
  in 4,195 ms; 8 September returned 80 bills in 1,113 ms. Every row matched the
  requested date. Source-status mismatches were zero and billing error logs empty.

Counts are live observations, not fixed expected totals. New bills can change them.
The API retains its existing call-center association filter, so this is not a
count of every company transaction in the remote customer database.

## Recovery

Private code/index and remote-customer-table backup:
`/root/attica-api/backups/customer-data-empty-2026-09-09/`.
Do not publish that directory; it contains customer data.

Runtime changes are recorded in `deployment/customer-data-cache.patch`.
Frontend changes are in `useCustomerDataDashboard`, `AdminPanel` and `api.ts`.
No database schema migration or manual billing-data replacement was needed.
If reverting code, do not overwrite newer customer records with the backup.
