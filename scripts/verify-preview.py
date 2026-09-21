"""Check only read-only production routes; restart/crash ONLY the isolated preview."""
import datetime
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNIT = 'attica-api-next-preview.service'

def request(port, path, method='GET', payload=None):
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + path, method=method, data=payload,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.load(response), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error), dict(error.headers)

def service(unit):
    return subprocess.check_output(['systemctl', 'show', unit, '-p', 'MainPID', '-p', 'ActiveState', '-p', 'ActiveEnterTimestamp'], text=True)

def pid():
    return subprocess.check_output(['systemctl', 'show', UNIT, '-p', 'MainPID', '--value'], text=True).strip()

def wait_healthy(previous_pid):
    for _ in range(60):
        time.sleep(.25)
        try:
            if pid() not in ['0', previous_pid] and request(3101, '/health')[0] == 200:
                return pid()
        except (OSError, urllib.error.URLError):
            pass
    raise AssertionError('Preview did not recover')

production_before = service('attica-api.service')
paths = ['/api/branches', '/api/branches?page=2&limit=1&state=nonexistent&sort=name',
         '/api/branches/autocomplete?q=Ban', '/api/branches/autocomplete?q=zzzz-no-match',
         '/api/branches/search-nearby?lat=12.97&lng=77.59',
         '/api/branches/search-nearby?lat=0&lng=0', '/api/branches/search-nearby']
parity = []
for path in paths:
    live, candidate = request(3001, path), request(3101, path)
    assert live[:2] == candidate[:2], path + ' mismatched'
    parity.append({'path': path, 'status': candidate[0], 'matchedProduction': True,
                   'records': len(candidate[1]) if isinstance(candidate[1], list) else None})
for method in ['POST', 'PUT', 'DELETE']:
    assert request(3101, '/api/branches', method, b'{}')[0] == 405
before = pid()
subprocess.run(['systemctl', 'restart', UNIT], check=True)
after_clean = wait_healthy(before)
subprocess.run(['systemctl', 'kill', '--signal=SIGKILL', UNIT], check=True)
after_crash = wait_healthy(after_clean)
assert request(3101, '/api/branches/search-nearby')[0] == 400
logs = subprocess.check_output(['journalctl', '-u', UNIT, '--since', '10 minutes ago', '--no-pager', '-o', 'cat'], text=True)
events = []
for line in logs.splitlines():
    try:
        events.append(json.loads(line))
    except ValueError:
        pass
assert any(e.get('event') == 'request' and e.get('port') == 3101 and e.get('status') == 200 for e in events)
assert any(e.get('event') == 'request_error' and e.get('port') == 3101 for e in events)
manifest = json.loads((ROOT / 'docs/BASELINE.json').read_text())
unchanged = {name: hashlib.sha256((Path('/root/attica-api') / name).read_bytes()).hexdigest() == digest
             for name, digest in manifest['files'].items()}
assert all(unchanged.values())
assert service('attica-api.service') == production_before
# Inspect deployed assets, not just repository source. Return paths only.
scan = subprocess.run(['rg', '-l', r'(:3101|attica-api-next)', '/var/www/html',
                       '--glob', '*.js', '--glob', '*.html', '--glob', '*.json', '--glob', '!*.map'],
                      text=True, capture_output=True)
assert scan.returncode == 1, 'A deployed asset references the preview, or scanning failed'
proxy = subprocess.check_output(['rg', 'ProxyPass', '/etc/apache2/sites-enabled'], text=True)
assert ':3101' not in proxy and '127.0.0.1:3001/api' in proxy
proof = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'productionParity': parity,
         'previewWritesHTTP': 405, 'cleanRestart': {'before': before, 'after': after_clean},
         'automaticRecovery': {'afterCrash': after_crash}, 'requestLogging': True, 'errorLogging': True,
         'productionFilesUnchanged': unchanged, 'productionServiceUnchanged': True,
         'deployedFrontendPreviewReferences': 0, 'productionProxyPort': 3001, 'productionDeployment': False}
(ROOT / 'docs/REVIEW-VERIFICATION.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof, indent=2))
