# SEO & Marketing snapshot verification

Verified on 2026-09-22 against the same read-only request on the production
API (port 3001) and isolated preview API (loopback port 3101):

```text
Date range: 2026-09-21 through 2026-09-21, Asia/Kolkata
```

| Metric | Production | Snapshot preview |
| --- | ---: | ---: |
| Leads | 207 | 207 |
| Unique leads | 197 | 197 |
| Contacted | 173 | 173 |
| Connected | 124 | 124 |
| Follow-ups | 2 | 2 |
| Qualified leads | 26 | 26 |
| Lost | 0 | 0 |
| Bill records | 8 | 8 |
| Billed leads | 8 | 8 |
| Billing amount | 2,048,884 | 2,048,884 |
| Billed grams | 203.96 | 203.96 |
| Campaign spend | 27,526.52 | 27,526.52 |

The lead total, 50-row page behavior, IST exclusive end boundary and summary
metrics above match for this comparison. The spend endpoint also matches 13
rows, total spend of 27,526.51 and page two at five rows. The one-paise
difference between the spend-row sum and dashboard card is preserved from the
live API's separately rounded Google summary.

It must not be promoted until broader date, source/platform/campaign filter and
full CSV-schema parity are verified.

The preview service is loopback-only, queries only `attica_api_next_preview`
with its SELECT-only account, and has no access to the production `asterisk`
database, provider APIs, telephony, jobs, SMS delivery or WebSockets.
