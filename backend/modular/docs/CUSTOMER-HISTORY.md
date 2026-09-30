# Customer History: migrated and tested in preview

Four read endpoints are extracted through routes → controller → service → repository:

| Endpoint | Original server.js range | Status |
| --- | --- | --- |
| GET /api/calls/phone | 31371–31391 | MIGRATED + TESTED |
| GET /api/customer-profile | 31393–31464 | MIGRATED + TESTED |
| GET /api/intake-forms/phone | 31584–31620 | MIGRATED + TESTED |
| GET /api/calls/customer-history | 31678–31698 | MIGRATED + TESTED |

Both call-history routes use the same resolver and retain their original limits (100 and 200). Intake history retains the joined call fields and 100-row ordering. Identity resolution remains customer ID → normalized primary mobile → normalized alternate mobile → requested normalized mobile. The calls endpoints preserve the original digits-only request in the top-level `phone` response while querying the resolved 10-digit number.

The generated full candidate injects the existing `serializeCallRowsWithDisplayNames`, `serializeIntakeFormRow`, and `buildCustomerProfile` collaborators. This preserves the full production field mapping while SQL ownership and route flow move into the module. These large shared serializers/profile composition rules are not duplicated. The preview has a limited equivalent adapter for the synthetic schema so database, identity, ordering, profile prefill and HTTP behavior can run independently.

Port 3101 uses `attica_next_customer_history`, containing only synthetic TEST records in `attica_customers`, `attica_calls`, and `attica_intake_forms`. Its account has SELECT only on that schema and is denied production reads and writes. All four routes require a root-only test actor token. No customer data was copied from production.

The remote `/api/customerdata` and `/api/customerdata/list` endpoints are deliberately excluded. They call `atticagold.biz`, refresh caches, and perform attribution work; they belong to Billing / customer-data integration and remain legacy.

Verification covers primary, `+91`, alternate-number and customer-ID matching; newest-first call/intake history; invalid-number response; reusable profile fields; authentication; preview restart; SELECT-only grants; denied production access; and unchanged production hashes/process. Evidence is in `CUSTOMER-HISTORY-VERIFICATION.json`.

Current totals after this phase: 110 unit/HTTP/structural tests and 10 real MariaDB tests. The generated candidate passes syntax validation, preserves unrelated statements and keeps all 16 extracted route registrations in their original order. Production and its frontend remain on port 3001.

Next module: Reports, followed by Billing / bill lookup. Customer History is now available as the tested dependency boundary for the later Agent Intake migration.
