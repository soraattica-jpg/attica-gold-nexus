# Attica API migration inventory

Generated from the hash-verified production snapshot; no server was imported or started.

122 route registrations (1 dynamic expressions). ALL covers multiple HTTP methods; aliases appear separately. Dynamic registrations require runtime expansion before claiming an endpoint total.

Six Branches, six Admin Messages/UI refresh routes, four Customer History routes, five core Reports routes, and two Billing/customer-data lookup routes are migrated only in the isolated candidate. PUT /api/agents/:id is extracted only for adminMessage-only payloads; all other agent updates remain legacy. Production continues using server.js. Customer History, Reports and Billing use synthetic SELECT-only data; preview Billing makes no external customer-data requests. Marketing reports and billing background sync remain pending. No production API path, payload, or global middleware was changed.

| Method | Path / expression | Original location | Migrated | Tested | Production |
| --- | --- | --- | --- | --- | --- |
| GET | /api/blocked-numbers | server.js:22059 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/blocked-numbers/:phone | server.js:22080 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/calls | server.js:22126 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/calls/duplicate-audit | server.js:22165 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/calls | server.js:22235 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/followups | server.js:22951 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/followups/load-rnr-disconnected | server.js:22990 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/followups | server.js:23170 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/followups/:id | server.js:23262 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/breaks | server.js:23270 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/breaks | server.js:23337 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/rates | server.js:23434 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/rates | server.js:23441 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/rates | server.js:23448 | PENDING (candidate) | PENDING | Legacy |
| DELETE | /api/rates | server.js:23455 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/admin/incoming-2of5-gate/status | server.js:23468 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/admin/incoming-5of10-gate/status | server.js:23468 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/admin/incoming-2of5-gate/control | server.js:23518 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/customerdata/list | server.js:23547 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/customerdata | server.js:23567 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/stats | server.js:23622 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/recordings/:name | server.js:23658 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/recordings | server.js:23688 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/missed/today | server.js:23695 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/missed | server.js:23720 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/missed/:id/callback | server.js:23759 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/live-waiting-queue | server.js:23766 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/agent-languages | server.js:23790 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/agent-languages | server.js:23799 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/live-agents | server.js:23929 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/live-call-monitor | server.js:23936 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/calls/conference | server.js:24027 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/calls/transfer | server.js:24086 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/justdial/lead-receiver | server.js:24390 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/justdial/lead_receiver | server.js:24390 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/justdial-leads/lead-receiver | server.js:24390 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/justdial-leads/lead_receiver | server.js:24390 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/justdial/leads | server.js:24528 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/lead-source-counts/today | server.js:24550 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/auto-dial/source-coverage-report | server.js:24647 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/justdial/leads/export-followups | server.js:24668 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/justdial/leads/:leadId/queue-autodial | server.js:24697 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/website-leads/form-receiver | server.js:24961 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/website-leads/form_receiver | server.js:24961 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/website-leads/form-push | server.js:24961 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/website-leads/lead-receiver | server.js:25007 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/seo-marketing/leads | server.js:26821 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/seo-marketing/lead-to-bill/summary | server.js:26867 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/seo-marketing/lead-to-bill/details | server.js:26896 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/seo-marketing/google/status | server.js:26931 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/warroom/marketing/spend | server.js:26950 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/warroom/marketing/spend/export | server.js:26971 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/seo-marketing/leads/export | server.js:26989 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/website-leads | server.js:27026 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/website-leads/export-followups | server.js:27075 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/website-leads/:leadId/queue-autodial | server.js:27110 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/blog-leads | server.js:27376 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/blog-leads/export-followups | server.js:27413 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/internal/meta-leads/ingest | server.js:27444 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/meta-leads | server.js:27507 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/meta-leads/export-followups | server.js:27560 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/meta-leads/:leadId/queue-autodial | server.js:27589 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/pledge-places | server.js:27849 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/pledge-places | server.js:27855 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/auto-dial/control | server.js:27862 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/auto-dial/control | server.js:27868 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/google-leads | server.js:27910 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/auto-dial/leads | server.js:27983 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/auto-dial/import | server.js:28140 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/auto-dial/agent/:agentId/current | server.js:28152 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/auto-dial/leads/:id | server.js:28765 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/status-followups | server.js:29290 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/status-followups/:id | server.js:29312 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/branches | server.js:29405 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/branches | server.js:29422 | MIGRATED (candidate) | TESTED | Legacy |
| PUT | /api/branches/:id | server.js:29435 | MIGRATED (candidate) | TESTED | Legacy |
| DELETE | /api/branches/:id | server.js:29451 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/branches/search-nearby | server.js:29459 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/send-sms | server.js:29684 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/sms-log | server.js:29741 | PENDING (candidate) | PENDING | Legacy |
| ALL | /api/sms/dlr | server.js:29751 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/ui-refresh | server.js:29834 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/ui-refresh | server.js:29838 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/admin-broadcast | server.js:29851 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/admin-broadcast/history | server.js:29886 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/admin-broadcast | server.js:29904 | MIGRATED (candidate) | TESTED | Legacy |
| DELETE | /api/admin-broadcast | server.js:29951 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/frontend-errors | server.js:29973 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/agents | server.js:29997 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/agents/:id | server.js:30003 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/agent-sessions | server.js:30089 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/agents | server.js:30116 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/agents/:id | server.js:30128 | PARTIAL (message-only) (candidate) | TESTED (message-only) | Legacy |
| POST | /api/agents/:id/call-slot/claim | server.js:30353 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/agents/:id/call-slot/release | server.js:30392 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/agents/:id/call-state/reset | server.js:30425 | PENDING (candidate) | PENDING | Legacy |
| PUT | /api/agents/:id/password | server.js:30459 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/login | server.js:30479 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/branches/autocomplete | server.js:30581 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/places/autocomplete | server.js:30596 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/places/geocode | server.js:30676 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/save-call-language | server.js:31255 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/save-call-ivr | server.js:31265 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/call-language/:callerId | server.js:31343 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/call-ivr/:callerId | server.js:31353 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/calls/phone | server.js:31371 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/customer-profile | server.js:31393 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/intake-forms | server.js:31494 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/intake-workflow/pending | server.js:31555 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/intake-workflow | server.js:31570 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/intake-workflow | server.js:31575 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/intake-forms/phone | server.js:31584 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/transfer-context | server.js:31622 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/transfer-context | server.js:31634 | PENDING (candidate) | PENDING | Legacy |
| POST | /api/transfer-context/resolve | server.js:31666 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/calls/customer-history | server.js:31678 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/date-details | server.js:31700 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/export | server.js:31716 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/report-summary | server.js:31858 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/list | server.js:32013 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/md-dashboard/${path} | md-reporting.mjs:272 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/md-dashboard/export | md-reporting.mjs:277 | PENDING (candidate) | PENDING | Legacy |

Middleware order, cluster/scheduler initialization, authorization, and external integration contracts remain separate migration checkpoints. Existing md-reporting and intake-workflow modules are recorded as baseline dependencies, not newly migrated work.
