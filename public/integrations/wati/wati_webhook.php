<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wati_json_response(['status' => false, 'message' => 'POST required'], 405);
}

$webhookSecret = WHATSAPP_PROVIDER === 'aisensy' ? AISENSY_WEBHOOK_SECRET : WATI_WEBHOOK_SECRET;
wati_require_secret($webhookSecret, 'webhook secret');
wati_ensure_tables();

$rawPayload = file_get_contents('php://input');
$payload = json_decode((string)$rawPayload, true);
if (!is_array($payload)) {
    wati_json_response(['status' => false, 'message' => 'Invalid JSON'], 400);
}

$providerMessageId = wati_find_first($payload, [
    'id',
    'messageId',
    'message_id',
    'messageID',
    'localMessageId',
    'whatsappMessageId',
    'whatsapp_message_id',
    'waMessageId',
    'wamid',
    'wam_id',
    'provider_message_id',
    'campaignId',
    'campaign_id',
    'requestId',
    'request_id',
]);
$customerNumber = normalizePhone(wati_find_first($payload, [
    'waId',
    'wa_id',
    'whatsappNumber',
    'whatsapp_number',
    'phone',
    'mobile',
    'destination',
    'phoneNumber',
    'phone_number',
    'customer_number',
    'userPhone',
    'user_phone',
    'contact',
    'from',
    'sender',
]));
$eventType = strtolower(wati_clean_text(wati_find_first($payload, [
    'eventType',
    'event_type',
    'event',
    'type',
    'status',
    'statusString',
    'status_string',
    'messageStatus',
    'message_status',
    'deliveryStatus',
    'delivery_status',
]), 50));
$messageText = wati_clean_text(wati_find_first($payload, [
    'text',
    'message',
    'body',
    'messageText',
    'message_text',
    'buttonReply',
    'button_reply',
    'buttonText',
    'button_text',
    'buttonPayload',
    'button_payload',
    'listReply',
    'list_reply',
    'reply',
]), 2000);

function aisensy_collect_tag_names($value): array {
    $tags = [];
    $walk = function ($node, string $parentKey = '') use (&$walk, &$tags): void {
        if (!is_array($node)) {
            return;
        }
        foreach ($node as $key => $value) {
            $keyText = strtolower((string)$key);
            if (is_array($value)) {
                if (in_array($keyText, ['tag', 'tags'], true)) {
                    foreach ($value as $tagValue) {
                        if (is_array($tagValue)) {
                            foreach (['name', 'tagName', 'tag_name', 'label', 'value'] as $tagKey) {
                                if (isset($tagValue[$tagKey]) && !is_array($tagValue[$tagKey])) {
                                    $tag = wati_clean_text($tagValue[$tagKey], 120);
                                    if ($tag !== '') {
                                        $tags[] = $tag;
                                    }
                                }
                            }
                        } else {
                            $tag = wati_clean_text($tagValue, 120);
                            if ($tag !== '') {
                                $tags[] = $tag;
                            }
                        }
                    }
                }
                $walk($value, $keyText);
                continue;
            }
            if (strpos($keyText, 'tag') !== false || strpos($parentKey, 'tag') !== false) {
                $tag = wati_clean_text($value, 120);
                if ($tag !== '') {
                    $tags[] = $tag;
                }
            }
        }
    };
    $walk($value);
    return array_values(array_unique($tags));
}

function aisensy_is_whatsapp_ads_tag(string $tagName): bool {
    $normalized = strtolower(trim($tagName));
    $normalized = preg_replace('/\s+/', '_', (string)$normalized);
    return in_array($normalized, ['whatsapp_campagin', 'whatsapp_campaign'], true);
}

if ($eventType === '' && $messageText !== '') {
    $eventType = 'reply';
}

$statusAliases = [
    'message_sent' => 'sent',
    'messagesent' => 'sent',
    'send' => 'sent',
    'sent' => 'sent',
    'message_delivered' => 'delivered',
    'messagedelivered' => 'delivered',
    'delivered' => 'delivered',
    'delivery' => 'delivered',
    'message_read' => 'read',
    'messageread' => 'read',
    'read' => 'read',
    'seen' => 'read',
    'message_failed' => 'failed',
    'messagefailed' => 'failed',
    'failed' => 'failed',
    'failure' => 'failed',
    'undelivered' => 'failed',
    'reply' => 'reply',
    'message_received' => 'reply',
    'messagereceived' => 'reply',
    'incoming_message' => 'reply',
    'incomingmessage' => 'reply',
    'user_reply' => 'reply',
    'userreply' => 'reply',
];
$eventKey = preg_replace('/[^a-z0-9]+/', '_', $eventType);
$eventKey = trim((string)$eventKey, '_');
$normalizedStatus = $statusAliases[$eventKey] ?? $eventType;

$stmt = wati_db()->prepare("
    INSERT INTO wati_inbound_webhooks
        (provider_message_id, customer_number, event_type, message_text, raw_payload)
    VALUES (?, ?, ?, ?, ?)
");
$stmt->bind_param('sssss', $providerMessageId, $customerNumber, $eventType, $messageText, $rawPayload);
$stmt->execute();
$stmt->close();

$updatedMessages = 0;
$statusSet = [
    'sent' => true,
    'delivered' => true,
    'read' => true,
    'failed' => true,
];

if (isset($statusSet[$normalizedStatus])) {
    if ($providerMessageId !== '') {
        $stmt = wati_db()->prepare("
            UPDATE wati_message_logs
            SET send_status=?,
                delivered_at=CASE WHEN ?='delivered' THEN NOW() ELSE delivered_at END,
                read_at=CASE WHEN ?='read' THEN NOW() ELSE read_at END,
                failed_at=CASE WHEN ?='failed' THEN NOW() ELSE failed_at END
            WHERE provider_message_id=?
        ");
        $stmt->bind_param('sssss', $normalizedStatus, $normalizedStatus, $normalizedStatus, $normalizedStatus, $providerMessageId);
        $stmt->execute();
        $updatedMessages = $stmt->affected_rows;
        $stmt->close();
    } elseif ($customerNumber !== '') {
        $stmt = wati_db()->prepare("
            UPDATE wati_message_logs
            SET send_status=?,
                delivered_at=CASE WHEN ?='delivered' THEN NOW() ELSE delivered_at END,
                read_at=CASE WHEN ?='read' THEN NOW() ELSE read_at END,
                failed_at=CASE WHEN ?='failed' THEN NOW() ELSE failed_at END
            WHERE customer_number=?
            ORDER BY created_at DESC
            LIMIT 1
        ");
        $stmt->bind_param('sssss', $normalizedStatus, $normalizedStatus, $normalizedStatus, $normalizedStatus, $customerNumber);
        $stmt->execute();
        $updatedMessages = $stmt->affected_rows;
        $stmt->close();
    }
}

$replyAction = '';
if ($messageText !== '') {
    $replyAction = wati_reply_action($messageText);
    if ($replyAction !== '') {
        wati_create_reply_followup($customerNumber, $messageText, $replyAction);
    }
}

$whatsappAdsContact = false;
$matchedTagName = '';
$tagNames = aisensy_collect_tag_names($payload);
foreach ($tagNames as $tagName) {
    if (aisensy_is_whatsapp_ads_tag($tagName)) {
        $matchedTagName = wati_clean_text($tagName, 120);
        $whatsappAdsContact = true;
        break;
    }
}

if ($whatsappAdsContact && $customerNumber !== '') {
    $source = 'WhatsApp Ads';
    $stmt = wati_db()->prepare("
        INSERT INTO aisensy_tagged_contacts
            (customer_number, tag_name, source, raw_payload)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            source=VALUES(source),
            raw_payload=VALUES(raw_payload),
            last_seen_at=NOW()
    ");
    $stmt->bind_param('ssss', $customerNumber, $matchedTagName, $source, $rawPayload);
    $stmt->execute();
    $stmt->close();
}

wati_json_response([
    'status' => true,
    'event_type' => $eventType,
    'updated_messages' => $updatedMessages,
    'reply_action' => $replyAction,
    'whatsapp_ads_contact' => $whatsappAdsContact,
]);
