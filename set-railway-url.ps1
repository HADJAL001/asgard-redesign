# Запусти этот скрипт после того как получишь Railway URL бэкенда
# Использование: .\set-railway-url.ps1 https://твой-url.up.railway.app

param(
    [Parameter(Mandatory=$true)]
    [string]$RailwayUrl
)

Write-Host "Устанавливаю BACKEND_URL = $RailwayUrl" -ForegroundColor Cyan

# Устанавливаем BACKEND_URL в Vercel для production
echo $RailwayUrl | npx vercel env add BACKEND_URL production --force

# Деплоим с новой переменной
Write-Host "Деплоим на Vercel..." -ForegroundColor Cyan
npx vercel --prod --yes

Write-Host "Готово! Проверяем регистрацию..." -ForegroundColor Green
Start-Process "https://asgard-redesign.vercel.app/register"
