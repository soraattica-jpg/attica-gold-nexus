# Attica API migration inventory

Generated from the hash-verified production snapshot; no server was imported or started.

122 route registrations (1 dynamic expressions). ALL covers multiple HTTP methods; aliases appear separately. Dynamic registrations require runtime expansion before claiming an endpoint total.

All 120 server.js path registrations now have a feature owner in the isolated candidate. Forty-five registrations have controller/service extraction; the other 75 path registrations preserve their legacy handlers behind seven feature-specific route contracts. Production continues using server.js. Preview data is isolated; external delivery, dialing, Asterisk, PJSIP and auto-submit jobs are disabled.

| Method | Path / expression | Original location | Migrated | Tested | Production |
| --- | --- | --- | --- | --- | --- |
| GET | /api/blocked-numbers | server.js:22059 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| PUT | /api/blocked-numbers/:phone | server.js:22080 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/calls | server.js:22126 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/calls/duplicate-audit | server.js:22165 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/calls | server.js:22235 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/followups | server.js:22951 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/followups/load-rnr-disconnected | server.js:22990 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/followups | server.js:23170 | MIGRATED (candidate) | TESTED | Legacy |
| PUT | /api/followups/:id | server.js:23262 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/breaks | server.js:23270 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/breaks | server.js:23337 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/rates | server.js:23434 | MIGRATED (candidate) | TESTED | Legacy |
| PUT | /api/rates | server.js:23441 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/rates | server.js:23448 | MIGRATED (candidate) | TESTED | Legacy |
| DELETE | /api/rates | server.js:23455 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/admin/incoming-2of5-gate/status | server.js:23468 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/admin/incoming-5of10-gate/status | server.js:23468 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/admin/incoming-2of5-gate/control | server.js:23518 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/customerdata/list | server.js:23547 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/customerdata | server.js:23567 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/stats | server.js:23622 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/recordings/:name | server.js:23658 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/recordings | server.js:23688 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/missed/today | server.js:23695 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/missed | server.js:23720 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| PUT | /api/missed/:id/callback | server.js:23759 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/live-waiting-queue | server.js:23766 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/agent-languages | server.js:23790 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/agent-languages | server.js:23799 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/live-agents | server.js:23929 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/live-call-monitor | server.js:23936 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/calls/conference | server.js:24027 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/calls/transfer | server.js:24086 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/justdial/lead-receiver | server.js:24390 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/justdial/lead_receiver | server.js:24390 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/justdial-leads/lead-receiver | server.js:24390 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/justdial-leads/lead_receiver | server.js:24390 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/justdial/leads | server.js:24528 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/lead-source-counts/today | server.js:24550 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/auto-dial/source-coverage-report | server.js:24647 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/justdial/leads/export-followups | server.js:24668 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/justdial/leads/:leadId/queue-autodial | server.js:24697 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/website-leads/form-receiver | server.js:24961 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/website-leads/form_receiver | server.js:24961 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/website-leads/form-push | server.js:24961 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| ALL | /api/website-leads/lead-receiver | server.js:25007 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/seo-marketing/leads | server.js:26821 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/seo-marketing/lead-to-bill/summary | server.js:26867 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/seo-marketing/lead-to-bill/details | server.js:26896 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/seo-marketing/google/status | server.js:26931 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/warroom/marketing/spend | server.js:26950 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/warroom/marketing/spend/export | server.js:26971 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/seo-marketing/leads/export | server.js:26989 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/website-leads | server.js:27026 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/website-leads/export-followups | server.js:27075 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/website-leads/:leadId/queue-autodial | server.js:27110 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/blog-leads | server.js:27376 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/blog-leads/export-followups | server.js:27413 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/internal/meta-leads/ingest | server.js:27444 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/meta-leads | server.js:27507 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/meta-leads/export-followups | server.js:27560 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/meta-leads/:leadId/queue-autodial | server.js:27589 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/pledge-places | server.js:27849 | MIGRATED (candidate) | TESTED | Legacy |
| PUT | /api/pledge-places | server.js:27855 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/auto-dial/control | server.js:27862 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| PUT | /api/auto-dial/control | server.js:27868 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/google-leads | server.js:27910 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/auto-dial/leads | server.js:27983 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/auto-dial/import | server.js:28140 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/auto-dial/agent/:agentId/current | server.js:28152 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| PUT | /api/auto-dial/leads/:id | server.js:28765 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/status-followups | server.js:29290 | MIGRATED (candidate) | TESTED | Legacy |
| PUT | /api/status-followups/:id | server.js:29312 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/branches | server.js:29405 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/branches | server.js:29422 | MIGRATED (candidate) | TESTED | Legacy |
| PUT | /api/branches/:id | server.js:29435 | MIGRATED (candidate) | TESTED | Legacy |
| DELETE | /api/branches/:id | server.js:29451 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/branches/search-nearby | server.js:29459 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/send-sms | server.js:29684 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/sms-log | server.js:29741 | MIGRATED (candidate) | TESTED | Legacy |
| ALL | /api/sms/dlr | server.js:29751 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/ui-refresh | server.js:29834 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/ui-refresh | server.js:29838 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/admin-broadcast | server.js:29851 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/admin-broadcast/history | server.js:29886 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/admin-broadcast | server.js:29904 | MIGRATED (candidate) | TESTED | Legacy |
| DELETE | /api/admin-broadcast | server.js:29951 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/frontend-errors | server.js:29973 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/agents | server.js:29997 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/agents/:id | server.js:30003 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/agent-sessions | server.js:30089 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/agents | server.js:30116 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| PUT | /api/agents/:id | server.js:30128 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/agents/:id/call-slot/claim | server.js:30353 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/agents/:id/call-slot/release | server.js:30392 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/agents/:id/call-state/reset | server.js:30425 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| PUT | /api/agents/:id/password | server.js:30459 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/login | server.js:30479 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/branches/autocomplete | server.js:30581 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/places/autocomplete | server.js:30596 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/places/geocode | server.js:30676 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/save-call-language | server.js:31255 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/save-call-ivr | server.js:31265 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/call-language/:callerId | server.js:31343 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/call-ivr/:callerId | server.js:31353 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/calls/phone | server.js:31371 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/customer-profile | server.js:31393 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/intake-forms | server.js:31494 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/intake-workflow/pending | server.js:31555 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/intake-workflow | server.js:31570 | MIGRATED (candidate) | TESTED | Legacy |
| POST | /api/intake-workflow | server.js:31575 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/intake-forms/phone | server.js:31584 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/transfer-context | server.js:31622 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/transfer-context | server.js:31634 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| POST | /api/transfer-context/resolve | server.js:31666 | MIGRATED (feature registration) (candidate) | TESTED (handler preserved) | Legacy |
| GET | /api/calls/customer-history | server.js:31678 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/date-details | server.js:31700 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/export | server.js:31716 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/report-summary | server.js:31858 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/calls/list | server.js:32013 | MIGRATED (candidate) | TESTED | Legacy |
| GET | /api/md-dashboard/${path} | md-reporting.mjs:272 | PENDING (candidate) | PENDING | Legacy |
| GET | /api/md-dashboard/export | md-reporting.mjs:277 | PENDING (candidate) | PENDING | Legacy |

Middleware order, cluster/scheduler initialization, authorization, and external integration contracts remain separate migration checkpoints. Existing md-reporting and intake-workflow modules are recorded as baseline dependencies, not newly migrated work.
