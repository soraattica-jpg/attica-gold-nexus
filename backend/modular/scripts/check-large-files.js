import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const sourceExtensions = new Set(['.js', '.ts', '.tsx', '.jsx']);
const ignored = new Set(['.git', 'node_modules', '.private', 'coverage', 'baseline', 'runtime']);
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'MONOLITH-BASELINE.json'), 'utf8'));
const issues = [];

function lineCount(file) {
  const content = fs.readFileSync(file, 'utf8');
  return content ? content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0) : 0;
}

function threshold(relativePath) {
  if (/\.routes\.[jt]sx?$/.test(relativePath)) return 300;
  if (/\.controller\.[jt]sx?$/.test(relativePath)) return 500;
  if (/\.service\.[jt]sx?$/.test(relativePath)) return 800;
  if (/\.repository\.[jt]sx?$/.test(relativePath)) return 700;
  if (/integrations\//.test(relativePath)) return 800;
  if (/\.(tsx|jsx)$/.test(relativePath)) return 1000;
  return 1500;
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const files = walk(root).map((file) => ({ file, relative: path.relative(root, file), lines: lineCount(file) }));
for (const item of files) {
  const limit = threshold(item.relative);
  if (item.lines > limit) issues.push(`${item.relative}: ${item.lines} lines exceeds review threshold ${limit}`);
}

const legacyPath = process.env.ATTICA_LEGACY_SERVER_PATH || baseline.legacyProductionServer.path;
if (fs.existsSync(legacyPath)) {
  const lines = lineCount(legacyPath);
  const allowed = baseline.legacyProductionServer.lines + baseline.legacyProductionServer.warningGrowthLines;
  if (lines > allowed) issues.push(`legacy server.js: ${lines} lines exceeds baseline allowance ${allowed}`);
  console.log(`Legacy server.js: ${lines} lines (baseline ${baseline.legacyProductionServer.lines})`);
} else console.log(`Legacy server.js was not checked: ${legacyPath} is unavailable.`);

const entrypoint = path.join(root, baseline.candidateEntrypoint.path);
if (fs.existsSync(entrypoint)) {
  const lines = lineCount(entrypoint);
  const allowed = baseline.candidateEntrypoint.lines + baseline.candidateEntrypoint.warningGrowthLines;
  if (lines > allowed) issues.push(`candidate server.js: ${lines} lines exceeds baseline allowance ${allowed}`);
  console.log(`Candidate server.js: ${lines} lines (baseline ${baseline.candidateEntrypoint.lines})`);
}

console.log('Largest source files:');
for (const item of [...files].sort((left, right) => right.lines - left.lines).slice(0, 15)) console.log(`  ${item.lines}\t${item.relative}`);

if (issues.length) {
  console.warn('Large-file review warnings:');
  for (const issue of issues) console.warn(`  ${issue}`);
  if (strict) process.exitCode = 1;
} else console.log('Large-file review: no threshold warnings.');
