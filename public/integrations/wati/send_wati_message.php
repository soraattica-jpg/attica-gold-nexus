<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

function wati_send_result_error(array $result): string {
    $transportError = wati_clean_text($result['error'] ?? '', 255);
    if ($transportError !== '') {
        return $transportError;
    }
    $httpCode = (int)($result['http_code'] ?? 0);
    $body = json_decode((string)($result['response'] ?? ''), true);
    $bodyFailed = is_array($body) && (
        ($body['status'] ?? null) === false
        || ($body['result'] ?? null) === false
        || (is_numeric($body['errorCode'] ?? null) && (int)$body['errorCode'] >= 400)
    );
    if ($httpCode >= 200 && $httpCode < 300 && !$bodyFailed) {
        return '';
    }
    $message = is_array($body) ? ($body['errorMessage'] ?? $body['message'] ?? '') : '';
    return is_string($message) && trim($message) !== ''
        ? wati_clean_text($message, 255)
        : 'WhatsApp provider rejected the request (HTTP ' . $httpCode . ')';
}

function wati_build_send_url(string $customerNumber): string {
    $endpoint = WATI_SEND_ENDPOINT;
    if (strpos($endpoint, '{phone}') !== false) {
        return WATI_BASE_URL . str_replace('{phone}', rawurlencode($customerNumber), $endpoint);
    }

    $separator = strpos($endpoint, '?') === false ? '?' : '&';
    return WATI_BASE_URL . $endpoint . $separator . 'whatsappNumber=' . rawurlencode($customerNumber);
}

function wati_template_parameters(array $payload): array {
    return [
        ['name' => 'customer_name', 'value' => $payload['customer_name'] ?: 'Customer'],
        ['name' => 'callback_number', 'value' => WATI_CALLBACK_NUMBER],
        ['name' => 'branch_name', 'value' => $payload['branch_name'] ?: 'Attica Gold'],
        ['name' => 'agent_name', 'value' => $payload['agent_name'] ?: 'Attica Gold'],
    ];
}

function aisensy_destination(string $customerNumber): string {
    $normalized = normalizePhone($customerNumber);
    if ($normalized === '') {
        return '';
    }
    return '+' . $normalized;
}

function aisensy_template_param_values(array $payload): array {
    $values = [
        'customer_name' => wati_clean_text($payload['customer_name'] ?? '', 255) ?: 'Customer',
        'callback_number' => AISENSY_CALLBACK_NUMBER,
        'branch_name' => wati_clean_text($payload['branch_name'] ?? '', 255) ?: 'Attica Gold',
        'agent_name' => wati_clean_text($payload['agent_name'] ?? '', 255) ?: 'Attica Gold',
    ];

    $order = array_filter(array_map('trim', explode(',', AISENSY_TEMPLATE_PARAM_ORDER)));

    $params = [];
    foreach ($order as $key) {
        if (array_key_exists($key, $values)) {
            $params[] = (string)$values[$key];
        }
    }
    return $params;
}

function sendAiSensyCampaign(array $payload): array {
    $customerNumber = normalizePhone((string)($payload['customer_number'] ?? ''));
    $templateName = wati_normalize_template_name((string)($payload['template_name'] ?? ''));
    $callUuid = wati_clean_text($payload['call_uuid'] ?? '', 100);
    $eventKey = strtoupper(wati_clean_text($payload['event_key'] ?? '', 50));
    $customerName = wati_clean_text($payload['customer_name'] ?? '', 255) ?: 'Customer';
    $branchName = wati_clean_text($payload['branch_name'] ?? '', 255) ?: 'Attica Gold';
    $agentName = wati_clean_text($payload['agent_name'] ?? '', 255) ?: 'Attica Gold';

    $body = [
        'apiKey' => AISENSY_API_KEY,
        'campaignName' => $templateName,
        'destination' => aisensy_destination($customerNumber),
        'userName' => $customerName,
        'source' => AISENSY_DEFAULT_SOURCE,
        'templateParams' => aisensy_template_param_values([
            'customer_name' => $customerName,
            'branch_name' => $branchName,
            'agent_name' => $agentName,
        ]),
        'tags' => array_values(array_filter(['attica-callcenter', strtolower($eventKey)])),
        'attributes' => [
            'call_uuid' => $callUuid,
            'event_key' => $eventKey,
            'customer_number' => $customerNumber,
            'branch_name' => $branchName,
            'agent_name' => $agentName,
        ],
    ];

    if (AISENSY_API_URL === '' || AISENSY_API_KEY === '') {
        return [
            'http_code' => 0,
            'error' => 'AISENSY_API_URL or AISENSY_API_KEY is not configured',
            'response' => '',
            'request' => array_merge($body, ['apiKey' => '***redacted***']),
            'provider_message_id' => '',
        ];
    }

    $ch = curl_init(AISENSY_API_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        CURLOPT_CONNECTTIMEOUT => WATI_CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT => WATI_REQUEST_TIMEOUT,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    $decoded = json_decode((string)$response, true);
    $providerMessageId = is_array($decoded) ? wati_extract_provider_message_id($decoded) : '';

    return [
        'http_code' => $httpCode,
        'error' => $curlError,
        'response' => (string)$response,
        'request' => array_merge($body, ['apiKey' => '***redacted***']),
        'provider_message_id' => $providerMessageId,
    ];
}

function sendWatiTemplate(array $payload): array {
    if (WHATSAPP_PROVIDER === 'aisensy') {
        return sendAiSensyCampaign($payload);
    }

    $customerNumber = normalizePhone((string)($payload['customer_number'] ?? ''));
    $templateName = wati_normalize_template_name((string)($payload['template_name'] ?? ''));
    $callUuid = wati_clean_text($payload['call_uuid'] ?? '', 100);
    $eventKey = wati_clean_text($payload['event_key'] ?? '', 50);

    $body = [
        'template_name' => $templateName,
        'broadcast_name' => wati_clean_text('attica_' . strtolower($eventKey) . '_' . $callUuid, 200),
        'parameters' => wati_template_parameters([
            'customer_name' => wati_clean_text($payload['customer_name'] ?? '', 255),
            'branch_name' => wati_clean_text($payload['branch_name'] ?? '', 255),
            'agent_name' => wati_clean_text($payload['agent_name'] ?? '', 255),
        ]),
    ];

    if (WATI_TEMPLATE_LANGUAGE !== '') {
        $body['language_code'] = WATI_TEMPLATE_LANGUAGE;
    }

    if (WATI_BASE_URL === '' || WATI_API_TOKEN === '') {
        return [
            'http_code' => 0,
            'error' => 'WATI_BASE_URL or WATI_API_TOKEN is not configured',
            'response' => '',
            'request' => $body,
            'provider_message_id' => '',
        ];
    }

    $url = wati_build_send_url($customerNumber);
    $headers = [
        'Content-Type: application/json',
        WATI_AUTH_HEADER . ': ' . WATI_AUTH_PREFIX . WATI_API_TOKEN,
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_SLASHES),
        CURLOPT_CONNECTTIMEOUT => WATI_CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT => WATI_REQUEST_TIMEOUT,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    $decoded = json_decode((string)$response, true);
    $providerMessageId = is_array($decoded) ? wati_extract_provider_message_id($decoded) : '';

    return [
        'http_code' => $httpCode,
        'error' => $curlError,
        'response' => (string)$response,
        'request' => $body,
        'provider_message_id' => $providerMessageId,
    ];
}

if (basename(__FILE__) === basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''))) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        wati_json_response(['status' => false, 'message' => 'POST required'], 405);
    }
    wati_require_secret(WATI_DIALER_SECRET, 'dialer secret');
    $payload = wati_read_json_body();
    $result = sendWatiTemplate($payload);
    $result['error'] = wati_send_result_error($result);
    $success = $result['error'] === '';
    wati_json_response(['status' => $success, 'result' => $result], $success ? 200 : 502);
}
