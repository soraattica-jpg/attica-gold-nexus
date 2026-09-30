import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = process.argv[2];
const output = resolve(process.argv[3] || `${root}telephony/generated`);
if (!configPath) throw new Error('Usage: node scripts/render-telephony.mjs /path/to/private-bindings.json [output-directory]');
if (output === '/etc/asterisk' || output.startsWith('/etc/asterisk/')) throw new Error('Render into a separate directory for review.');
const bindings = JSON.parse(readFileSync(resolve(configPath), 'utf8'));
const rendered = [];
for (const name of readdirSync(`${root}telephony/asterisk`).sort()) {
  if (!name.endsWith('.template')) continue;
  const source = readFileSync(`${root}telephony/asterisk/${name}`, 'utf8');
  const content = source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    const value = bindings[key] ?? process.env[key];
    if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new Error(`Missing or invalid setting: ${key}`);
    return value;
  });
  rendered.push([name.slice(0, -'.template'.length), content]);
}
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const [name, content] of rendered) writeFileSync(resolve(output, name), content, { mode: 0o600, flag: 'wx' });
console.log(`Rendered ${rendered.length} configuration files to ${output}.`);
