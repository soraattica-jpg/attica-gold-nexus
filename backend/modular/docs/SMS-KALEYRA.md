# SMS / Kaleyra abstraction: migrated and tested in preview

| Endpoint | Original server.js range | Status |
| --- | --- | --- |
| POST /api/send-sms | 29684–29739 | MIGRATED + TESTED |
| GET /api/sms-log | 29741–29747 | MIGRATED + TESTED |
| ALL /api/sms/dlr | 29751–29831 | MIGRATED + TESTED |

The application still targets Kaleyra/SolutionsInfini. The provider client preserves the India API URL, API-key header, SID path, sender, `TXN` type, template ID, callback URL, reference ID, response parsing and provider-error detection. The send service preserves branch URL priority (`bitly_url`, then `map_url`, then `url`), the approved SMS text, queued/sent/failed audit transitions and response fields.

Delivery callbacks preserve token validation, client/provider/recipient matching order, status and India-time normalization, idempotent row updates, metadata fields and token removal before payload storage. The SMS log retains the 1–1,000 row limit.

The port 3101 preview uses a fake Kaleyra sink and an isolated synthetic `attica_next_sms` database. It never reads `/etc/attica/kaleyra-api-key`, never contacts Kaleyra, and cannot inspect or mutate production SMS tables. The fake sink records only test payloads and is cleared by verification.

The original helper declarations remain in the disabled generated candidate until their remaining references are audited. The three HTTP routes use the new module/provider boundary. Production authorization remains a pre-promotion gate because the legacy send/log routes do not have route-level authorization.

Verification is recorded in `SMS-VERIFICATION.json`: approved text and stored Smler URL, fake-only provider delivery, submitted/delivered audit states, idempotent DLR updates, secret stripping, database isolation, restart recovery and unchanged production hashes/process.
