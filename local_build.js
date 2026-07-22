const {execSync} = require('child_process');
const path = require('path');
const root = __dirname;

console.log('=== Next.js TypeScript check ===');
try {
  const r = execSync('npx tsc --noEmit 2>&1', {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 5 * 1024 * 1024
  });
  console.log(r.trim() || 'TSC: OK (no errors)');
} catch(e) {
  const out = ((e.stdout||'') + (e.stderr||'')).trim();
  const errors = out.split('\n').filter(l => l.includes('error TS'));
  console.log(`TSC errors: ${errors.length}`);
  errors.slice(0, 15).forEach(l => console.log(' ', l.trim()));
}

console.log('\n=== Next.js build (next build) ===');
try {
  const r = execSync('npx next build 2>&1', {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });
  const lines = r.trim().split('\n');
  // Show last 50 lines
  console.log(lines.slice(-50).join('\n'));
} catch(e) {
  const out = ((e.stdout||'') + (e.stderr||'')).trim();
  console.log(out.slice(-4000));
}
