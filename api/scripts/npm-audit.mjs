/*
 * `npm audit` that fails on high and critical advisories, except the ones
 * reviewed below. npm has no way to ignore an advisory, and lowering the
 * audit level would hide new ones too. Runs in the current folder, so CI uses
 * it for the API and for the admin app (.github/workflows/ci.yml):
 *
 *   node scripts/npm-audit.mjs --omit=dev      (extra arguments go to npm audit)
 *
 * An entry stays only while the advisory can't reach us. When npm no longer
 * reports it (a fixed version landed), the script says so: delete the entry
 * once both the API and the admin app are clear of it.
 */
import { spawnSync } from 'node:child_process';

/** Advisory ID → why it doesn't affect this project. */
const REVIEWED = {
  // No fixed picomatch yet. Only glob patterns written by us reach it: the
  // entity and migration paths TypeORM globs once at startup, and the build
  // tools of the admin app (vite, vitest), which never reach the bundle.
  'GHSA-fc5q-39xc-vjpf':
    'picomatch ReDoS through crafted glob patterns; no pattern comes from a user',
};

const FAILING = new Set(['high', 'critical']);

const npm = spawnSync('npm', ['audit', '--json', ...process.argv.slice(2)], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
// npm exits 1 when it finds anything; the report is on stdout either way.
let report;
try {
  report = JSON.parse(npm.stdout);
} catch {
  report = undefined;
}
if (!report?.vulnerabilities) {
  console.error(npm.stderr || npm.stdout || 'npm audit printed no report');
  process.exit(2);
}

// Each advisory sits in `via` of the package it names; other `via` entries
// are plain names of vulnerable dependencies.
const advisories = new Map();
for (const { via } of Object.values(report.vulnerabilities)) {
  for (const entry of via) {
    if (typeof entry === 'object' && FAILING.has(entry.severity)) {
      const id = entry.url.split('/').pop();
      advisories.set(
        id,
        `${entry.severity}: ${entry.name} ${entry.range}, ${entry.title} (${entry.url})`,
      );
    }
  }
}

let failed = false;
for (const [id, line] of advisories) {
  if (REVIEWED[id]) {
    console.log(`Ignored, reviewed: ${line}\n  ${REVIEWED[id]}`);
  } else {
    console.error(`Vulnerable, ${line}`);
    failed = true;
  }
}
for (const id of Object.keys(REVIEWED)) {
  if (!advisories.has(id)) {
    console.log(
      `${id} isn't reported here: once neither audit reports it, remove it from scripts/npm-audit.mjs`,
    );
  }
}
if (!failed) console.log('No unreviewed high or critical advisories.');
process.exit(failed ? 1 : 0);
