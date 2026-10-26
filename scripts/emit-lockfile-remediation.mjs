import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// Read-only emitter: generates a precisely scoped reviewable JSON patch.
// The workflow never pushes or creates branches using GITHUB_TOKEN.
const files = [
  ['root', '/tmp/osgard-root-lock-before.json', 'package-lock.json'],
  ['backend', '/tmp/osgard-backend-lock-before.json', 'backend/package-lock.json'],
];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = (text) => createHash('sha256').update(text).digest('hex');
const patches = [];
for (const [area, baselinePath, editedPath] of files) {
  const beforeText = readFileSync(baselinePath, 'utf8');
  const afterText = readFileSync(editedPath, 'utf8');
  const before = JSON.parse(beforeText);
  const after = JSON.parse(afterText);
  if (before.lockfileVersion !== 3 || after.lockfileVersion !== 3) {
    throw new Error(`Unexpected lockfileVersion for ${area}`);
  }
  const changedTop = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'packages') continue;
    if (!equal(before[key], after[key])) {
      changedTop.push({ key, before: before[key] ?? null, after: after[key] ?? null });
    }
  }
  const changes = [];
  for (const name of new Set([
    ...Object.keys(before.packages || {}),
    ...Object.keys(after.packages || {}),
  ])) {
    if (!equal(before.packages[name], after.packages[name])) {
      changes.push({ name, before: before.packages[name] ?? null, after: after.packages[name] ?? null });
    }
  }
  patches.push({ area, oldSha256: sha(beforeText), newSha256: sha(afterText), changes, changedTop });
}
const report = {
  marker: 'OSGARD_NONBREAKING_LOCK_PATCH_V1',
  generatedAt: new Date().toISOString(),
  patches,
};
mkdirSync('artifacts/security', { recursive: true });
writeFileSync('artifacts/security/nonbreaking-lockfile-patch.json', JSON.stringify(report, null, 2) + '\n');
const summary = {
  rootChanged: patches[0].changes.length,
  backendChanged: patches[1].changes.length,
  changedTop: patches.map(p => p.changedTop.map(t => t.key)),
  auditFixExitCodes: {
    root: Number(process.env.ROOT_AUDIT_EXIT || -1),
    backend: Number(process.env.BACKEND_AUDIT_EXIT || -1),
  },
};
writeFileSync('artifacts/security/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log('OSGARD_SECURITY_SUMMARY ' + JSON.stringify(summary));
// Limited log-size chunks, no secrets. Only npm lockfile metadata.
const payload = JSON.stringify(report);
console.log('OSGARD_PATCH_BEGIN');
for (let i = 0; i < payload.length; i += 2200) {
  console.log('OSGARD_PATCH_CHUNK ' + payload.slice(i, i + 2200));
}
console.log('OSGARD_PATCH_END');