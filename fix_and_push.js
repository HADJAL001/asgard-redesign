const {execSync} = require('child_process');
const path = require('path');
const root = __dirname;

function run(cmd, opts = {}) {
  console.log('\n>', cmd);
  try {
    const r = execSync(cmd, {
      cwd: opts.cwd || root,
      encoding: 'utf8',
      timeout: opts.timeout || 60000,
      maxBuffer: 5 * 1024 * 1024
    });
    if (r) console.log(r.trim().slice(-1000));
    return { ok: true, out: r };
  } catch(e) {
    const out = ((e.stdout||'') + (e.stderr||'')).trim();
    console.log(out.slice(-1000) || e.message);
    return { ok: false, out };
  }
}

// Stage fixed files
run('git add app/orchestrator/[id]/page.tsx');
run('git add app/layout.tsx');
run('git add package.json');
run('git add package-lock.json');

// Commit
run('git commit -m "fix: build errors - ssr:false client comp, react-is dep, google fonts preload"');

// Push
console.log('\n--- Pushing ---');
const push = run('git push origin HEAD', { timeout: 60000 });
if (push.ok) {
  console.log('\nSUCCESS: Fix pushed to GitHub');
} else {
  console.log('\nPush result:', push.out.slice(-500));
}

// Show latest commits
run('git log --oneline -4');
