<?php
declare(strict_types=1);
require_once __DIR__ . '/../public/integrations/wati/send_wati_message.php';

$cases = [
    ['accepted', ['http_code' => 200, 'response' => '{"status":true}'], ''],
    ['accepted without status', ['http_code' => 202, 'response' => '{}'], ''],
    ['provider plan rejection', ['http_code' => 400, 'response' => '{"errorCode":400,"errorMessage":"No Plan active on assistant!"}'], 'No Plan active on assistant!'],
    ['provider business error on HTTP 200', ['http_code' => 200, 'response' => '{"errorCode":400,"errorMessage":"Rejected"}'], 'Rejected'],
    ['explicit failure', ['http_code' => 200, 'response' => '{"status":false,"message":"Rejected"}'], 'Rejected'],
    ['WATI explicit failure', ['http_code' => 200, 'response' => '{"result":false,"message":"Rejected"}'], 'Rejected'],
    ['transport failure', ['http_code' => 0, 'error' => 'Connection timed out'], 'Connection timed out'],
    ['non-JSON gateway error', ['http_code' => 502, 'response' => '<html>Error</html>'], 'WhatsApp provider rejected the request (HTTP 502)'],
];
foreach ($cases as [$name, $input, $expected]) {
    if (wati_send_result_error($input) !== $expected) {
        fwrite(STDERR, "FAIL $name\n");
        exit(1);
    }
    echo "PASS $name\n";
}
echo count($cases) . " checks passed; no messages sent.\n";
