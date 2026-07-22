$file = "a:\HADJAL\Рабочий стол\asgard-redesign\backend\src\server.ts"
$content = Get-Content $file -Raw
$old = "runSubscriptionsMigration()"
$new = "runSubscriptionsMigration()`r`n`r`n/* Гарантируем наличие trial_used в subscriptions и таблицы trial_history. */`r`nrunTrialMigration()"
$content = $content.Replace($old, $new)
Set-Content $file -Value $content -NoNewline -Encoding UTF8
Write-Host "Done"
