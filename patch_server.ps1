$file = "a:\HADJAL\Рабочий стол\asgard-redesign\backend\src\server.ts"
$content = Get-Content $file -Raw -Encoding UTF8

# 1. import runTrialMigration + runPromoCodesMigration
if ($content -notmatch 'runTrialMigration') {
  $old1 = 'import { runSubscriptionsMigration } from "./migrations/004_subscriptions"'
  $new1 = 'import { runSubscriptionsMigration } from "./migrations/004_subscriptions"' + "`nimport { runTrialMigration } from " + '"./migrations/042_trial"' + "`nimport { runPromoCodesMigration } from " + '"./migrations/043_promo_codes"'
  $content = $content.Replace($old1, $new1)
}

# 2. call runTrialMigration() + runPromoCodesMigration() after runSubscriptionsMigration()
if ($content -notmatch 'runTrialMigration\(\)') {
  $content = $content.Replace('runSubscriptionsMigration()', "runSubscriptionsMigration()`nrunTrialMigration()`nrunPromoCodesMigration()")
}

# 3. import promoRoutes before orchestratorRoutes
if ($content -notmatch 'promo\.routes') {
  $content = $content.Replace(
    'import orchestratorRoutes',
    'import promoRoutes from "./routes/promo.routes"' + "`nimport orchestratorRoutes"
  )
}

# 4. mount /promo after /orchestrator
if ($content -notmatch 'app\.use\("/promo"') {
  $content = $content.Replace(
    'app.use("/orchestrator", orchestratorRoutes)',
    'app.use("/orchestrator", orchestratorRoutes)' + "`napp.use(" + '"/promo", promoRoutes)'
  )
}

Set-Content -Path $file -Value $content -NoNewline -Encoding UTF8
Write-Host "Done - server.ts patched"
