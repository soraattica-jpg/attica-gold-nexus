# Billing / customer-data lookup: migrated and tested in preview

| Endpoint | Original server.js range | Status |
| --- | --- | --- |
| GET /api/customerdata/list | 23547–23565 | MIGRATED + TESTED |
| GET /api/customerdata | 23567–23619 | MIGRATED + TESTED |

The list preserves date normalization, the 1–10,000 limit, force/refresh parsing, `atticagold.biz` source label, total/result fields, sync timestamp and the existing temporary-unavailable error. The phone lookup preserves number normalization, strict cached-billing behavior, normal cached-billing plus local-intake merging, the 2.5-second remote fallback boundary, remote payload shape, local fallback and legacy `[]` error response.

The generated candidate injects the existing cache/sync, MariaDB, serializer and remote-request collaborators. The isolated preview uses only two synthetic billing records and two synthetic intake records in `attica_next_billing`. Its database account is SELECT-only and denied access to `asterisk`; its remote lookup adapter always returns an empty result. It cannot synchronize, insert, update or prune production customer data.

This slice does not migrate SEO/marketing lead-to-bill reports, billing attribution calculations, background transaction synchronization or the Attica Gold external customer API client. Those remain legacy dependencies and require separate testing before promotion. Preview authentication is stricter than the baseline endpoints; production authorization remains a pre-promotion gate.

Verification is recorded in `BILLING-VERIFICATION.json`. The preview checks stable billing fields, normalized and strict lookups, merge behavior, database grants, disabled external sync, restart recovery and unchanged production hashes/process.
