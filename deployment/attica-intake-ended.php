#!/usr/bin/php
<?php
// Local AGI only: a durable handoff, with no network/database work in hangup.
while (($line = fgets(STDIN)) !== false && trim($line) !== '') {}
$uniqueId = $argv[1] ?? '';
$sipCallId = $argv[2] ?? '';
$extension = $argv[3] ?? '';
$epoch = $argv[4] ?? '';
$direction = strtolower(trim($argv[5] ?? ''));
$callSource = trim($argv[6] ?? '');
$carrierTrunk = strtoupper(trim($argv[7] ?? ''));
$trunkCode = strtoupper(trim($argv[8] ?? ''));
$pilot = preg_replace('/\D/', '', $argv[9] ?? '');
$didOrCli = preg_replace('/\D/', '', $argv[10] ?? '');
if (!preg_match('/^[0-9.]{1,80}$/D', $uniqueId)
    || !preg_match('/^[\x21-\x7e]{1,255}$/D', $sipCallId)
    || !preg_match('/^20\d{2}$/D', $extension)
    || !ctype_digit($epoch)
    || ($direction !== '' && !in_array($direction, ['incoming', 'outgoing'], true))
    || strlen($callSource) > 100
    || ($carrierTrunk !== '' && !preg_match('/^[A-Z0-9_]{1,50}$/D', $carrierTrunk))
    || ($trunkCode !== '' && !preg_match('/^[A-Z0-9_]{1,50}$/D', $trunkCode))
    || strlen($pilot) > 30
    || strlen($didOrCli) > 30) exit(1);
$directory = '/var/spool/asterisk/attica-intake-events';
$path = $directory . '/' . $uniqueId . '.json';
if (is_file($path)) exit(0);
$tmp = tempnam($directory, '.pending-');
if ($tmp === false) exit(1);
chmod($tmp, 0600);
$payload = json_encode(['uniqueId'=>$uniqueId,'sipCallId'=>$sipCallId,'extension'=>$extension,
    'endedAt'=>(int)round(microtime(true)*1000),'direction'=>$direction,'callSource'=>$callSource,
    'carrierTrunk'=>$carrierTrunk,'trunkCode'=>$trunkCode,'pilot'=>$pilot,'didOrCli'=>$didOrCli]);
$handle = fopen($tmp, 'wb');
if (!$handle || fwrite($handle, $payload) !== strlen($payload)) exit(1);
fflush($handle);
if (function_exists('fsync')) fsync($handle);
fclose($handle);
if (!rename($tmp, $path)) exit(1);
