<?php
declare(strict_types=1);

require_once __DIR__ . '/send_wati_message.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wati_json_response(['status' => false, 'message' => 'POST required'], 405);
}

wati_require_secret(WATI_DIALER_SECRET, 'dialer secret');
wati_ensure_tables();

$input = wati_read_json_body();
if (!$input) {
    wati_json_response(['status' => false, 'message' => 'Invalid JSON'], 400);
}

$callUuid = wati_clean_text($input['call_uuid'] ?? '', 100);
$eventKey = strtoupper(wati_clean_text($input['event_key'] ?? ($input['disposition'] ?? ''), 50));
$customerNumber = normalizePhone((string)($input['customer_number'] ?? $input['phone'] ?? ''));
$customerName = wati_clean_text($input['customer_name'] ?? '', 255);
$agentId = wati_clean_text($input['agent_id'] ?? '', 50);
$agentName = wati_clean_text($input['agent_name'] ?? '', 255);
$branchName = wati_clean_text($input['branch_name'] ?? '', 255);

if ($agentId === '') {
    $agentId = 'IVR';
}
if ($agentName === '') {
    $agentName = $agentId === 'IVR' ? 'IVR' : '';
}

if ($callUuid === '' || $eventKey === '' || $customerNumber === '') {
    wati_json_response([
        'status' => false,
        'message' => 'Missing required fields',
        'required' => ['call_uuid', 'customer_number', 'event_key'],
    ], 422);
}

$templateName = wati_lookup_template($eventKey);
if ($templateName === '') {
    wati_json_response([
        'status' => true,
        'message' => 'No WATI template mapped',
        'event_key' => $eventKey,
    ]);
}

$requestPayload = [
    'call_uuid' => $callUuid,
    'customer_number' => $customerNumber,
    'customer_name' => $customerName,
    'agent_id' => $agentId,
    'agent_name' => $agentName,
    'branch_name' => $branchName,
    'call_type' => wati_clean_text($input['call_type'] ?? '', 50),
    'disposition' => wati_clean_text($input['disposition'] ?? '', 50),
    'event_key' => $eventKey,
    'language' => wati_clean_text($input['language'] ?? WATI_TEMPLATE_LANGUAGE, 10),
    'call_end_time' => wati_clean_text($input['call_end_time'] ?? date('Y-m-d H:i:s'), 30),
    'template_name' => $templateName,
];
$requestJson = json_encode($requestPayload, JSON_UNESCAPED_SLASHES);

$db = wati_db();
$stmt = $db->prepare("
    INSERT IGNORE INTO wati_message_logs
        (call_uuid, customer_number, event_key, template_name, request_payload, send_status)
    VALUES (?, ?, ?, ?, ?, 'queued')
");
$stmt->bind_param('sssss', $callUuid, $customerNumber, $eventKey, $templateName, $requestJson);
$stmt->execute();
$inserted = $stmt->affected_rows > 0;
$stmt->close();

if (!$inserted) {
    $stmt = $db->prepare("
        SELECT id, send_status, provider_message_id, sent_at, delivered_at, read_at, failed_at
        FROM wati_message_logs
        WHERE call_uuid=? AND event_key=?
        LIMIT 1
    ");
    $stmt->bind_param('ss', $callUuid, $eventKey);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $accepted = in_array(strtolower((string)($existing['send_status'] ?? '')), ['queued', 'sent', 'delivered', 'read'], true);
    wati_json_response([
        'status' => $accepted,
        'duplicate' => true,
        'message' => $accepted ? 'WhatsApp already processed for this call/event' : 'Previous WhatsApp send failed; message was not sent',
        'log' => $existing,
    ], $accepted ? 200 : 502);
}

$sendResult = sendWatiTemplate($requestPayload);
$sendResult['error'] = wati_send_result_error($sendResult);
$success = $sendResult['error'] === '';
$sendStatus = $success ? 'sent' : ($sendResult['http_code'] === 0 ? 'config_missing' : 'failed');
$responsePayload = json_encode($sendResult, JSON_UNESCAPED_SLASHES);
$providerMessageId = wati_clean_text($sendResult['provider_message_id'] ?? '', 255);

$stmt = $db->prepare("
    UPDATE wati_message_logs
    SET response_payload=?,
        provider_message_id=NULLIF(?, ''),
        send_status=?,
        sent_at=CASE WHEN ?='sent' THEN NOW() ELSE sent_at END,
        failed_at=CASE WHEN ?='failed' OR ?='config_missing' THEN NOW() ELSE failed_at END
    WHERE call_uuid=? AND event_key=?
");
$stmt->bind_param(
    'ssssssss',
    $responsePayload,
    $providerMessageId,
    $sendStatus,
    $sendStatus,
    $sendStatus,
    $sendStatus,
    $callUuid,
    $eventKey
);
$stmt->execute();
$stmt->close();

wati_json_response([
    'status' => $success,
    'template' => $templateName,
    'number' => $customerNumber,
    'send_status' => $sendStatus,
    'provider_message_id' => $providerMessageId,
    'wati_http_code' => $sendResult['http_code'],
    'wati_error' => $sendResult['error'],
], $success ? 200 : 502);
