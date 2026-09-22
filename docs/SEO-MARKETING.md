# SEO & Marketing extraction — in progress

## Why this slice exists

The live SEO/Marketing dashboard fix was an urgent compatibility patch to
`/root/attica-api/server.js`. It must not be the pattern for further feature
work. The candidate module now owns the reusable date, cache, authorization,
controller, repository and route contracts for this feature.

## Current source locations

These are line ranges in the deployed production source as measured on
2026-09-22. They are not the older private-baseline line numbers.

| Concern | Production location | Candidate location |
| --- | --- | --- |
| Date limits, cache keys, refresh bypass and linked-bill cache | `server.js:25162–25267` | `modules/seo-marketing/seo-marketing.validation.js`, `seo-marketing.cache.js` |
| Lead rows, summary metrics, aggregation and pagination | `server.js:25269–26817` | pending repository/service adapter extraction |
| Dashboard authorization and seven HTTP endpoints | `server.js:26819–27043` | `seo-marketing.controller.js`, `seo-marketing.routes.js` |
| Google Ads / Search Console metric adapter | `server.js:995–1203` and feature helpers | pending isolated provider adapter |

## Current candidate contents

- `seo-marketing.validation.js`: normalizes `startDate` / `endDate` and emits
  the exclusive next-day SQL boundary in `Asia/Kolkata`.
- `seo-marketing.cache.js`: produces filter-specific cache keys and recognizes
  a refresh token without treating it as a remote synchronization request.
- `seo-marketing.service.js`: centralizes role checks, date normalization and
  cache policy.
- `seo-marketing.repository.js`: requires explicit injected adapters for all
  seven route operations, preventing hidden SQL or provider access.
- `seo-marketing.controller.js` and `seo-marketing.routes.js`: preserve the
  existing endpoint paths and response/error boundaries.

This module is mounted only on loopback preview port 3101 with deterministic
local fixtures. The SEO fixture has no reporting-database adapter, production
credential, remote Meta/Google/Search Console request, provider delivery,
background sync or telephony access. The fixture verifies route wiring and
date/cache/export contracts; it is not a production-parity data source.

## Compatibility gates before production-data parity or cutover

1. Build a SELECT-only reporting schema or snapshot containing lead,
   attribution, call and bill fixtures.
2. Inject local metric adapters; do not call Meta, Google, Search Console or
   remote Customer Data APIs from the preview request path.
3. Compare each of the seven endpoint contracts against production for
   status, JSON fields, filters, pagination, IST date boundaries and exports.
4. Verify current-page and all-matching exports separately.
5. Compare the real-data adapters against production before updating the API
   inventory from `feature registration` to `MIGRATED + TESTED`.

No production route, source file, database, provider credential, background
sync, dialer, SIP or queue behavior is changed by this candidate extraction.
