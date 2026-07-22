const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const backendDir = path.join(root, 'backend');

function run(cmd, opts = {}) {
  console.log('\n>', cmd);
  try {
    const r = execSync(cmd, {
      cwd: opts.cwd || root,
      encoding: 'utf8',
      timeout: opts.timeout || 120000,
      maxBuffer: 5 * 1024 * 1024
    });
    if (r) console.log(r.trim());
    return { ok: true, out: r };
  } catch(e) {
    const out = (e.stdout || '') + (e.stderr || '');
    console.log(out.trim() || e.message);
    return { ok: false, out };
  }
}

// 1. Verify server.ts is properly restored (check line count)
const serverTs = path.join(backendDir, 'src', 'server.ts');
const lines = fs.readFileSync(serverTs, 'utf8').split('\n').length;
console.log(`\nserver.ts: ${lines} lines`);
if (lines < 100) {
  console.error('ERROR: server.ts too short, running restore...');
  require('./restore_server.js');
}

// 2. Check promo routes are in server.ts
const content = fs.readFileSync(serverTs, 'utf8');
console.log('\nChecks:');
console.log('  runTrialMigration:', content.includes('runTrialMigration()') ? 'OK' : 'MISSING');
console.log('  runPromoCodesMigration:', content.includes('runPromoCodesMigration()') ? 'OK' : 'MISSING');
console.log('  promoRoutes import:', content.includes('promo.routes') ? 'OK' : 'MISSING');
console.log('  app.use("/promo"):', content.includes('app.use("/promo"') ? 'OK' : 'MISSING');

// 3. TypeScript check on backend
console.log('\n--- TypeScript backend check ---');
const tsc = run('npx tsc --noEmit 2>&1', { cwd: backendDir, timeout: 90000 });
if (tsc.ok || !tsc.out.includes('error TS')) {
  console.log('TypeScript: OK (no errors)');
} else {
  // Count errors
  const errors = (tsc.out.match(/error TS/g) || []).length;
  console.log(`TypeScript: ${errors} errors`);
  // Show first 5
  const lines2 = tsc.out.split('\n').filter(l => l.includes('error TS')).slice(0, 5);
  lines2.forEach(l => console.log(' ', l.trim()));
}

// 4. Git status
console.log('\n--- Git status ---');
run('git status --short');

// 5. Git add and commit
console.log('\n--- Staging files ---');
run('git add backend/src/migrations/043_promo_codes.ts');
run('git add backend/src/routes/promo.routes.ts');
run('git add backend/src/routes/orchestrator.routes.ts');
run('git add backend/src/lib/orchestratorQuota.ts');
run('git add backend/src/server.ts');
run('git add components/settings-view.tsx');
run('git add components/UpgradeNudgeModal.tsx');
run('git add components/project-create-wizard.tsx');

console.log('\n--- Commit ---');
const commitMsg = 'feat: promo codes, orchestrator free quota, upgrade nudge modal\n\n- Promo codes: migration 043, POST /promo/redeem (timecoin/trial_days/discount_pct),\n  admin routes /promo/create and /promo/list, settings UI with form + feedback\n- Orchestrator free quota: 5 runs/day for free users (removed requirePlan gate),\n  10/day for master/legend; /remaining returns isPaid flag\n- UpgradeNudgeModal: shows after 3 AI generations for free users (1x per session),\n  progress bar, 4 upgrade perks, trial CTA\n- project-create-wizard: trackGeneration() hook after AI generate\n- server.ts: runTrialMigration() + runPromoCodesMigration() + /promo route';
run(`git commit -m "${commitMsg.replace(/\n/g, ' ').replace(/"/g, "'")}"`);

// 6. Push
console.log('\n--- Push to origin ---');
const push = run('git push origin HEAD');
if (push.ok) {
  console.log('\nSUCCESS: Changes pushed to GitHub');
} else {
  console.log('\nPush failed — check output above');
}
