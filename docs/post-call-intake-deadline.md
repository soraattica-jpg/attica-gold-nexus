# Post-Call Intake Deadline

Deployed 2026-09-09. New agent browser sessions use the shared intake workflow for
incoming, manual outgoing, outbound auto and follow-up calls. Already-open old
bundles are not forcibly refreshed during calls. Reload only when idle.

## Confirmation and Storage

`deployment/attica-intake.conf` attaches one hangup handler to each agent PJSIP leg.
Incoming queues and direct transfers use a called-channel pre-dial subroutine;
outgoing Tata/GSM routes attach it to the originating agent channel. No new AMI,
SIP or WebSocket client is created. No timer invokes Hangup, BYE or call transfer.

At final channel hangup, `attica-intake-ended.php` atomically writes a local event
under `/var/spool/asterisk/attica-intake-events` with the PBX unique ID, SIP dialog
ID, agent extension and timestamp. The scheduler persists it before deleting the
spool file. It matches the exact dialog and extension, not the phone number or
browser phase. Ringing forks without an intake do not create intake rows.

`attica_intake_workflows` stores the latest draft, revision, first confirmed end,
explicit disposition-selection timestamp, absolute deadline, submission result
and post-save work. The deadline is
`max(confirmed_ended_at, disposition_selected_at) + 60 seconds` and requires both
events. The counter is one minute (60s down to 0s). Selecting during a live call waits for hangup. Ending the call first waits
for selection. A prefilled disposition does not count as an explicit selection.
The browser sends `selectedDisposition` with its draft; the server records its
acceptance time only when that marker matches a non-placeholder disposition.
Manual Submit also confirms the entered disposition and can finish immediately.

Replay, page refresh, subsequent disposition changes and process restart do not
move an armed deadline. Clearing a disposition before the deadline is armed clears
selection eligibility; clearing it afterward does not extend the deadline, and
the incomplete submission is flagged for review. A one-second scheduler finalizes
due drafts even without a browser.
Execution can be slightly after the deadline due to scheduling or database load.

Manual and automatic saves share an advisory call lock, transaction and revision
check. Both update the same intake token. The latest browser edits can update the
same finalized row if they were in flight at expiry; they do not create another
intake. Post-save actions use stable call/follow-up identifiers.

Unsent data during a complete network outage cannot reach the server. The server
uses its latest durable draft; the browser retains local values and retries them
into that same record when connectivity returns. It never claims save success
before acknowledgment. Incomplete forms are flagged `Requires Review`; no missing
name, disposition, branch or follow-up time is manufactured.

## Routing

An unresolved workflow holds agent availability independently of the legacy
30-second wrap-up. Queue membership, live availability, call-slot claims and
transfer reservations check that hold. Finalization clears only the matching
call's wrap-up. Selected work mode, breaks, login state and newer reservations
are not overwritten. Manual submission during a live call does not hang up or
release that live call's reservation.

If no matching PBX end or explicit disposition selection exists, the automatic
countdown does not start. After confirmed hangup the form says to select a
disposition and the unresolved workflow continues to hold Wrap-Up. Investigate
the handler/event pipeline if confirmation is missing; do not substitute a
browser disconnect or timeout. The agent can still submit manually.

## Components

- Runtime backend: `/root/attica-api/server.js`, `/root/attica-api/intake-workflow.mjs`.
- Backend source: `deployment/intake-workflow.mjs` and `deployment/intake-server.patch`.
- PBX: `/etc/asterisk/attica-intake.conf`, Queue/Dial hooks in `extensions.conf`.
- AGI: `/var/lib/asterisk/agi-bin/attica-intake-ended.php`.
- Frontend: `usePostCallIntake`, `CustomerIntakeForm`, SIP dialog metadata in
  `CallCenterContext`.
- API: GET/POST `/api/intake-workflow`, scoped by call ID, intake token and agent.
  These routes inherit the application's existing authentication perimeter;
  client-provided agent IDs are not a replacement for authenticated sessions.

Future dialplan generators must preserve the include and pre-dial hooks. The
current server does not generate `extensions.conf`.

## Verification

`npm test -- --reporter=dot`: 204 passing tests, including both event orders,
explicit selection of a prefilled value, network loss, reopen, manual/automatic
interaction, old-call response and real-form rendering.

`node scripts/verify-intake-deadline.mjs`: 44 checks using a disposable database,
including both event orders, missing/mismatched selection markers, clearing and
reselection, rollback/retry, replay/restart, concurrency, review flags, break/logout
preservation, new-call reservation protection and token/agent mismatches. The
one-minute update also checks that no submission occurs at the old 15-second mark.

Production build and Node syntax checks passed. The current update's TypeScript
comparison, excluding test files, has 57 pre-existing diagnostics and no new ones.
Desktop 1440px and mobile 390px countdown screenshots have no horizontal overflow.

The disposition-gate deployment serves `index-u3DXTsW9.js`. Public page/assets and
the workflow endpoint returned HTTP 200, including `dispositionSelectedAt`. All
nine API/scheduler children were rolled; Asterisk's uptime was uninterrupted.
No live customer calls were placed to test the changed selection timing; the two
event orders and idempotency were verified against the disposable database and
frontend tests above.

The subsequent one-minute update serves `index-Q5PDvsJy.js` and changes only the
deadline duration and form text. Both prerequisites, absolute-deadline persistence,
duplicate-safe saves and wrap-up holds remain unchanged. Its private backup is
`/root/attica-api/backups/intake-one-minute-2026-09-09/`.

Pre-disposition-gate live observation: one outgoing call ended at 10:22:16.097 UTC, deadline
10:22:31.097, finalized automatically at 10:22:31.158. One intake row existed for
the token, flagged Requires Review. Incoming agent channels were observed with
the handler and exact SIP dialog IDs. Separate live manual/auto/follow-up scenario
sign-off remains operational verification; no customer test calls were placed.

## Operations and Recovery

Backups of the previous server, dialplan, frontend entry and full calls/intake/
agents SQL snapshot are in `/root/attica-api/backups/intake-deadline-2026-09-09/`.
The directory is private. Do not publish it; it contains customer data.
The disposition-gate update has a separate code and workflow-table backup in
`/root/attica-api/backups/intake-disposition-gate-2026-09-09/`. Its schema migration
adds `disposition_selected_at` and disarms pending old-rule deadlines without
changing completed history. Old browser bundles can still submit manually;
refresh idle browsers for explicit selection reporting and the new countdown UI.

Inspect pending saves without exposing draft contents:

```sql
SELECT agent_id, direction, confirmed_ended_at, disposition_selected_at, auto_submit_at, finalized_at,
       submission_method, last_error
FROM attica_intake_workflows
WHERE finalized_at IS NULL OR last_error IS NOT NULL;
```

Check `journalctl -u attica-api.service` for `[intake-deadline]`, and
`asterisk -rx 'core show hanguphandlers all'` for handler attachment. Fix database
or spool errors and let retries finish; never bulk-clear unresolved workflows.
Retain pending records during a rollback. Do not delete the new tables or restore
the entire SQL snapshot over newer live data. Restore only reviewed code/config
changes, reload the dialplan and roll API workers without restarting Asterisk.
