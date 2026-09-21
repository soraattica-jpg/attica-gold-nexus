# Reports core: first read-only slice migrated and tested

This phase moves two low-risk read endpoints:

| Endpoint | Original server.js range | Status |
| --- | --- | --- |
| GET /api/stats | 23622–23655 | MIGRATED + TESTED |
| GET /api/calls/date-details | 31700–31714 | MIGRATED + TESTED |

The service preserves the stats response fields and assembles dashboard summary, queue metrics and hourly results concurrently. Date details keeps date validation, normalized agent filtering, complete serialized rows, the top-level summary fields and the nested `summary` object.

The generated candidate injects the existing production aggregation, cached row, serialization and summarization functions. The preview uses the synthetic Customer History call database through a SELECT-only account. It contains no production calls and cannot access production tables. All report requests require a test actor.

The Reports feature is not complete. `/api/calls/report-summary`, `/api/calls/list`, `/api/calls/export`, SEO/marketing summaries and the already-separate `md-reporting.mjs` routes remain legacy/pending. They require dedicated filter, pagination, snapshot and streaming-export parity tests before extraction.

Verification: 115 unit/HTTP/structural tests and 12 real MariaDB tests pass across the candidate. `REPORTS-CORE-VERIFICATION.json` records authenticated HTTP, complete-date aggregation, server-side agent filtering, validation, restart recovery and unchanged production evidence.
