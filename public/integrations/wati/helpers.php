<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function wati_json_response(array $payload, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function wati_read_json_body(): array {
    $raw = file_get_contents('php://input');
    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    return $decoded;
}

function wati_clean_text($value, int $maxLength = 255): string {
    $text = trim((string)$value);
    $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $text);
    $text = preg_replace('/\s+/u', ' ', (string)$text);
    if (function_exists('mb_substr')) {
        return mb_substr((string)$text, 0, $maxLength);
    }
    return substr((string)$text, 0, $maxLength);
}

function normalizePhone(string $phone): string {
    $phone = preg_replace('/\D+/', '', $phone);
    if (strlen((string)$phone) === 10) {
        return '91' . $phone;
    }
    if (strlen((string)$phone) === 12 && strpos((string)$phone, '91') === 0) {
        return (string)$phone;
    }
    return (string)$phone;
}

function wati_normalize_template_name(string $templateName): string {
    $templateName = wati_clean_text($templateName, 100);
    $legacyTemplateMap = [
        'ag_missed_call_callback' => 'missed_call_callback',
        'ag_rnr_no_response' => 'rnr_no_response',
        'ag_call_failed_callback' => 'call_failed_callback',
        'ag_customer_disconnected' => 'customer_disconnected',
        'ag_customer_busy' => 'customer_busy',
        'ag_phone_switched_off' => 'phone_switched_off',
        'ag_unable_to_hear_customer' => 'unable_to_hear_customer',
        'ag_customer_unable_to_hear_cc' => 'customer_unable_to_hear_cc',
    ];
    $approvedTemplates = [
        'missed_call_callback',
        'rnr_no_response',
        'call_failed_callback',
        'customer_disconnected',
        'customer_busy',
        'phone_switched_off',
        'unable_to_hear_customer',
        'customer_unable_to_hear_cc',
    ];

    foreach ($legacyTemplateMap as $legacyTemplate => $approvedTemplate) {
        if ($templateName === $legacyTemplate || preg_match('/^' . preg_quote($legacyTemplate, '/') . '_\d+$/', $templateName)) {
            return $approvedTemplate;
        }
    }

    foreach ($approvedTemplates as $approvedTemplate) {
        if ($templateName === $approvedTemplate) {
            return $templateName;
        }
        if (preg_match('/^' . preg_quote($approvedTemplate, '/') . '_\d+$/', $templateName)) {
            return $approvedTemplate;
        }
    }

    return $templateName;
}

function wati_db(): mysqli {
    static $db = null;
    if ($db instanceof mysqli) {
        return $db;
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db = new mysqli(ATTICA_DB_HOST, ATTICA_DB_USER, ATTICA_DB_PASS, ATTICA_DB_NAME);
    $db->set_charset('utf8mb4');
    return $db;
}

function wati_exec_sql(string $sql): void {
    wati_db()->query($sql);
}

function wati_ensure_tables(): void {
    wati_exec_sql("
        CREATE TABLE IF NOT EXISTS wati_message_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            call_uuid VARCHAR(100) NOT NULL,
            customer_number VARCHAR(20) NOT NULL,
            event_key VARCHAR(50) NOT NULL,
            template_name VARCHAR(100) NOT NULL,
            request_payload LONGTEXT NULL,
            response_payload LONGTEXT NULL,
            provider_message_id VARCHAR(255) NULL,
            send_status VARCHAR(50) DEFAULT 'queued',
            sent_at DATETIME NULL,
            delivered_at DATETIME NULL,
            read_at DATETIME NULL,
            failed_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_call_event (call_uuid, event_key),
            KEY idx_customer_number (customer_number),
            KEY idx_provider_message_id (provider_message_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    wati_exec_sql("
        CREATE TABLE IF NOT EXISTS wati_inbound_webhooks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            provider_message_id VARCHAR(255) NULL,
            customer_number VARCHAR(20) NULL,
            event_type VARCHAR(50) NULL,
            message_text TEXT NULL,
            raw_payload LONGTEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_provider_message_id (provider_message_id),
            KEY idx_customer_number (customer_number),
            KEY idx_event_type (event_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    wati_exec_sql("
        CREATE TABLE IF NOT EXISTS wati_template_master (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_key VARCHAR(50) NOT NULL,
            template_name VARCHAR(100) NOT NULL,
            language_code VARCHAR(10) DEFAULT 'en',
            is_active TINYINT(1) DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_event_key (event_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    wati_exec_sql("
        CREATE TABLE IF NOT EXISTS aisensy_tagged_contacts (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            customer_number VARCHAR(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
            tag_name VARCHAR(120) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
            source VARCHAR(80) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT 'WhatsApp Ads',
            first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            raw_payload LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_customer_tag (customer_number, tag_name),
            KEY idx_customer_number (customer_number),
            KEY idx_tag_name (tag_name),
            KEY idx_first_seen_at (first_seen_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci
    ");

    global $WATI_EVENT_MAP;
    $stmt = wati_db()->prepare("
        INSERT INTO wati_template_master (event_key, template_name, language_code, is_active)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
            template_name=template_name,
            language_code=language_code,
            is_active=is_active
    ");
    foreach ($WATI_EVENT_MAP as $eventKey => $templateName) {
        $language = WATI_TEMPLATE_LANGUAGE;
        $stmt->bind_param('sss', $eventKey, $templateName, $language);
        $stmt->execute();
    }
    $stmt->close();
}

function wati_request_secret(): string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $key => $value) {
        if (strtolower((string)$key) === 'x-wati-secret' || strtolower((string)$key) === 'x-dialer-secret') {
            return trim((string)$value);
        }
    }
    return trim((string)($_GET['secret'] ?? ''));
}

function wati_require_secret(string $expectedSecret, string $label = 'secret'): void {
    if ($expectedSecret === '') {
        if (PHP_SAPI === 'cli' || WATI_ALLOW_UNSECURED_ENDPOINTS === '1') {
            return;
        }
        wati_json_response(['status' => false, 'message' => strtoupper($label) . ' is not configured'], 503);
    }
    $provided = wati_request_secret();
    if (!hash_equals($expectedSecret, $provided)) {
        wati_json_response(['status' => false, 'message' => 'Invalid ' . $label], 401);
    }
}

function wati_lookup_template(string $eventKey): string {
    global $WATI_EVENT_MAP;
    $eventKey = strtoupper(wati_clean_text($eventKey, 50));
    wati_ensure_tables();

    $stmt = wati_db()->prepare("
        SELECT template_name
        FROM wati_template_master
        WHERE event_key=? AND is_active=1
        LIMIT 1
    ");
    $stmt->bind_param('s', $eventKey);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row && trim((string)$row['template_name']) !== '') {
        return wati_normalize_template_name((string)$row['template_name']);
    }
    return wati_normalize_template_name($WATI_EVENT_MAP[$eventKey] ?? '');
}

function wati_extract_provider_message_id(array $response): string {
    $candidates = [
        $response['id'] ?? '',
        $response['messageId'] ?? '',
        $response['message_id'] ?? '',
        $response['localMessageId'] ?? '',
        $response['receivers'][0]['localMessageId'] ?? '',
        $response['receivers'][0]['messageId'] ?? '',
        $response['receivers'][0]['id'] ?? '',
        $response['data']['id'] ?? '',
        $response['data']['messageId'] ?? '',
        $response['data']['message_id'] ?? '',
        $response['data']['campaignId'] ?? '',
        $response['data']['campaign_id'] ?? '',
        $response['data']['requestId'] ?? '',
        $response['result']['id'] ?? '',
        $response['result']['messageId'] ?? '',
        $response['result']['message_id'] ?? '',
        $response['result']['campaignId'] ?? '',
        $response['result']['requestId'] ?? '',
        $response['campaignId'] ?? '',
        $response['campaign_id'] ?? '',
        $response['requestId'] ?? '',
    ];
    foreach ($candidates as $candidate) {
        $value = wati_clean_text($candidate, 255);
        if ($value !== '') {
            return $value;
        }
    }
    return '';
}

function wati_find_first(array $payload, array $keys): string {
    foreach ($keys as $key) {
        if (isset($payload[$key]) && !is_array($payload[$key])) {
            $value = wati_clean_text($payload[$key], 1000);
            if ($value !== '') {
                return $value;
            }
        }
    }
    foreach ($payload as $value) {
        if (is_array($value)) {
            $found = wati_find_first($value, $keys);
            if ($found !== '') {
                return $found;
            }
        }
    }
    return '';
}

function wati_reply_action(string $messageText): string {
    $text = strtolower($messageText);
    if ($text === '') return '';
    if (strpos($text, 'call me') !== false || strpos($text, 'callback') !== false) return 'CALL_BACK';
    if (strpos($text, 'interested') !== false) return 'INTERESTED';
    if (strpos($text, 'location') !== false || strpos($text, 'branch') !== false || strpos($text, 'map') !== false) return 'SHARE_LOCATION';
    if (strpos($text, 'coming') !== false || strpos($text, 'office') !== false) return 'COMING_TO_OFFICE';
    if (strpos($text, 'not interested') !== false) return 'NOT_INTERESTED';
    return '';
}

function wati_create_reply_followup(string $customerNumber, string $messageText, string $action): void {
    if ($customerNumber === '' || $action === '') {
        return;
    }
    $phone10 = substr($customerNumber, -10);
    $followUpId = 'FU-WATI-' . $phone10 . '-' . date('YmdHis');
    $customerName = 'WATI Reply';
    $notes = wati_clean_text('WATI reply action: ' . $action . ' | Message: ' . $messageText, 1000);
    $followUpAt = date('Y-m-d H:i:s');

    $stmt = wati_db()->prepare("
        INSERT INTO attica_followups
            (id, customer_name, phone, branch, follow_up_at, status, agent_id, agent_name, notes, outcome, updated_at)
        VALUES (?, ?, ?, '', ?, 'Pending', '', '', ?, 'WATI Reply', NOW())
    ");
    $stmt->bind_param('sssss', $followUpId, $customerName, $phone10, $followUpAt, $notes);
    $stmt->execute();
    $stmt->close();
}
