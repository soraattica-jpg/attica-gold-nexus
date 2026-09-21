# Attica API migration inventory

Generated from the hash-verified production snapshot; no server was imported or started.

122 route registrations (1 dynamic expressions). ALL covers multiple HTTP methods; aliases appear separately. Dynamic registrations require runtime expansion before claiming an endpoint total.

The six Branches routes are migrated only in the isolated candidate. Production continues using server.js. No API path, payload, or global middleware was changed.

| Method | Path / expression | Original location | Migrated | Tested | Production |
| --- | --- | --- | --- | --- | --- |
| GET | /api/blocked-numbers | server.js:22059 | Pending | Pending | Legacy |
| PUT | /api/blocked-numbers/:phone | server.js:22080 | Pending | Pending | Legacy |
| GET | /api/calls | server.js:22126 | Pending | Pending | Legacy |
| GET | /api/calls/duplicate-audit | server.js:22165 | Pending | Pending | Legacy |
| POST | /api/calls | server.js:22235 | Pending | Pending | Legacy |
| GET | /api/followups | server.js:22951 | Pending | Pending | Legacy |
| POST | /api/followups/load-rnr-disconnected | server.js:22990 | Pending | Pending | Legacy |
| POST | /api/followups | server.js:23170 | Pending | Pending | Legacy |
| PUT | /api/followups/:id | server.js:23262 | Pending | Pending | Legacy |
| GET | /api/breaks | server.js:23270 | Pending | Pending | Legacy |
| POST | /api/breaks | server.js:23337 | Pending | Pending | Legacy |
| GET | /api/rates | server.js:23434 | Pending | Pending | Legacy |
| PUT | /api/rates | server.js:23441 | Pending | Pending | Legacy |
| POST | /api/rates | server.js:23448 | Pending | Pending | Legacy |
| DELETE | /api/rates | server.js:23455 | Pending | Pending | Legacy |
| GET | /api/admin/incoming-2of5-gate/status | server.js:23468 | Pending | Pending | Legacy |
| GET | /api/admin/incoming-5of10-gate/status | server.js:23468 | Pending | Pending | Legacy |
| POST | /api/admin/incoming-2of5-gate/control | server.js:23518 | Pending | Pending | Legacy |
| GET | /api/customerdata/list | server.js:23547 | Pending | Pending | Legacy |
| GET | /api/customerdata | server.js:23567 | Pending | Pending | Legacy |
| GET | /api/stats | server.js:23622 | Pending | Pending | Legacy |
| GET | /api/recordings/:name | server.js:23658 | Pending | Pending | Legacy |
| GET | /api/recordings | server.js:23688 | Pending | Pending | Legacy |
| GET | /api/missed/today | server.js:23695 | Pending | Pending | Legacy |
| GET | /api/missed | server.js:23720 | Pending | Pending | Legacy |
| PUT | /api/missed/:id/callback | server.js:23759 | Pending | Pending | Legacy |
| GET | /api/live-waiting-queue | server.js:23766 | Pending | Pending | Legacy |
| GET | /api/agent-languages | server.js:23790 | Pending | Pending | Legacy |
| POST | /api/agent-languages | server.js:23799 | Pending | Pending | Legacy |
| GET | /api/live-agents | server.js:23929 | Pending | Pending | Legacy |
| POST | /api/live-call-monitor | server.js:23936 | Pending | Pending | Legacy |
| POST | /api/calls/conference | server.js:24027 | Pending | Pending | Legacy |
| POST | /api/calls/transfer | server.js:24086 | Pending | Pending | Legacy |
| ALL | /api/justdial/lead-receiver | server.js:24390 | Pending | Pending | Legacy |
| ALL | /api/justdial/lead_receiver | server.js:24390 | Pending | Pending | Legacy |
| ALL | /api/justdial-leads/lead-receiver | server.js:24390 | Pending | Pending | Legacy |
| ALL | /api/justdial-leads/lead_receiver | server.js:24390 | Pending | Pending | Legacy |
| GET | /api/justdial/leads | server.js:24528 | Pending | Pending | Legacy |
| GET | /api/lead-source-counts/today | server.js:24550 | Pending | Pending | Legacy |
| GET | /api/auto-dial/source-coverage-report | server.js:24647 | Pending | Pending | Legacy |
| POST | /api/justdial/leads/export-followups | server.js:24668 | Pending | Pending | Legacy |
| POST | /api/justdial/leads/:leadId/queue-autodial | server.js:24697 | Pending | Pending | Legacy |
| ALL | /api/website-leads/form-receiver | server.js:24961 | Pending | Pending | Legacy |
| ALL | /api/website-leads/form_receiver | server.js:24961 | Pending | Pending | Legacy |
| ALL | /api/website-leads/form-push | server.js:24961 | Pending | Pending | Legacy |
| ALL | /api/website-leads/lead-receiver | server.js:25007 | Pending | Pending | Legacy |
| GET | /api/seo-marketing/leads | server.js:26821 | Pending | Pending | Legacy |
| GET | /api/seo-marketing/lead-to-bill/summary | server.js:26867 | Pending | Pending | Legacy |
| GET | /api/seo-marketing/lead-to-bill/details | server.js:26896 | Pending | Pending | Legacy |
| GET | /api/seo-marketing/google/status | server.js:26931 | Pending | Pending | Legacy |
| GET | /api/warroom/marketing/spend | server.js:26950 | Pending | Pending | Legacy |
| GET | /api/warroom/marketing/spend/export | server.js:26971 | Pending | Pending | Legacy |
| GET | /api/seo-marketing/leads/export | server.js:26989 | Pending | Pending | Legacy |
| GET | /api/website-leads | server.js:27026 | Pending | Pending | Legacy |
| POST | /api/website-leads/export-followups | server.js:27075 | Pending | Pending | Legacy |
| POST | /api/website-leads/:leadId/queue-autodial | server.js:27110 | Pending | Pending | Legacy |
| GET | /api/blog-leads | server.js:27376 | Pending | Pending | Legacy |
| POST | /api/blog-leads/export-followups | server.js:27413 | Pending | Pending | Legacy |
| POST | /api/internal/meta-leads/ingest | server.js:27444 | Pending | Pending | Legacy |
| GET | /api/meta-leads | server.js:27507 | Pending | Pending | Legacy |
| POST | /api/meta-leads/export-followups | server.js:27560 | Pending | Pending | Legacy |
| POST | /api/meta-leads/:leadId/queue-autodial | server.js:27589 | Pending | Pending | Legacy |
| GET | /api/pledge-places | server.js:27849 | Pending | Pending | Legacy |
| PUT | /api/pledge-places | server.js:27855 | Pending | Pending | Legacy |
| GET | /api/auto-dial/control | server.js:27862 | Pending | Pending | Legacy |
| PUT | /api/auto-dial/control | server.js:27868 | Pending | Pending | Legacy |
| GET | /api/google-leads | server.js:27910 | Pending | Pending | Legacy |
| GET | /api/auto-dial/leads | server.js:27983 | Pending | Pending | Legacy |
| POST | /api/auto-dial/import | server.js:28140 | Pending | Pending | Legacy |
| GET | /api/auto-dial/agent/:agentId/current | server.js:28152 | Pending | Pending | Legacy |
| PUT | /api/auto-dial/leads/:id | server.js:28765 | Pending | Pending | Legacy |
| GET | /api/status-followups | server.js:29290 | Pending | Pending | Legacy |
| PUT | /api/status-followups/:id | server.js:29312 | Pending | Pending | Legacy |
| GET | /api/branches | server.js:29405 | Candidate only | Contract + HTTP tests | Legacy |
| POST | /api/branches | server.js:29422 | Candidate only | Contract + HTTP tests | Legacy |
| PUT | /api/branches/:id | server.js:29435 | Candidate only | Contract + HTTP tests | Legacy |
| DELETE | /api/branches/:id | server.js:29451 | Candidate only | Contract + HTTP tests | Legacy |
| GET | /api/branches/search-nearby | server.js:29459 | Candidate only | Contract + HTTP tests | Legacy |
| POST | /api/send-sms | server.js:29684 | Pending | Pending | Legacy |
| GET | /api/sms-log | server.js:29741 | Pending | Pending | Legacy |
| ALL | /api/sms/dlr | server.js:29751 | Pending | Pending | Legacy |
| GET | /api/ui-refresh | server.js:29834 | Pending | Pending | Legacy |
| POST | /api/ui-refresh | server.js:29838 | Pending | Pending | Legacy |
| GET | /api/admin-broadcast | server.js:29851 | Pending | Pending | Legacy |
| GET | /api/admin-broadcast/history | server.js:29886 | Pending | Pending | Legacy |
| POST | /api/admin-broadcast | server.js:29904 | Pending | Pending | Legacy |
| DELETE | /api/admin-broadcast | server.js:29951 | Pending | Pending | Legacy |
| POST | /api/frontend-errors | server.js:29973 | Pending | Pending | Legacy |
| GET | /api/agents | server.js:29997 | Pending | Pending | Legacy |
| GET | /api/agents/:id | server.js:30003 | Pending | Pending | Legacy |
| GET | /api/agent-sessions | server.js:30089 | Pending | Pending | Legacy |
| POST | /api/agents | server.js:30116 | Pending | Pending | Legacy |
| PUT | /api/agents/:id | server.js:30128 | Pending | Pending | Legacy |
| POST | /api/agents/:id/call-slot/claim | server.js:30353 | Pending | Pending | Legacy |
| POST | /api/agents/:id/call-slot/release | server.js:30392 | Pending | Pending | Legacy |
| POST | /api/agents/:id/call-state/reset | server.js:30425 | Pending | Pending | Legacy |
| PUT | /api/agents/:id/password | server.js:30459 | Pending | Pending | Legacy |
| POST | /api/login | server.js:30479 | Pending | Pending | Legacy |
| GET | /api/branches/autocomplete | server.js:30581 | Candidate only | Contract + HTTP tests | Legacy |
| GET | /api/places/autocomplete | server.js:30596 | Pending | Pending | Legacy |
| GET | /api/places/geocode | server.js:30676 | Pending | Pending | Legacy |
| GET | /api/save-call-language | server.js:31255 | Pending | Pending | Legacy |
| GET | /api/save-call-ivr | server.js:31265 | Pending | Pending | Legacy |
| GET | /api/call-language/:callerId | server.js:31343 | Pending | Pending | Legacy |
| GET | /api/call-ivr/:callerId | server.js:31353 | Pending | Pending | Legacy |
| GET | /api/calls/phone | server.js:31371 | Pending | Pending | Legacy |
| GET | /api/customer-profile | server.js:31393 | Pending | Pending | Legacy |
| POST | /api/intake-forms | server.js:31494 | Pending | Pending | Legacy |
| GET | /api/intake-workflow/pending | server.js:31555 | Pending | Pending | Legacy |
| GET | /api/intake-workflow | server.js:31570 | Pending | Pending | Legacy |
| POST | /api/intake-workflow | server.js:31575 | Pending | Pending | Legacy |
| GET | /api/intake-forms/phone | server.js:31584 | Pending | Pending | Legacy |
| GET | /api/transfer-context | server.js:31622 | Pending | Pending | Legacy |
| POST | /api/transfer-context | server.js:31634 | Pending | Pending | Legacy |
| POST | /api/transfer-context/resolve | server.js:31666 | Pending | Pending | Legacy |
| GET | /api/calls/customer-history | server.js:31678 | Pending | Pending | Legacy |
| GET | /api/calls/date-details | server.js:31700 | Pending | Pending | Legacy |
| GET | /api/calls/export | server.js:31716 | Pending | Pending | Legacy |
| GET | /api/calls/report-summary | server.js:31858 | Pending | Pending | Legacy |
| GET | /api/calls/list | server.js:32013 | Pending | Pending | Legacy |
| GET | /api/md-dashboard/${path} | md-reporting.mjs:272 | Pending | Pending | Legacy |
| GET | /api/md-dashboard/export | md-reporting.mjs:277 | Pending | Pending | Legacy |

Middleware order, cluster/scheduler initialization, authorization, and external integration contracts remain separate migration checkpoints. Existing md-reporting and intake-workflow modules are recorded as baseline dependencies, not newly migrated work.
