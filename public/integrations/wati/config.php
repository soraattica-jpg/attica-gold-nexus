<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Kolkata');

function wati_env(string $key, string $default = ''): string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }
    return trim((string)$value);
}

$WATI_LOCAL_CONFIG = [];
$externalConfigPath = '/etc/attica/wati.config.php';
if (is_file($externalConfigPath)) {
    $loadedExternalConfig = require $externalConfigPath;
    if (is_array($loadedExternalConfig)) {
        $WATI_LOCAL_CONFIG = $loadedExternalConfig;
    }
}
$localConfigPath = __DIR__ . '/config.local.php';
if (is_file($localConfigPath)) {
    $loadedLocalConfig = require $localConfigPath;
    if (is_array($loadedLocalConfig)) {
        $WATI_LOCAL_CONFIG = array_merge($WATI_LOCAL_CONFIG, $loadedLocalConfig);
    }
}

function wati_config_value(string $key, string $default = ''): string {
    global $WATI_LOCAL_CONFIG;
    if (array_key_exists($key, $WATI_LOCAL_CONFIG)) {
        return trim((string)$WATI_LOCAL_CONFIG[$key]);
    }
    return wati_env($key, $default);
}

define('WATI_BASE_URL', rtrim(wati_config_value('WATI_BASE_URL'), '/'));
define('WATI_API_TOKEN', wati_config_value('WATI_API_TOKEN'));
define('WATI_SEND_ENDPOINT', wati_config_value('WATI_SEND_ENDPOINT', '/api/v1/sendTemplateMessage'));
define('WATI_AUTH_HEADER', wati_config_value('WATI_AUTH_HEADER', 'Authorization'));
define('WATI_AUTH_PREFIX', wati_config_value('WATI_AUTH_PREFIX', 'Bearer '));
define('WATI_WEBHOOK_SECRET', wati_config_value('WATI_WEBHOOK_SECRET'));
define('WATI_DIALER_SECRET', wati_config_value('WATI_DIALER_SECRET'));
define('WATI_ALLOW_UNSECURED_ENDPOINTS', wati_config_value('WATI_ALLOW_UNSECURED_ENDPOINTS', '0'));
define('WATI_CALLBACK_NUMBER', wati_config_value('WATI_CALLBACK_NUMBER', '8880300300'));
define('WATI_TEMPLATE_LANGUAGE', wati_config_value('WATI_TEMPLATE_LANGUAGE', 'en_US'));
define('WATI_CONNECT_TIMEOUT', (int)wati_config_value('WATI_CONNECT_TIMEOUT', '8'));
define('WATI_REQUEST_TIMEOUT', (int)wati_config_value('WATI_REQUEST_TIMEOUT', '30'));

define('WHATSAPP_PROVIDER', strtolower(wati_config_value('WHATSAPP_PROVIDER', 'wati')));
define('AISENSY_API_URL', rtrim(wati_config_value('AISENSY_API_URL', 'https://backend.aisensy.com/campaign/t1/api/v2'), '/'));
define('AISENSY_API_KEY', wati_config_value('AISENSY_API_KEY'));
define('AISENSY_DEFAULT_SOURCE', wati_config_value('AISENSY_DEFAULT_SOURCE', 'Attica Call Center'));
define('AISENSY_CALLBACK_NUMBER', wati_config_value('AISENSY_CALLBACK_NUMBER', WATI_CALLBACK_NUMBER));
define('AISENSY_TEMPLATE_PARAM_ORDER', wati_config_value('AISENSY_TEMPLATE_PARAM_ORDER', ''));
define('AISENSY_WEBHOOK_SECRET', wati_config_value('AISENSY_WEBHOOK_SECRET', WATI_WEBHOOK_SECRET));

define('ATTICA_DB_HOST', wati_config_value('ATTICA_DB_HOST', 'localhost'));
define('ATTICA_DB_NAME', wati_config_value('ATTICA_DB_NAME', 'asterisk'));
define('ATTICA_DB_USER', wati_config_value('ATTICA_DB_USER', 'custom'));
define('ATTICA_DB_PASS', wati_config_value('ATTICA_DB_PASS', (getenv("ATTICA_DB_PASSWORD") ?: "")));

$WATI_EVENT_MAP = [
    'MISSED' => 'missed_call_notification',
    'RNR' => 'rnr_no_respons',
    'CALL_FAILED' => 'call_failed_callbackk',
    'DIS' => 'customer_disconnecte',
    'LB' => 'customer_busyy',
    'SWITCHED_OFF' => 'phone_switched_of',
    'AUDIO_CUSTOMER_NOT_HEARD' => 'unable_to_hear_customerr',
    'AUDIO_CC_NOT_HEARD' => 'customer_unable_to_hearr',
];
