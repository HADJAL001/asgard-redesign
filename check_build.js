const {execSync} = require('child_process');
const path = require('path');

const root = __dirname;

function run(cmd, opts = {}) {
  console.log('\n>', cmd);
  try {
    const r = execSync(cmd, {
      cwd: opts.cwd || root,
      encoding: 'utf8',
      timeout: opts.timeout || 120000,
      maxBuffer: 10 * 1024 * 1024
    });
    if (r) console.log(r.trim().slice(-2000));
    return { ok: true, out: r };
  } catch(e) {
    const out = ((e.stdout || '') + (e.stderr || '')).trim();
    console.log(out.slice(-3000) || e.message);
    return { ok: false, out };
  }
}

// Check Vercel build logs via CLI
console.log('=== Checking latest Vercel deployment logs ===');
run('npx vercel inspect asgard-redesign-agk6gceug-osmanosmanov0099-8832s-projects.vercel.app 2>&1');
