import { mkdirSync, writeFileSync } from 'node:fs';
import { branchPaths, adminPaths, adminHelperNames, adminConstantNames, customerHistoryPaths, reportCorePaths, billingPaths, smsPaths, followupPaths, intakePaths, agentStatusPaths, referenceDataPaths, legacyRouteOwner, parseSource, projectRoot, readBaseline, routeCall } from './source-tools.js';

const source = readBaseline();
const ast = parseSource(source);
const edits = [];
let removed = 0;
let adminRemoved = 0;
let customerHistoryRemoved = 0;
let reportCoreRemoved = 0;
let billingRemoved = 0;
let smsRemoved = 0;
let followupRemoved = 0;
let intakeRemoved = 0;
let agentStatusRemoved = 0;
let referenceDataRemoved = 0;
for (const statement of ast.body) {
  if ((statement.type === 'FunctionDeclaration' && adminHelperNames.has(statement.id.name))
    || (statement.type === 'VariableDeclaration' && adminConstantNames.has(statement.declarations[0]?.id.name))) {
    edits.push({ start: statement.start, end: statement.end, text: '' });
  }
  const registration = statement.expression;
  if (registration && routeCall(registration) && adminPaths.has(registration.arguments[0]?.value)) {
    const text = registration.callee.property.name === 'get' && registration.arguments[0].value === '/api/ui-refresh'
      ? `// Preserve the existing shared refresh state used by agent serialization.
const adminMessagesController = createAdminMessagesModule({
  db: pool,
  refreshState: { get: () => uiRefreshState, set: (next) => { uiRefreshState = next; } },
  // Legacy delivery uses polling. A future socket adapter belongs outside the service.
  events: { publish: async () => {} },
  invalidateAgents: invalidateAgentsEndpointCache,
}).controller;
// The baseline has no message-route authorization. This adapter characterizes
// that contract only; the full candidate remains disabled pending auth review.
const legacyMessageAuthorization = () => (_req, _res, next) => next();
mountAdminMessages(app, adminMessagesController, legacyMessageAuthorization);`
      : '';
    edits.push({ start: statement.start, end: statement.end, text });
    adminRemoved++;
  }
  if (registration && routeCall(registration) && customerHistoryPaths.has(registration.arguments[0]?.value)) {
    const path = registration.arguments[0].value;
    const mount = {
      '/api/calls/phone': 'mountCustomerCallsByPhone',
      '/api/customer-profile': 'mountCustomerProfile',
      '/api/intake-forms/phone': 'mountIntakeHistory',
      '/api/calls/customer-history': 'mountCustomerCallHistory',
    }[path];
    const setup = path === '/api/calls/phone' ? `const customerHistoryController = createCustomerHistoryModule({
  db: pool,
  serializeCalls: serializeCallRowsWithDisplayNames,
  serializeIntakes: serializeIntakeFormRow,
  buildProfile: buildCustomerProfile,
}).controller;
const legacyCustomerHistoryAuthorization = () => (_req, _res, next) => next();
` : '';
    edits.push({ start: statement.start, end: statement.end, text: `${setup}${mount}(app, customerHistoryController, legacyCustomerHistoryAuthorization);` });
    customerHistoryRemoved++;
  }
  if (registration && routeCall(registration) && reportCorePaths.has(registration.arguments[0]?.value)) {
    const path=registration.arguments[0].value;
    const setup=path==='/api/stats'?`const reportsController=createReportsModule({
  businessDate:getBusinessDateString,
  dashboardSummary:getDashboardStatsSummaryFromDatabase,
  queueMetrics:getDashboardAutoDialQueueMetrics,
  hourly:buildFilteredHourlyCallsFromDatabase,
  dateRows:fetchCachedDedupedReportRows,
  serializeRows:async (rows)=>rows,
  summarizeRows:summarizeSerializedCalls,
  summaryCache:reportSummaryCache,
  summaryCacheTtl:REPORT_SUMMARY_CACHE_TTL_MS,
  summaryCacheKey:buildReportSummaryCacheKey,
  readSharedSummary:readSharedReportSummaryCache,
  writeSharedSummary:writeSharedReportSummaryCache,
  normalizeDisposition:(value)=>cleanJustDialString(normalizeFormStatusLabel(value),100).toLowerCase(),
  normalizeSource:normalizeReportSourceFilterValue,
  filteredRows:(filters)=>fetchSerializedCallsByFilters(filters,{includeDisplayNames:true,hydrateCustomerProfiles:false,includeLeadSources:true,includeIntakeOnly:false,dedupe:false,forExport:true,limit:MAX_REPORT_EXPORT_ROWS}),
  filteredSummary:summarizeFilteredCallsFromDatabase,
  filteredHourly:buildFilteredHourlyCallsFromDatabase,
  filteredBreakdowns:buildFilteredReportBreakdownsFromDatabase,
  buildAnalytics:buildReportAnalytics,
  maxListLimit:MAX_LIST_API_LIMIT,
  defaultListLimit:DEFAULT_LIST_API_LIMIT,
  compactRows:compactCallListRows,
  databaseList:createDatabaseCallList({db:pool,buildFilters:buildCallFilters,visibilitySql:CALL_ROW_VISIBILITY_SQL,nonDuplicateSql:NON_DUPLICATE_REMOVED_CALL_SQL,nonArtifactSql:NON_REPORT_ARTIFACT_CALL_SQL,listSelectSql:CALL_LIGHTWEIGHT_LIST_SELECT_SQL,rowSortSql:CALL_ROW_SORT_SQL,openMissedSql:OPEN_MISSED_CALLBACK_STATUS_SQL,countableIncomingSql:countableIncomingCallSql,backfill:backfillRecordingMetadataOnCallRows,serialize:serializeCallRowsBasic,compact:compactCallListRows}),
  exportCsv:createDatabaseCallExport({db:pool,buildFilters:buildCallFilters,visibilitySql:CALL_ROW_VISIBILITY_SQL,nonDuplicateSql:NON_DUPLICATE_REMOVED_CALL_SQL,nonArtifactSql:NON_REPORT_ARTIFACT_CALL_SQL,listSelectSql:CALL_REPORT_LIST_SELECT_SQL,rowSortSql:CALL_ROW_SORT_SQL,serialize:serializeCallRowsWithDisplayNames,normalizeSource:normalizeReportSourceFilterValue,columns:REPORT_EXPORT_HEADERS,escapeCell:escapeCsvCell,buildRow:buildReportCsvRow,businessDate:getBusinessDateString}),
}).controller;
const legacyReportsAuthorization=()=> (_req,_res,next)=>next();
`:'';
    const mount=path==='/api/stats'?'mountDashboardStats':path==='/api/calls/date-details'?'mountCallDateDetails':path==='/api/calls/export'?'mountCallExport':path==='/api/calls/report-summary'?'mountReportSummary':'mountCallList';
    edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,reportsController,legacyReportsAuthorization);`});reportCoreRemoved++;
  }
  if (registration && routeCall(registration) && billingPaths.has(registration.arguments[0]?.value)) {
    const path=registration.arguments[0].value;
    const setup=path==='/api/customerdata/list'?`const billingController=createBillingModule({
  normalizeDate:normalizeQueryDate,
  normalizeContact:normalizeAutoDialPhone,
  listRows:fetchRemoteCustomerDataRowsByDate,
  lastSyncedAt:async(date)=>{const [[row]]=await pool.query('SELECT MAX(synced_at) AS last_synced_at FROM attica_remote_customer_data WHERE record_date=?',[date]);return row?.last_synced_at;},
  toIsoString:toApiIsoString,
  syncIfStale:()=>syncRemoteCustomerDataCacheIfStale(CUSTOMER_DATA_REMOTE_REPORT_SYNC_MS),
  cachedRemoteByPhone:fetchCachedRemoteCustomerDataRowsByPhone,
  localByPhone:fetchLocalCustomerDataRowsByPhone,
  remoteLookup:async(contact,timeoutMs)=>{let timeout=null;try{const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),timeoutMs);const response=await fetch(\`https://atticagold.biz/FlutterProject/customerdata.php?contact=\${encodeURIComponent(contact)}\`,{headers:{Accept:'application/json'},signal:controller.signal});return {ok:response.ok,payload:response.ok?await response.json():[]};}finally{if(timeout)clearTimeout(timeout);}},
  hasPayloadRows:hasCustomerDataPayloadRows,
}).controller;
const legacyBillingAuthorization=()=> (_req,_res,next)=>next();
` : '';
    const mount=path==='/api/customerdata/list'?'mountBillingList':'mountBillingLookup';
    edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,billingController,legacyBillingAuthorization);`});billingRemoved++;
  }
  if (registration && routeCall(registration) && smsPaths.has(registration.arguments[0]?.value)) {
    const path=registration.arguments[0].value;
    const setup=path==='/api/send-sms'?`const kaleyraProvider=createKaleyraClient({
  apiDomain:KALEYRA_API_DOMAIN,sender:KALEYRA_SENDER,smsType:KALEYRA_SMS_TYPE,templateId:KALEYRA_TEMPLATE_ID,publicBaseUrl:KALEYRA_PUBLIC_BASE_URL,
  readApiKey:readKaleyraApiKey,readSid:readKaleyraSid,readDlrToken:readKaleyraDlrToken,
});
const smsController=createSmsModule(createDatabaseSmsRepository(pool),kaleyraProvider,{logger:console}).controller;
const legacySmsAuthorization=()=> (_req,_res,next)=>next();
` : '';
    const mount=path==='/api/send-sms'?'mountSendSms':path==='/api/sms-log'?'mountSmsLog':'mountSmsDelivery';
    const auth=path==='/api/sms/dlr'?'':',legacySmsAuthorization';
    edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,smsController${auth});`});smsRemoved++;
  }
  if (registration && routeCall(registration) && followupPaths.has(registration.arguments[0]?.value)) {
    const path=registration.arguments[0].value,method=registration.callee.property.name;
    const setup=path==='/api/followups'&&method==='get'?`const followupsController=createFollowupsModule({
  maxLimit:MAX_DASHBOARD_FETCH_LIMIT,defaultLimit:DEFAULT_LIST_API_LIMIT,expire:expireOldFollowUps,
  list:async(limit)=>{const [rows]=await pool.query(\`SELECT * FROM attica_followups WHERE IFNULL(is_active,1)=1 AND status IN ('Pending','Rescheduled') AND \${FOLLOWUP_NOT_DUPLICATE_REMOVED_SQL} AND (followup_expires_at IS NULL OR followup_expires_at >= \${MYSQL_QUEUE_NOW_SQL}) ORDER BY created_at DESC LIMIT ?\`,[limit]);return rows;},
  serialize:(r)=>{const sourceMeta=deriveFollowUpSourceMetadata(r);return {id:r.id,customerName:r.customer_name,phone:r.phone,branch:r.branch,followUpAt:r.follow_up_at?r.follow_up_at.toISOString():'',status:r.status,agentId:r.agent_id,agentName:r.agent_name,notes:r.notes,outcome:r.outcome||'',updatedAt:r.updated_at?r.updated_at.toISOString():(r.created_at?r.created_at.toISOString():''),sourceCallId:sourceMeta.sourceCallId,sourceStatus:sourceMeta.sourceStatus};},
  loadRnrDisconnected:(options)=>runWithDbLockRetry(\`loadRnrDisconnectedCallsToFollowUpQueue:manual:\${options.lookbackDays}\`,()=>loadRnrDisconnectedCallsToFollowUpQueue(options),5),
  save:saveAgentFollowUp,update:updateAgentFollowUp,
  statusList:async()=>{const [rows]=await pool.query(\`SELECT s.*,a.status AS auto_dial_status_current,a.scheduled_for AS auto_dial_scheduled_for,a.scheduled_agent_id AS auto_dial_scheduled_agent_id,a.scheduled_agent_name AS auto_dial_scheduled_agent_name,a.assigned_agent_id AS auto_dial_assigned_agent_id,a.assigned_agent_name AS auto_dial_assigned_agent_name,a.last_error AS auto_dial_last_error FROM attica_status_followup_queue s LEFT JOIN attica_auto_dial_leads a ON a.id=s.auto_dial_lead_id WHERE s.is_active=1 AND (s.followup_expires_at IS NULL OR s.followup_expires_at >= \${MYSQL_QUEUE_NOW_SQL}) ORDER BY s.updated_at DESC LIMIT 500\`);return rows;},
  serializeStatus:serializeStatusFollowUpQueueRow,
  statusUpdate:async(queueId,body)=>{const nextStatus=normalizeFormStatusLabel(body.formStatus);if(!queueId)return {status:400,payload:{error:'Queue id required'}};const [rows]=await pool.query('SELECT * FROM attica_status_followup_queue WHERE id=? LIMIT 1',[queueId]),row=rows[0];if(!row)return {status:404,payload:{error:'Status follow-up not found'}};if(row.source_call_id&&nextStatus)await pool.query(\`UPDATE attica_calls SET form_status=?,callback_status=?,follow_up_flag=? WHERE id=?\`,[nextStatus,shouldQueueFormStatus(nextStatus)?'Pending':nextStatus,shouldQueueFormStatus(nextStatus)?1:0,row.source_call_id]);if(shouldQueueFormStatus(nextStatus)){await pool.query(\`UPDATE attica_auto_dial_leads SET lead_type=?,is_active=1,status='pending',assigned_agent_id=NULL,assigned_agent_name=NULL,assigned_at=NULL,dial_started_at=NULL,completed_at=NULL,queue_exit_reason=NULL,retry_allowed=1,open_dedupe_number=normalized_number,updated_at=NOW(),last_error='' WHERE id=?\`,[nextStatus,queueId]);await syncAutoDialLeadStatusToSources(queueId,'pending');await pool.query(\`UPDATE attica_followups SET status='Pending',is_active=1,outcome=?,updated_at=NOW() WHERE id=?\`,[\`Status follow-up: \${nextStatus}\`,row.follow_up_id]);await pool.query(\`UPDATE attica_status_followup_queue SET form_status=?,is_active=1,updated_at=NOW() WHERE id=?\`,[nextStatus,queueId]);void triggerAutoDialAssignment('event');return {status:200,payload:{success:true,active:true}};}const result=await closeStatusFollowUp(normalizeAutoDialPhone(row.phone),nextStatus);return {status:200,payload:{success:true,active:false,result}};},
}).controller;
const legacyFollowupsAuthorization=()=> (_req,_res,next)=>next();
`:'';
    const mount=path==='/api/followups'?(method==='get'?'mountFollowupsList':'mountFollowupsSave'):path==='/api/followups/load-rnr-disconnected'?'mountFollowupsLoad':path==='/api/followups/:id'?'mountFollowupsUpdate':path==='/api/status-followups'?'mountStatusFollowupsList':'mountStatusFollowupsUpdate';
    edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,followupsController,legacyFollowupsAuthorization);`});followupRemoved++;
  }
  if(registration&&routeCall(registration)&&intakePaths.has(registration.arguments[0]?.value)){
    const path=registration.arguments[0].value,method=registration.callee.property.name;
    const setup=path==='/api/intake-forms'?`const intakeController=createIntakeModule({
  saveForm:(requestBody)=>withCallSaveLock(requestBody,(lockConnection)=>runTransactionWithRetries(async(connection)=>upsertIntakeFormRecord(connection,requestBody),{attempts:3,baseDelayMs:75,label:\`save intake form \${cleanCanonicalCallId(requestBody?.id,50)||cleanCanonicalIntakeToken(requestBody?.intakeToken)||'unknown'}\`,connection:lockConnection})),
  syncIvr:saveCallIvrCache,customerIdForPhone:getCustomerUidForPhone,toIso:toApiIsoString,
  readPending:intakeWorkflows.readPending,
  pendingCall:async(workflow,agentId)=>{const [[agent]]=await pool.query('SELECT extension FROM attica_agents WHERE id=?',[agentId]);const endpoint=agent&&getAgentLiveEndpointState(agent.extension);if(!isAgentEndpointExplicitlyIdle(endpoint))return null;const [[call]]=await pool.query('SELECT * FROM attica_calls WHERE id=? AND agent_id=?',[workflow.callId,agentId]);return call?serializeCallRow(call):null;},
  readWorkflow:intakeWorkflows.read,mutateWorkflow:intakeWorkflows.mutate,isRetryable:isRetryableMysqlTransactionError,
  normalizeAgentId,cleanCallId:(value)=>cleanCanonicalCallId(value,120),cleanErrorCode:(value)=>cleanJustDialString(value,80),
  onSyncError:(error)=>console.error('Failed to sync IVR cache after intake save:',error),
}).controller;
const legacyIntakeAuthorization=()=> (_req,_res,next)=>next();
`:'';
    const mount=path==='/api/intake-forms'?'mountIntakeFormSave':path==='/api/intake-workflow/pending'?'mountIntakePending':method==='get'?'mountIntakeRead':'mountIntakeMutate';
    edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,intakeController,legacyIntakeAuthorization);`});intakeRemoved++;
  }
  if(registration&&routeCall(registration)&&agentStatusPaths.has(registration.arguments[0]?.value)&&registration.callee.property.name==='get'){
    const path=registration.arguments[0].value;
    const setup=path==='/api/agents'?`const agentStatusController=createAgentStatusModule({
  normalizeAgentId,
  list:loadAgentRecordsForEndpoint,
  detail:async(agentId)=>{if(!agentId)return{status:400,payload:{error:'Agent id required'}};const [[agentRow]]=await pool.query(\`SELECT id,name,email,role,extension,shift,status,admin_message,is_logged_in,login_time,logout_time,last_login_at,last_logout_at,active_duration,break_time,follow_up_started_at,follow_up_duration,incoming_access,outgoing_access,follow_up_access,active_call_id,active_call_direction,active_call_started_at,call_state_updated_at,last_call_ended_at,last_login_ip,last_public_login_ip,last_workstation_ip,last_workstation_ip_seen_at,last_login_device_id FROM attica_agents WHERE id=? LIMIT 1\`,[agentId]);if(!agentRow?.id)return{status:404,payload:{error:'Agent not found'}};const [breakRows]=await pool.query(\`SELECT agent_id,break_type,started_at,created_at FROM attica_break_logs WHERE agent_id=? AND end_time IS NULL\`,[agentId]);let liveChannels=[];try{liveChannels=readAsteriskConciseChannels();}catch{}const pjsipContactIpByExtension=parsePjsipContactIpByExtension(readPjsipContactOutput());const [agent]=applyRuntimeAgentStatus([agentRow],breakRows,{liveChannels}).map(entry=>serializeAgentRecord({...entry,sip_contact_ip:pjsipContactIpByExtension.get(normalizeSipExtension(entry.extension))||''}));return{status:200,payload:attachCurrentUiRefreshStateToAgents([agent])[0]};},
  sessions:async(query)=>{const limit=Math.max(1,Math.min(1000,parsePositiveInteger(query.limit,300))),rawDays=String(query.days||'').trim(),days=rawDays?Math.max(0,Math.min(365,parsePositiveInteger(rawDays,14))):0,where=[],params=[];if(days>0){where.push('COALESCE(login_at,logout_at,created_at,updated_at)>=DATE_SUB(NOW(),INTERVAL ? DAY)');params.push(days);}const [rows]=await pool.query(\`SELECT id,agent_id,agent_name,role,extension,login_at,logout_at,login_time,logout_time,login_ip,public_login_ip,workstation_ip,workstation_ip_seen_at,device_id,active_duration,break_time,created_at,updated_at FROM attica_agent_sessions \${where.length?\`WHERE \${where.join(' AND ')}\`:''} ORDER BY login_at DESC,id DESC LIMIT ?\`,[...params,limit]);return rows.map(serializeAgentSessionRecord);},
}).controller;
const legacyAgentStatusAuthorization=()=> (_req,_res,next)=>next();
`:'';
    const mount=path==='/api/agents'?'mountAgentsList':path==='/api/agents/:id'?'mountAgentDetail':'mountAgentSessions';edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,agentStatusController,legacyAgentStatusAuthorization);`});agentStatusRemoved++;
  }
  if(registration&&routeCall(registration)&&referenceDataPaths.has(registration.arguments[0]?.value)){
    const path=registration.arguments[0].value,method=registration.callee.property.name,setup=path==='/api/rates'&&method==='get'?`const referenceDataController=createReferenceDataModule({defaultPledgePlaces:DEFAULT_PLEDGE_PLACES,listRates:async()=>{const [rows]=await pool.query('SELECT label, value FROM attica_metal_rates');return rows;},updateRate:(value,label)=>pool.query('UPDATE attica_metal_rates SET value=? WHERE label=?',[value,label]),createRate:(label,value)=>pool.query('INSERT INTO attica_metal_rates (label,value) VALUES (?,?)',[label,value]),deleteRate:(label)=>pool.query('DELETE FROM attica_metal_rates WHERE label=?',[label]),listPledgePlaces:readPledgePlaces,updatePledgePlaces}).controller;const legacyReferenceDataAuthorization=()=> (_req,_res,next)=>next();\n`:'';
    const mount=path==='/api/rates'?(method==='get'?'mountRatesList':method==='put'?'mountRatesUpdate':method==='post'?'mountRatesCreate':'mountRatesDelete'):(method==='get'?'mountPledgePlacesList':'mountPledgePlacesUpdate');edits.push({start:statement.start,end:statement.end,text:`${setup}${mount}(app,referenceDataController,legacyReferenceDataAuthorization);`});referenceDataRemoved++;
  }
  if (statement.type === 'FunctionDeclaration' && statement.id.name === 'serializeBranchRow') {
    edits.push({ start: statement.start, end: statement.end, text: `const branchesController = createBranchesModule({
  db: pool,
  geocoding: { hasGooglePlacesApiKey, geocodeGooglePlace, geocodePhotonPlace },
});` });
  }
  const call = statement.expression;
  if (!call || !routeCall(call) || !branchPaths.has(call.arguments[0]?.value)) continue;
  const method = call.callee.property.name;
  const path = call.arguments[0].value;
  const text = method === 'get' && path === '/api/branches'
    ? 'mountBranchesCatalog(app, branchesController);'
    : path === '/api/branches/autocomplete' ? 'mountBranchesAutocomplete(app, branchesController);' : '';
  edits.push({ start: statement.start, end: statement.end, text });
  removed++;
}
const replacedRouteStarts=new Set(edits.filter(edit=>edit.end>edit.start).map(edit=>edit.start));let ownedLegacyRemoved=0;
const ownerMount={callRecords:'mountCallRecordsRoute',agentManagement:'mountAgentManagementRoute',callControl:'mountCallControlRoute',leadIngestion:'mountLeadIngestionRoute',marketing:'mountMarketingRoute',autoDial:'mountAutoDialRoute',locationIvr:'mountLocationIvrRoute'};
for(const statement of ast.body){const registration=statement.expression;if(!registration||!routeCall(registration)||replacedRouteStarts.has(statement.start))continue;const method=registration.callee.property.name,pathArgument=registration.arguments[0],paths=pathArgument.type==='ArrayExpression'?pathArgument.elements.map(item=>item?.value):[pathArgument.value],owners=[...new Set(paths.map(legacyRouteOwner))];if(owners.length!==1||!owners[0]||!ownerMount[owners[0]])throw new Error(`Unowned remaining route at baseline line ${statement.loc.start.line}`);const args=registration.arguments.map(argument=>source.slice(argument.start,argument.end)).join(','),individual=method==='put'&&registration.arguments[0]?.value==='/api/agents/:id'?'mountIndividualMessage(app,adminMessagesController,legacyMessageAuthorization);\n':'';edits.push({start:statement.start,end:statement.end,text:`${individual}${ownerMount[owners[0]]}(app,'${method}',${args});`});ownedLegacyRemoved++;}
if (removed !== 6 || adminRemoved !== 6 || customerHistoryRemoved !== 4 || reportCoreRemoved !== 5 || billingRemoved !== 2 || smsRemoved !== 3 || followupRemoved !== 6 || intakeRemoved !== 4 || agentStatusRemoved !== 3 || referenceDataRemoved !== 6 || ownedLegacyRemoved !== 69 || edits.length !== 121) throw new Error(`Unexpected baseline layout; refusing an incomplete extraction.`);
let candidate = source;
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  candidate = candidate.slice(0, edit.start) + edit.text + candidate.slice(edit.end);
}
candidate = `import { mountCallRecordsRoute } from '../modules/call-records/index.js';
import { mountAgentManagementRoute } from '../modules/agent-management/index.js';
import { mountCallControlRoute } from '../modules/call-control/index.js';
import { mountLeadIngestionRoute } from '../modules/lead-ingestion/index.js';
import { mountMarketingRoute } from '../modules/marketing/index.js';
import { mountAutoDialRoute } from '../modules/auto-dial/index.js';
import { mountLocationIvrRoute } from '../modules/location-ivr/index.js';
import { createReferenceDataModule, mountRatesList, mountRatesUpdate, mountRatesCreate, mountRatesDelete, mountPledgePlacesList, mountPledgePlacesUpdate } from '../modules/reference-data/index.js';
import { createAgentStatusModule, mountAgentsList, mountAgentDetail, mountAgentSessions } from '../modules/agent-status/index.js';
import { createIntakeModule, mountIntakeFormSave, mountIntakePending, mountIntakeRead, mountIntakeMutate } from '../modules/intake/index.js';
import { createFollowupsModule, mountFollowupsList, mountFollowupsLoad, mountFollowupsSave, mountFollowupsUpdate, mountStatusFollowupsList, mountStatusFollowupsUpdate } from '../modules/followups/index.js';
import { createKaleyraClient } from '../integrations/sms/providers/kaleyra.client.js';
import { createSmsModule, createDatabaseSmsRepository, mountSendSms, mountSmsLog, mountSmsDelivery } from '../modules/sms/index.js';
import { createBillingModule, mountBillingList, mountBillingLookup } from '../modules/billing/index.js';
import { createReportsModule, createDatabaseCallList, createDatabaseCallExport, mountDashboardStats, mountCallDateDetails, mountCallExport, mountReportSummary, mountCallList } from '../modules/reports/index.js';
import { createCustomerHistoryModule, mountCustomerCallsByPhone, mountCustomerProfile, mountIntakeHistory, mountCustomerCallHistory } from '../modules/customer-history/index.js';
import { createAdminMessagesModule, mountAdminMessages, mountIndividualMessage } from '../modules/admin-messages/index.js';
import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from '../modules/branches/index.js';
// This full candidate still contains legacy startup side effects. It is a
// review artifact, not the staging entrypoint. Use ../server.js for tests.
throw new Error('Full runtime startup is disabled during incremental migration; use the isolated staging server.');
\n` + candidate;
mkdirSync(projectRoot + 'runtime', { recursive: true, mode: 0o700 });
writeFileSync(projectRoot + 'runtime/server.js', candidate, { mode: 0o600 });
for (const name of ['intake-workflow.mjs', 'md-reporting.mjs']) {
  writeFileSync(projectRoot + 'runtime/' + name, readBaseline(name), { mode: 0o600 });
}
console.log(`Prepared non-runnable full candidate: ${source.split('\n').length-candidate.split('\n').length} fewer server.js lines; all 120 registrations have feature owners (45 service-extracted; 75 preserve legacy handlers behind feature route contracts).`);
