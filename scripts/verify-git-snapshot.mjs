import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 10 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
const secretArg = process.argv.indexOf('--secrets-file');
const knownSecrets = secretArg >= 0 ? Object.values(JSON.parse(readFileSync(process.argv[secretArg + 1], 'utf8'))).filter(value => typeof value === 'string' && value.length >= 8) : [];
const violations = [];
const blockedPaths = /(?:^|\/)(?:node_modules|\.git|\.private|private|dist|runtime|backups)(?:\/|$)|(?:\.bak|\.backup)(?:[.-]|$)|(?:^|\/)\.env(?!\.example$)|config\.local\.php$|(?:^|\/)\.tmp|service-account.*\.json$|\.(?:pem|key)$/;
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub access token', /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/],
  ['Meta access token', /EAA[A-Za-z0-9]{50,}/],
  ['URL with password', /https?:\/\/[^\s/@]+:[^\s/@]+@/],
];
for (const file of new Set(files)) {
  if (blockedPaths.test(file)) violations.push(`${file}: private or generated file`);
  const location = root + file;
  let stat;
  try { stat = lstatSync(location); } catch { continue; }
  if (stat.isSymbolicLink()) { violations.push(`${file}: symbolic link`); continue; }
  const buffer = readFileSync(location);
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');
  for (const [label, pattern] of patterns) if (pattern.test(content)) violations.push(`${file}: ${label}`);
  for (const secret of new Set(knownSecrets)) if (content.includes(secret)) { violations.push(`${file}: captured credential still present`); break; }
}
for (const file of ['src/App.tsx', 'backend/production/server.js', 'backend/modular/server.js', 'backend/modular/baseline/server.js', 'backend/reporting/server.js', 'database/schema.sql', 'telephony/asterisk/extensions.conf.template', 'docs/PROJECT-STRUCTURE.md', 'docs/TIMELINE.md']) {
  if (!files.includes(file)) violations.push(`${file}: missing from the Git snapshot`);
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log(`Git snapshot verified: ${new Set(files).size} files; ${new Set(knownSecrets).size} captured credential values checked.`);
