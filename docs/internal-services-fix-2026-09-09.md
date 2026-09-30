# Internal Services Repair - 2026-09-09

Last verification: 12:14 IST (06:44 UTC). This is a point-in-time check, not a claim that every historical application issue is resolved.

## Deployed Changes

- API: follow-up cooldown updates no longer revive disabled leads, acquire duplicate phone slots, or clear live call assignments.
- API: stale-slot cleanup rechecks eligibility at UPDATE time and preserves assigned/dialing reservations.
- API: competing redispatch/source-reopen requests preserve the unique phone constraint, release only stale owners, and handle valid concurrent owners without aborting assignment.
- API: inactive, terminal and non-retryable source leads cannot be automatically reopened. Retry history is retained when requeue loses a race.
- Admin login: returns the existing PBX credential for configured admin extensions, separately from the dashboard login password. No dashboard passwords were changed.
- Browser: SIP Online requires actual registration confirmation and a connected transport, not just submission of REGISTER or a cached backend endpoint status.
- Browser: registration-state listeners are removed during cleanup. Reconnect does not rebuild the phone during an active or terminating call; it cancels a pending rebuild when the existing client recovers.
- Browser: unconfigured non-agent extensions no longer use a guessed shared SIP password.
- WhatsApp bridge: provider failures and previously failed duplicate events return failure/HTTP 502 rather than false success/HTTP 200. Transport and provider error messages are distinguished.
- Cron: removed the invocation of nonexistent AST_send_listen.pl. The actual manager listener and all other scheduled jobs remain unchanged.

Earlier in this investigation, the bridge directory traversal permission was corrected without making the Google private key readable by the web server, and AG041's PBX password was synchronized with its existing agent credential.

## Live Verification

- Apache, Asterisk, MariaDB, attica-api, attica-reporting-api, cron and libvirt: running. Firewall oneshot services: active/exited, as expected. No failed systemd units on host or reporting VM.
- Tata trunk: Registered. Route to 10.53.179.2 uses ens8191 and source 10.53.180.146.
- Asterisk: 8 active calls at the final sample; uptime over 15 days. Asterisk was not restarted during deployment.
- API: eight API workers and one scheduler. Workers were replaced incrementally; health checks returned HTTP 200 between replacements.
- No duplicate-slot or assignment errors observed from 11:58 to 12:14 IST after loading the queue fix. Stale open queue slots: 0 at final sample.
- Reporting VM: all ten internal sync watermarks were successful, most recently 12:13 IST.
- Public call-center and War Room login pages: HTTP 200. Local API/reporting health probes: HTTP 200.
- Registered agent phones: 49; logged-in agents: 53. AG007, AG013, AG017 and AG029 had no registered PBX contact at the final sample. Active agents' configured SIP passwords matched; these four require browser/session-side follow-up.

## Tests

- Full frontend suite: 183 tests passed across 33 files.
- Auto-dial integration regression tests: 14 passed using a disposable, isolated MariaDB database. The database was removed afterward. No production lead rows or customer calls were created by these tests.
- WhatsApp result tests: 8 passed without sending messages. A duplicate of an already failed production event returned HTTP 502/status false without a second send.
- Admin PBX credential lookup tests: 6 passed with synthetic credentials and mocked configuration.
- Production Vite build: passed. Deployed entry bundle: index-DFW6hY4R.js. Older hashed assets retained for already-open browsers.
- Playwright login smoke checks: 1440x900 and 390x844 passed, with no JavaScript errors, missing assets, horizontal overflow or pre-login SIP connections.
- Full TypeScript validation is not clean: 67 pre-existing diagnostics remain. Comparison against the pre-change context found no new diagnostics after the SIP changes.

## Still Open

- AiSensy returns "No Plan active on assistant!". Messages cannot be delivered until the AiSensy account/campaign plan is active. The repair reports this accurately; it does not claim successful delivery or automatically resend failed messages.
- AG007, AG013, AG017 and AG029 need a fresh browser sign-in and registration check. The server cannot establish a browser WebSocket for an absent or closed client. Reload only after ending any active call.
- Admin users need to sign in again to receive the corrected PBX credential; existing cached sessions were not forcibly replaced.
- GA4 and Search Console reporting tables in the VM remain empty. These external analytics ingestion pipelines were not repaired in this call-service deployment; internal CRM sync success must not be interpreted as successful GA4/Search Console ingestion.
- Existing TypeScript diagnostics and large frontend chunk warnings remain separate technical debt.
- No customer test calls were placed and no two-hour browser/audio endurance test was performed. Live calls continued, but this does not independently verify audio quality at every workstation.

## Files and Recovery

- Live API: /root/attica-api/server.js
- Frontend: src/contexts/CallCenterContext.tsx, src/lib/sipRegistration.ts, src/lib/sipClient.ts
- Bridge: public/integrations/wati/dialer_event_receiver.php and send_wati_message.php, deployed to /var/www/html/integrations/wati/
- Tests: scripts/verify-auto-dial-dedupe.cjs, scripts/verify-whatsapp-result.php, scripts/verify-pbx-admin-auth.cjs, src/lib/sipRegistration.test.ts, src/lib/sipClient.test.ts
- Private backups and API patch: /root/attica-api/backups/internal-services-2026-09-09T06-18-09-251Z/

Do not restore the entire old API or crontab over later changes without reviewing the saved patch and current files. No bulk follow-up insertion, number unblocking, lead deletion or PBX stop/start was performed for this repair.
