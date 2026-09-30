# Unfinished Intake Recovery

Investigation at 05:01 UTC on 2026-09-10 found a registered/reachable Tata trunk,
48 available PJSIP contacts and bridged incoming/outgoing calls. There was no
complete PBX outage. Several agents were nevertheless blocked by unresolved
intake workflows, including forms from the previous day. Their calls had ended,
but no explicit disposition selection or final submission existed. Logging out
cleared the local form state while the server correctly retained the Wrap-Up hold.

## Fix

- `GET /api/intake-workflow/pending?agentId=...` returns at most one oldest pending
  form and its exact call record. It is a read-only, agent-scoped detail request.
- Only logged-in, working-mode agents without a call reservation qualify. The
  endpoint also requires an explicitly idle PBX endpoint before returning a form.
- The shared shell recovers it only while idle, without an existing intake,
  incoming popup, auto-dial alert or break. It never replaces a live call.
- Discovery uses one cancellable, non-overlapping request every 20 seconds while
  idle. It stops when a form is restored. The existing form then owns draft saving
  and the countdown. Logout, a new call or unmount cancels recovery.
- Revision-zero server drafts are restored too. Inherited RNR or other values do
  not count as a new explicit disposition selection.
- The deadline remains `max(confirmed end, explicit selection) + 60 seconds`.
  No fake disposition, forced submission, deleted draft or bulk-cleared hold is
  used to release agents. Successful normal submission releases the matching hold.

The endpoint inherits the existing application authentication perimeter and
agent-ID conventions. This change does not introduce a new identity mechanism.

## Verification

- 223 frontend tests passed, including recovery, cancellation, busy/break/logout
  protection and both timer event orders.
- 55 isolated database checks passed, including previous-day recovery, agent
  scoping, reservation/break guards and hold release after successful submission.
- Production build and backend syntax checks passed.
- TypeScript still reports the existing 57 non-test diagnostics; none are in
  the new recovery component or the changed hook logic.
- Public entry `index-CDDYuLHy.js` and the pending endpoint returned HTTP 200.
  AG058, AG035 and AG005 returned their exact pending forms in read-only checks.
  Desktop 1440px and mobile 390px modal checks showed no horizontal overflow.
- Nine API/scheduler children were rolled. Tata remained registered and the PBX
  continued processing calls without an Asterisk restart. Agent-side completion
  still requires refreshing idle old tabs and submitting the recovered form.

Backup: `/root/attica-api/backups/intake-recovery-2026-09-10/`.
Runtime module: `/root/attica-api/intake-workflow.mjs`.
Runtime route patch: `deployment/intake-recovery-server.patch`.
Deploy by rolling API workers, not restarting Asterisk. Refresh affected agent
pages only when idle; no live calls are placed or terminated for verification.
