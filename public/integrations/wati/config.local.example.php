<?php
declare(strict_types=1);

// Copy this file to config.local.php on the server and fill WATI account values.
// config.local.php is gitignored.
return [
    'WATI_BASE_URL' => 'https://your-wati-host',
    'WATI_API_TOKEN' => 'YOUR_WATI_TOKEN',
    'WATI_WEBHOOK_SECRET' => 'CHANGE_ME_WEBHOOK_SECRET',
    'WATI_DIALER_SECRET' => 'CHANGE_ME_DIALER_SECRET',
    'WATI_ALLOW_UNSECURED_ENDPOINTS' => '0',
    'WATI_SEND_ENDPOINT' => '/api/v1/sendTemplateMessage',
    'WATI_CALLBACK_NUMBER' => '8880300300',
];
