<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

wati_require_secret(WATI_DIALER_SECRET, 'dialer secret');
wati_ensure_tables();

wati_json_response([
    'status' => true,
    'message' => 'WATI integration tables are ready',
]);
