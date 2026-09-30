# Core call Reports: migrated and tested in preview

| Endpoint | Original server.js range | Status |
| --- | --- | --- |
| GET /api/stats | 23622–23655 | MIGRATED + TESTED |
| GET /api/calls/date-details | 31700–31714 | MIGRATED + TESTED |
| GET /api/calls/export | 31716–31831 | MIGRATED + TESTED |
| GET /api/calls/report-summary | 31858–32010 | MIGRATED + TESTED |
| GET /api/calls/list | 32013–32170 | MIGRATED + TESTED |

The service preserves dashboard/date summaries, complete-dataset source filtering, cache behavior, server-side list counts and page slicing. CSV export keeps cursor batches of 5,000, backpressure handling, full filtered scope, source filtering, response headers and the unlimited-row marker. The list page-size cap applies only to returned rows and never limits summary counts.

The generated candidate injects the existing production filters, SQL visibility rules, serializers, recording backfill and analytics functions. The repository owns count/detail SQL and cursor streaming. The preview uses the synthetic Customer History call database through a SELECT-only account. It contains no production calls and cannot access production tables. All report requests require a test actor.

The core call report is complete in preview. SEO/marketing reporting remains a distinct feature. `md-reporting.mjs` was already a separate baseline module and remains unchanged; its snapshot/detail/export contracts are recorded as an existing dependency rather than claimed as a new extraction.

Verification: 124 unit/HTTP/structural tests and 14 real MariaDB tests pass across the candidate. `REPORTS-CORE-VERIFICATION.json` records authenticated HTTP, complete-date/range aggregation, source and agent filtering, count-before-pagination behavior, CSV scope, restart recovery and unchanged production evidence.
