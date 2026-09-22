# Module map

Check this map, `docs/API-INVENTORY.md`, and `docs/MIGRATION-PLAN.md` before
starting any backend change. Update the named module when it exists; do not
create a second implementation for the same business feature.

| Feature | Owner | Status |
| --- | --- | --- |
| Branch catalogue and nearby lookup | `modules/branches/` | Extracted preview |
| Admin and agent messages | `modules/admin-messages/` | Extracted preview |
| Customer profile and history | `modules/customer-history/` | Extracted preview |
| Core call reports | `modules/reports/` | Extracted preview |
| Billing/customer lookup | `modules/billing/` | Extracted preview |
| Kaleyra SMS, logs and delivery receipts | `modules/sms/`, `integrations/sms/providers/kaleyra.client.js` | Extracted preview |
| Follow-ups and status queue | `modules/followups/` | Extracted preview, no dialer |
| Agent intake data | `modules/intake/` | Extracted preview, no telephony |
| Agent status reads | `modules/agent-status/` | Extracted preview |
| Rates and pledge-place masters | `modules/reference-data/` | Extracted preview |
| SEO and marketing reporting | `modules/seo-marketing/` | In-progress reporting snapshot |
| Agent mutations, login and call slots | `modules/agent-management/` | Legacy route owner; call-sensitive |
| Call records, recordings and waiting queue | `modules/call-records/` | Legacy route owner |
| Call monitoring, transfer and conference | `modules/call-control/` | Legacy route owner; call-critical |
| Website, Meta, Google and Justdial ingestion | `modules/lead-ingestion/` | Legacy route owner |
| Legacy marketing routes | `modules/marketing/` | Legacy route owner |
| Auto-dial and queue operations | `modules/auto-dial/` | Legacy route owner; call-critical |
| Location/IVR language helpers | `modules/location-ivr/` | Legacy route owner |

## Integration ownership

| Integration | Owner | Status |
| --- | --- | --- |
| Kaleyra / SolutionsInfini SMS | `integrations/sms/providers/kaleyra.client.js` | Existing provider; do not replace implicitly |
| MSG91 URL tooling | Future `integrations/msg91/` if separately enabled | Not a replacement for Kaleyra |
| WATI | Future `integrations/wati/` | Not extracted |
| Meta | Future `integrations/meta/` | Not extracted |
| Google advertising/search | `modules/seo-marketing/` reporting adapter | Snapshot only in preview |
| Asterisk / AMI / SIP | `integrations/asterisk/` | Dual-Tata configuration and manual router staged; live call-control extraction remains last |

Create a new feature directory only when no owner above applies. A new module
uses routes, controller, service, repository, validation and tests as needed;
it must not become another oversized catch-all file.
