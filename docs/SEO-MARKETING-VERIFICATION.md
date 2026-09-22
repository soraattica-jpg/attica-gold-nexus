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

## Additional filter checks

The following summary comparisons also matched exactly on 2026-09-22 after
capturing their own range-specific spend snapshot:

| Filter | Leads | Unique | Contacted | Connected | QL | Bills | Billing amount | Spend |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 Sep 2026, all sources | 150 | 143 | 22 | 8 | 0 | 11 | 1,196,573 | 27,116.06 |
| 21 Sep 2026, Google LP Leads | 110 | 110 | 101 | 77 | 14 | 3 | 386,500 | 27,526.52 |
| 21 Sep 2026, Meta Ads | 46 | 45 | 32 | 18 | 4 | 3 | 1,044,784 | 27,526.52 |

The Meta-source dashboard card retains the production behavior shown above:
the dashboard summary still reports the captured Google spend even though the
lead filter is Meta. This is recorded as compatibility behavior for now, not a
new attribution rule.

## Export compatibility checks

On 2026-09-22, the production and snapshot preview CSV exports were compared
for 21 Sep 2026 with `page=2`, `limit=5` in both supported scopes. Their CSV
header hashes matched exactly:

| Export | Columns | Current page rows | All matching rows |
| --- | ---: | ---: | ---: |
| SEO/Marketing leads | 30 | 5 | 207 |
| Campaign spend | 22 | 5 | 13 |

The snapshot now uses the production CSV schemas for both endpoints, including
the complete lead-attribution and spend fields. Snapshot-only unavailable
attributes are emitted as empty cells rather than substituted from unrelated
records. `exportScope=current` exports only the requested page; `all` exports
the complete matching result. This verifies schema and pagination-scope
compatibility, not a production cutover.
