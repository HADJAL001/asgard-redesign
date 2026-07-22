const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const serverFile = path.join(dir, 'backend', 'src', 'server.ts');

console.log('Restoring server.ts from git HEAD...');

// Get original content from git
let original;
try {
  original = execSync('git show HEAD:backend/src/server.ts', {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
} catch(e) {
  console.error('git show failed:', e.message);
  process.exit(1);
}

// Apply our patches on top of the original
let content = original;

// 1. Add trial/promo migration imports after subscriptions import
if (!content.includes('runTrialMigration')) {
  content = content.replace(
    'import { runSubscriptionsMigration } from "./migrations/004_subscriptions"',
    'import { runSubscriptionsMigration } from "./migrations/004_subscriptions"\nimport { runTrialMigration } from "./migrations/042_trial"\nimport { runPromoCodesMigration } from "./migrations/043_promo_codes"'
  );
  console.log('+ Added trial/promo migration imports');
}

// 2. Call them after runSubscriptionsMigration()
if (!content.includes('runTrialMigration()')) {
  content = content.replace(
    'runSubscriptionsMigration()',
    'runSubscriptionsMigration()\nrunTrialMigration()\nrunPromoCodesMigration()'
  );
  console.log('+ Added runTrialMigration() + runPromoCodesMigration() calls');
}

// 3. Import promoRoutes
if (!content.includes('promo.routes')) {
  content = content.replace(
    'import orchestratorRoutes',
    'import promoRoutes from "./routes/promo.routes"\nimport orchestratorRoutes'
  );
  console.log('+ Added promoRoutes import');
}

// 4. Mount /promo
if (!content.includes('app.use("/promo"')) {
  content = content.replace(
    'app.use("/orchestrator", orchestratorRoutes)',
    'app.use("/orchestrator", orchestratorRoutes)\napp.use("/promo", promoRoutes)'
  );
  console.log('+ Mounted /promo route');
}

// Write with explicit UTF-8, no BOM
fs.writeFileSync(serverFile, content, { encoding: 'utf8' });
console.log('Done - server.ts restored and patched successfully');
console.log('Lines:', content.split('\n').length);
