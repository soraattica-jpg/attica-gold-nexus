import { readdir, readFile, unlink } from 'node:fs/promises';

export const pendingIntakeSql = (agentColumn) => `EXISTS (SELECT 1 FROM attica_intake_workflows iw WHERE iw.agent_id=${agentColumn} AND iw.finalized_at IS NULL)`;
const iso = (value) => value ? new Date(value).toISOString() : null;
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : (value || {});
const text = (value, max = 255) => String(value ?? '').trim().slice(0, max);
const fail = (message, status = 409) => Object.assign(new Error(message), { statusCode: status });
const hasDisposition = (value) => Boolean(text(value)) && !/^(none|scheduled|pending|completed)$/i.test(text(value));
const isReleaseCase = (draft) => {
  const purpose = text(draft?.purpose).toLowerCase();
  const businessType = text(draft?.businessType).toLowerCase();
  return purpose === 'release' || purpose === 'gold release' || businessType === 'release';
};
const releaseFieldError = (draft) => {
  if (!isReleaseCase(draft)) return '';
  if (!text(draft.pledgePlace)) return 'Select a pledge place';
  if (text(draft.pledgePlace).toLowerCase() === 'other' && !text(draft.otherPledgePlace)) return 'Enter the other pledge place';
  return '';
};

const FIELDS = {
  customerName: 'customer_name', callerName: 'caller_name', mob2: 'mob2', age: 'age', gender: 'gender',
  district: 'district', language: 'language', businessType: 'business_type', metalType: 'metal_type',
  grams: 'grams', releaseGrossAmount: 'release_gross_amount', releasingAmount: 'releasing_amount',
  pledgePlace: 'pledge_place', otherPledgePlace: 'other_pledge_place', differenceAmount: 'difference_amount',
  bankName: 'bank_name', onlinePrice: 'online_price', pricePerGram: 'price_per_gram', advertisement: 'advertisement',
  lead: 'lead', formStatus: 'form_status', branch: 'branch', place: 'place', purpose: 'purpose',
  callbackStatus: 'callback_status', quickNote: 'quick_note', notes: 'notes',
  dataFillingDurationSeconds: 'data_filling_duration_seconds',
};

export function reviewReasons(draft) {
  const missing = [];
  if (!text(draft.customerName || draft.callerName)) missing.push('Customer name');
  if (!hasDisposition(draft.callbackStatus)) missing.push('Disposition');
  if (draft.followUpAction === 'schedule' && !draft.statusFollowUpAt) missing.push('Follow-up time');
  if (draft.statusFollowUpAt && !Number.isFinite(Date.parse(draft.statusFollowUpAt))) missing.push('Valid follow-up time');
  const releaseError = releaseFieldError(draft);
  if (releaseError) missing.push(releaseError);
  return missing;
}

export function sanitizeDraft(input, workflow) {
  const draft = {};
  for (const key of Object.keys(FIELDS)) draft[key] = text(input[key], key === 'notes' ? 64000 : (key === 'quickNote' ? 500 : (key === 'place' ? 255 : 100)));
  return {
    ...draft, id: workflow.call_id, callUuid: workflow.call_id, intakeToken: workflow.intake_token,
    agentId: workflow.agent_id, agentName: workflow.agent_name || '', callerId: workflow.normalized_phone || '',
    direction: workflow.direction, statusFollowUpAt: text(input.statusFollowUpAt, 40),
    followUpAction: ['schedule', 'call-done', 'none'].includes(input.followUpAction) ? input.followUpAction : 'none',
    smsSent: Boolean(input.smsSent), createdAt: iso(workflow.created_at),
  };
}

export function presentWorkflow(row) {
  if (!row) return null;
  return {
    callId: row.call_id, intakeToken: row.intake_token, agentId: row.agent_id,
    revision: Number(row.draft_revision), confirmedEndedAt: iso(row.confirmed_ended_at),
    dispositionSelectedAt: iso(row.disposition_selected_at),
    autoSubmitAt: null, submittedAt: iso(row.finalized_at),
    submissionMethod: row.submission_method, requiresReview: parse(row.review_reasons || '[]'),
    pendingServerSave: Boolean(row.last_error), draft: parse(row.draft_json), serverNow: new Date().toISOString(),
  };
}

export async function ensureIntakeWorkflowSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS attica_intake_workflows (
    call_id varchar(120) NOT NULL PRIMARY KEY, intake_token varchar(120) NOT NULL,
    agent_id varchar(20) NOT NULL, agent_name varchar(100) NOT NULL DEFAULT '',
    normalized_phone varchar(20) NOT NULL DEFAULT '', direction varchar(20) NOT NULL,
    sip_call_id varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    extension varchar(20) NOT NULL, draft_json longtext NOT NULL, draft_revision bigint NOT NULL DEFAULT 0,
    confirmed_ended_at datetime(3) NULL, disposition_selected_at datetime(3) NULL,
    auto_submit_at datetime(3) NULL, finalized_at datetime(3) NULL,
    submission_method varchar(20) NULL, review_reasons text NULL, last_error varchar(255) NULL,
    post_commit_at datetime(3) NULL, created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_workflow_token (intake_token), KEY idx_workflow_due (finalized_at,auto_submit_at),
    KEY idx_workflow_agent (agent_id,finalized_at), KEY idx_workflow_sip (sip_call_id,extension)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci`);
  await pool.query('ALTER TABLE attica_intake_workflows ADD COLUMN IF NOT EXISTS disposition_selected_at datetime(3) NULL');
  // Wrap-up remains open until the agent explicitly submits. Remove legacy deadlines.
  await pool.query('UPDATE attica_intake_workflows SET auto_submit_at=NULL WHERE auto_submit_at IS NOT NULL');
  await pool.query(`CREATE TABLE IF NOT EXISTS attica_intake_pbx_ends (
    pbx_unique_id varchar(80) NOT NULL PRIMARY KEY,
    sip_call_id varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    extension varchar(20) NOT NULL, ended_at datetime(3) NOT NULL,
    UNIQUE KEY uniq_pbx_end_dialog (sip_call_id,extension)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci`);
  await pool.query('ALTER TABLE attica_intake_forms ADD COLUMN IF NOT EXISTS submission_status varchar(32) NULL');
  await pool.query('ALTER TABLE attica_intake_forms ADD COLUMN IF NOT EXISTS submitted_at datetime(3) NULL');
  await pool.query('ALTER TABLE attica_intake_forms ADD COLUMN IF NOT EXISTS submission_method varchar(20) NULL');
  await pool.query('ALTER TABLE attica_intake_forms ADD COLUMN IF NOT EXISTS quick_note varchar(500) NULL');
  await pool.query('ALTER TABLE attica_calls ADD COLUMN IF NOT EXISTS quick_note varchar(500) NULL');
  await pool.query('ALTER TABLE attica_intake_forms ADD COLUMN IF NOT EXISTS data_filling_duration_seconds int unsigned NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE attica_calls ADD COLUMN IF NOT EXISTS data_filling_duration_seconds int unsigned NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE attica_calls ADD COLUMN IF NOT EXISTS carrier_trunk varchar(50) NULL');
  await pool.query('ALTER TABLE attica_calls ADD COLUMN IF NOT EXISTS trunk_code varchar(50) NULL');
  await pool.query('ALTER TABLE attica_calls ADD COLUMN IF NOT EXISTS pilot varchar(30) NULL');
  await pool.query('ALTER TABLE attica_calls ADD COLUMN IF NOT EXISTS did_or_cli varchar(30) NULL');
}

export function createIntakeWorkflowService({ pool, withCallSaveLock, saveIntake, onSubmitted = async () => {}, onRoutingChanged = async () => {} }) {
  const transaction = async (callId, operation) => withCallSaveLock({ id: callId }, async (connection) => {
    await connection.beginTransaction();
    try {
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
  const getLocked = async (connection, callId) => {
    const [[row]] = await connection.query('SELECT * FROM attica_intake_workflows WHERE call_id=? FOR UPDATE', [callId]);
    return row;
  };
  const clearDeadline = async (connection, row) => {
    if (row.auto_submit_at) {
      row.auto_submit_at = null;
      await connection.query('UPDATE attica_intake_workflows SET auto_submit_at=NULL WHERE call_id=?', [row.call_id]);
    }
    await connection.query('UPDATE attica_agents SET wrap_up_until=NULL WHERE id=? AND wrap_up_call_id=?',
      [row.agent_id,row.call_id]);
    return row;
  };
  const writeIntake = async (connection, row, finalized = false) => {
    const draft = parse(row.draft_json);
    const [[call]] = await connection.query('SELECT status,answered_at,ended_at,duration,talk_duration_seconds,agent_name FROM attica_calls WHERE id=?', [row.call_id]);
    // Timing is never inferred from the browser's phase or the time of a form save.
    const payload = { ...draft, agentName: call?.agent_name || row.agent_name, status: call?.status || 'completed',
      answeredAt: iso(call?.answered_at), endedAt: iso(row.confirmed_ended_at || call?.ended_at),
      duration: call?.duration || '00:00:00', talkDurationSeconds: Number(call?.talk_duration_seconds || 0),
      statusFollowUpAt: draft.statusFollowUpAt && Number.isFinite(Date.parse(draft.statusFollowUpAt)) ? new Date(draft.statusFollowUpAt).toISOString() : '',
      __intakeWorkflowWrite: true };
    await saveIntake(connection, payload);
    // The workflow snapshot is authoritative, including intentionally cleared fields.
    const assignments = Object.entries(FIELDS).map(([, column]) => `${column}=?`).join(',');
    const values = Object.keys(FIELDS).map((key) => draft[key] || '');
    await connection.query(`UPDATE attica_intake_forms SET ${assignments},status_follow_up_at=?,
      submission_status=?,submitted_at=?,submission_method=? WHERE call_id=? AND intake_token=?`,
    [...values, payload.statusFollowUpAt ? new Date(payload.statusFollowUpAt) : null,
      finalized ? (parse(row.review_reasons || '[]').length ? 'Requires Review' : 'Submitted') : 'Draft',
      row.finalized_at || null, row.submission_method || null, row.call_id, row.intake_token]);
    await connection.query(`UPDATE attica_calls SET ${assignments},status_follow_up_at=?,follow_up_flag=? WHERE id=?`,
      [...values, payload.statusFollowUpAt ? new Date(payload.statusFollowUpAt) : null,
        draft.followUpAction === 'schedule' && Boolean(payload.statusFollowUpAt) ? 1 : 0, row.call_id]);
    return payload;
  };
  const confirm = async (connection, row) => {
    if (row.confirmed_ended_at) return clearDeadline(connection,row);
    let [[event]] = await connection.query('SELECT ended_at FROM attica_intake_pbx_ends WHERE sip_call_id=? AND extension=?', [row.sip_call_id, row.extension]);
    // Failed/no-answer SIP attempts can end before Asterisk emits the dialog event.
    // Accept the persisted telephony call end only when the call is already terminal.
    if (!event) {
      const [[terminalCall]] = await connection.query(`SELECT ended_at,status FROM attica_calls
        WHERE id=? AND ended_at IS NOT NULL
          AND status IN ('completed','answered','transferred','failed','missed')`, [row.call_id]);
      if (terminalCall) event = { ended_at: terminalCall.ended_at };
    }
    if (!event) return row;
    await connection.query(`UPDATE attica_intake_workflows SET confirmed_ended_at=?
      WHERE call_id=? AND confirmed_ended_at IS NULL`, [event.ended_at, row.call_id]);
    row.confirmed_ended_at = event.ended_at;
    await connection.query(`UPDATE attica_calls SET ended_at=?,status=CASE
      WHEN status IN ('active','on-hold') THEN 'completed' ELSE status END WHERE id=?`,[event.ended_at,row.call_id]);
    await connection.query(`UPDATE attica_agents SET active_call_id=NULL,active_call_direction=NULL,active_call_phone=NULL,
      active_call_started_at=NULL,call_state_updated_at=UTC_TIMESTAMP(),last_call_ended_at=?,
      wrap_up_call_id=?,wrap_up_started_at=?,wrap_up_until=? WHERE id=? AND active_call_id=?`,
      [event.ended_at,row.finalized_at ? null : row.call_id,row.finalized_at ? null : event.ended_at,
        null,row.agent_id,row.call_id]);
    return clearDeadline(connection,row);
  };
  const finish = async (connection, row, method) => {
    if (row.finalized_at) return row;
    row.finalized_at = new Date();
    row.submission_method = method;
    row.review_reasons = JSON.stringify(reviewReasons(parse(row.draft_json)));
    await writeIntake(connection, row, true);
    await connection.query(`UPDATE attica_intake_workflows SET finalized_at=?,submission_method=?,review_reasons=?,last_error=NULL,auto_submit_at=NULL WHERE call_id=? AND finalized_at IS NULL`,
      [row.finalized_at, method, row.review_reasons, row.call_id]);
    row.auto_submit_at = null;
    // Do not modify work mode, break, login or a newer call's reservation.
    await connection.query(`UPDATE attica_agents SET wrap_up_until=NULL,wrap_up_started_at=NULL,wrap_up_call_id=NULL
      WHERE id=? AND wrap_up_call_id=?`, [row.agent_id, row.call_id]);
    return row;
  };
  const enroll = async (connection, call, sipId) => {
    if (!/^[\x21-\x7e]{1,255}$/.test(String(sipId || '')) || !call.id || !call.agentId) return null;
    const [[agent]] = await connection.query("SELECT extension,name FROM attica_agents WHERE id=? AND role='agent'", [call.agentId]);
    if (!agent) return null;
    const row = { call_id: call.id, intake_token: call.intakeToken || `INTAKE-CALL-${call.id}`,
      agent_id: call.agentId, agent_name: agent.name, normalized_phone: call.callerId || '', direction: call.direction,
      created_at: new Date() };
    await connection.query(`INSERT INTO attica_intake_workflows (call_id,intake_token,agent_id,agent_name,normalized_phone,direction,sip_call_id,extension,draft_json)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE call_id=call_id`,
      [row.call_id,row.intake_token,row.agent_id,row.agent_name,row.normalized_phone,row.direction,sipId,agent.extension,JSON.stringify(sanitizeDraft(call,row))]);
    return confirm(connection, await getLocked(connection, row.call_id));
  };
  const read = async (callId, agentId) => {
    const [[row]] = await pool.query('SELECT * FROM attica_intake_workflows WHERE call_id=? AND agent_id=?', [callId,agentId]);
    return presentWorkflow(row);
  };
  const readPending = async (agentId) => {
    if (!agentId) return null;
    const [[row]] = await pool.query(`SELECT w.* FROM attica_intake_workflows w
      JOIN attica_agents a ON a.id=w.agent_id
      WHERE w.agent_id=? AND w.finalized_at IS NULL AND w.confirmed_ended_at IS NOT NULL
        AND a.role='agent' AND a.is_logged_in=1 AND COALESCE(a.active_call_id,'')=''
        AND a.status IN ('active','outbound-auto','manual-outgoing','follow-up')
      ORDER BY w.created_at,w.call_id LIMIT 1`, [agentId]);
    return presentWorkflow(row);
  };
  const mutate = async ({ callId, intakeToken, agentId, revision, action, draft, selectedDisposition }) => {
    if (!['draft','submit'].includes(action)) throw fail('Invalid intake action',400);
    const row = await transaction(callId, async (connection) => {
      const row = await getLocked(connection, callId);
      if (!row || row.agent_id !== agentId || row.intake_token !== intakeToken) throw fail('Intake session does not match',403);
      const nextDraft = JSON.stringify(sanitizeDraft(draft || {}, row));
      if (action === 'submit') {
        const releaseError = releaseFieldError(parse(nextDraft));
        if (releaseError) throw fail(releaseError, 400);
      }
      if (Number(revision) !== Number(row.draft_revision)) {
        if (nextDraft === row.draft_json && (action === 'draft' || row.finalized_at)) return row;
        throw fail('Draft revision changed. Reload the saved draft and retry.');
      }
      row.draft_json = nextDraft;
      row.draft_revision = Number(row.draft_revision) + 1;
      const disposition = parse(nextDraft).callbackStatus;
      if (!row.finalized_at) {
        // Only an explicit dropdown selection or manual Submit confirms agent intent.
        if (!hasDisposition(disposition)) row.disposition_selected_at = null;
        else if (!row.disposition_selected_at && (text(selectedDisposition) === disposition || action === 'submit')) {
          row.disposition_selected_at = new Date();
        }
        await connection.query('UPDATE attica_intake_workflows SET disposition_selected_at=? WHERE call_id=?',
          [row.disposition_selected_at || null,callId]);
      }
      await confirm(connection, row);
      if (row.finalized_at) row.review_reasons = JSON.stringify(reviewReasons(parse(row.draft_json)));
      await writeIntake(connection, row, Boolean(row.finalized_at));
      await connection.query('UPDATE attica_intake_workflows SET draft_json=?,draft_revision=?,last_error=NULL WHERE call_id=?', [row.draft_json,row.draft_revision,callId]);
      if (row.finalized_at) await connection.query('UPDATE attica_intake_workflows SET review_reasons=?,post_commit_at=NULL WHERE call_id=?', [row.review_reasons,callId]);
      if (action !== 'draft') await finish(connection, row, 'manual');
      return row;
    });
    if (row.finalized_at) void onRoutingChanged([row.agent_id]).catch(() => {});
    return presentWorkflow(row);
  };
  const recordEnd = async (event) => {
    if (!/^[0-9.]{1,80}$/.test(event.uniqueId || '') || !/^20\d{2}$/.test(event.extension || '')
      || !/^[\x21-\x7e]{1,255}$/.test(event.sipCallId || '') || !Number.isFinite(event.endedAt)
      || event.endedAt > Date.now() + 5000) throw fail('Invalid PBX hangup event',400);
    const direction = text(event.direction, 20).toLowerCase();
    const callSource = text(event.callSource, 100);
    const carrierTrunk = text(event.carrierTrunk, 50).toUpperCase();
    const trunkCode = text(event.trunkCode, 50).toUpperCase();
    const pilot = text(event.pilot, 30).replace(/\D/g, '');
    const didOrCli = text(event.didOrCli, 30).replace(/\D/g, '');
    if (direction && !['incoming', 'outgoing'].includes(direction)) throw fail('Invalid PBX call direction', 400);
    if (carrierTrunk && !/^[A-Z0-9_]+$/.test(carrierTrunk)) throw fail('Invalid PBX carrier trunk', 400);
    if (trunkCode && !/^[A-Z0-9_]+$/.test(trunkCode)) throw fail('Invalid PBX trunk code', 400);
    await pool.query(`INSERT INTO attica_intake_pbx_ends (pbx_unique_id,sip_call_id,extension,ended_at)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pbx_unique_id=pbx_unique_id`,
      [event.uniqueId,event.sipCallId,event.extension,new Date(event.endedAt)]);
    if (carrierTrunk || trunkCode || pilot || didOrCli) {
      await pool.query(
        `UPDATE attica_calls c
           JOIN attica_intake_workflows w ON w.call_id=c.id
            SET c.carrier_trunk=COALESCE(NULLIF(?, ''), c.carrier_trunk),
                c.trunk_code=COALESCE(NULLIF(?, ''), c.trunk_code),
                c.pilot=COALESCE(NULLIF(?, ''), c.pilot),
                c.did_or_cli=COALESCE(NULLIF(?, ''), c.did_or_cli),
                c.lead=CASE
                  WHEN ?='incoming' AND ?='CAMPAIGN_CALLS' AND LOWER(?)='campaign calls'
                    THEN 'Campaign Calls'
                  ELSE c.lead
                END
          WHERE w.sip_call_id=? AND w.extension=?`,
        [carrierTrunk,trunkCode,pilot,didOrCli,direction,carrierTrunk,callSource,event.sipCallId,event.extension],
      );
    }
  };
  let running = false;
  let lastCleanup = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const spool = process.env.ATTICA_INTAKE_EVENT_SPOOL || '/var/spool/asterisk/attica-intake-events';
      for (const name of (await readdir(spool).catch(() => [])).filter((n) => /^[0-9.]+\.json$/.test(n)).slice(0,100)) {
        const path = `${spool}/${name}`;
        try {
          await recordEnd(JSON.parse(await readFile(path,'utf8')));
          await unlink(path).catch(() => {});
        } catch (error) {
          console.warn('[intake-deadline] PBX event pending', {file:name,code:error.code || 'EVENT_FAILED'});
        }
      }
      // Replayed events preserve their original timestamp; no wall-clock reset on restart.
      const [waiting] = await pool.query(`SELECT DISTINCT w.call_id FROM attica_intake_workflows w
        LEFT JOIN attica_intake_pbx_ends e ON e.sip_call_id=w.sip_call_id AND e.extension=w.extension
        LEFT JOIN attica_calls c ON c.id=w.call_id
        WHERE w.confirmed_ended_at IS NULL
          AND (e.ended_at IS NOT NULL OR (c.ended_at IS NOT NULL
            AND c.status IN ('completed','answered','transferred','failed','missed')))
        LIMIT 100`);
      for (const {call_id} of waiting) await transaction(call_id, async (connection) => confirm(connection, await getLocked(connection,call_id)));
      const [outbox] = await pool.query('SELECT * FROM attica_intake_workflows WHERE finalized_at IS NOT NULL AND post_commit_at IS NULL LIMIT 25');
      for (const row of outbox) {
        try {
          await onSubmitted(parse(row.draft_json),row);
          await pool.query('UPDATE attica_intake_workflows SET post_commit_at=UTC_TIMESTAMP(3) WHERE call_id=? AND draft_revision=?', [row.call_id,row.draft_revision]);
        } catch (error) {
          console.warn('[intake-deadline] post-save processing pending', {callId:row.call_id,code:error.code || 'POST_SAVE_FAILED'});
        }
      }
      if (Date.now() - lastCleanup > 3600000) {
        await pool.query(`DELETE e FROM attica_intake_pbx_ends e WHERE e.ended_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)
          AND NOT EXISTS (SELECT 1 FROM attica_intake_workflows w WHERE w.sip_call_id=e.sip_call_id
            AND w.extension=e.extension AND w.confirmed_ended_at IS NULL)`);
        lastCleanup = Date.now();
      }
    } finally { running = false; }
  };
  return { enroll, read, readPending, mutate, tick, recordEnd, writeIntake, presentWorkflow };
}
