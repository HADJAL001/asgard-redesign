const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backend', 'src', 'server.ts');
console.log('Patching:', file);

let c = fs.readFileSync(file, 'utf8');

if (!c.includes('runTrialMigration')) {
  c = c.replace(
    'import { runSubscriptionsMigration } from "./migrations/004_subscriptions"',
    'import { runSubscriptionsMigration } from "./migrations/004_subscriptions"\nimport { runTrialMigration } from "./migrations/042_trial"\nimport { runPromoCodesMigration } from "./migrations/043_promo_codes"'
  );
  console.log('+ Added trial/promo migration imports');
}

if (!c.includes('runTrialMigration()')) {
  c = c.replace(
    'runSubscriptionsMigration()',
    'runSubscriptionsMigration()\nrunTrialMigration()\nrunPromoCodesMigration()'
  );
  console.log('+ Added runTrialMigration() + runPromoCodesMigration() calls');
}

if (!c.includes('promo.routes')) {
  c = c.replace(
    'import orchestratorRoutes',
    'import promoRoutes from "./routes/promo.routes"\nimport orchestratorRoutes'
  );
  console.log('+ Added promoRoutes import');
}

if (!c.includes('app.use("/promo"')) {
  c = c.replace(
    'app.use("/orchestrator", orchestratorRoutes)',
    'app.use("/orchestrator", orchestratorRoutes)\napp.use("/promo", promoRoutes)'
  );
  console.log('+ Mounted /promo route');
}

fs.writeFileSync(file, c, 'utf8');
console.log('Done - server.ts patched successfully');
