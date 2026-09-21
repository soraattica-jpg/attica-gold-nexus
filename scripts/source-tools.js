import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const branchPaths = new Set(['/api/branches', '/api/branches/:id', '/api/branches/search-nearby', '/api/branches/autocomplete']);
export function parseSource(source) {
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
}
export function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visitor));
    else if (value && typeof value === 'object') walk(value, visitor);
  }
}
export function routeCall(node) {
  return node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
    && ['app', 'router'].includes(node.callee.object.name)
    && ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'].includes(node.callee.property.name)
    && node.arguments.length > 1;
}
export function readBaseline(name = 'server.js') {
  const manifest = JSON.parse(readFileSync(projectRoot + 'docs/BASELINE.json', 'utf8'));
  const source = readFileSync(projectRoot + 'baseline/' + name, 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  if (hash !== manifest.files[name]) throw new Error('Baseline hash mismatch: ' + name);
  return source;
}
