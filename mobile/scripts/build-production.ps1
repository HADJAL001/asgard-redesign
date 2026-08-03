# OSGARD Production Build Script (Windows PowerShell)
# Волна Ядро-8: Финальная сборка для Google Play и App Store

param(
    [Parameter(Position=0)]
    [ValidateSet("all", "android", "ios", "submit", "check", "help")]
    [string]$Command = "all"
)

$ErrorActionPreference = "Stop"

# Директории
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MobileDir = Split-Path -Parent $ScriptDir
$GardCoreDir = Join-Path (Split-Path -Parent (Split-Path -Parent $MobileDir)) "gard-core"
$CredentialsDir = Join-Path $MobileDir "credentials"

function Write-Header {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║           OSGARD Production Build Script                   ║" -ForegroundColor Blue
    Write-Host "║                    Волна Ядро-8                            ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""
}

function Check-Dependencies {
    Write-Host "[1/6] Проверка зависимостей..." -ForegroundColor Yellow
    
    # Node.js
    try {
        $nodeVersion = node -v
        Write-Host "✓ Node.js $nodeVersion" -ForegroundColor Green
    } catch {
        Write-Host "❌ Node.js не установлен" -ForegroundColor Red
        exit 1
    }
    
    # npm
    try {
        $npmVersion = npm -v
        Write-Host "✓ npm $npmVersion" -ForegroundColor Green
    } catch {
        Write-Host "❌ npm не установлен" -ForegroundColor Red
        exit 1
    }
    
    # EAS CLI
    try {
        $easVersion = eas --version
        Write-Host "✓ EAS CLI $easVersion" -ForegroundColor Green
    } catch {
        Write-Host "⚠ EAS CLI не установлен, устанавливаю..." -ForegroundColor Yellow
        npm install -g eas-cli
        $easVersion = eas --version
        Write-Host "✓ EAS CLI $easVersion" -ForegroundColor Green
    }
    
    # Go (для сборки GardCore)
    try {
        $goVersion = go version
        Write-Host "✓ $goVersion" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Go не установлен (нужен для сборки GardCore.aar)" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

function Check-Credentials {
    Write-Host "[2/6] Проверка credentials..." -ForegroundColor Yellow
    
    if (-not (Test-Path $CredentialsDir)) {
        Write-Host "⚠ Создаю директорию credentials..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $CredentialsDir -Force | Out-Null
    }
    
    # Google Play Service Account
    $googleKeyPath = Join-Path $CredentialsDir "google-play-service-account.json"
    if (-not (Test-Path $googleKeyPath)) {
        Write-Host "⚠ google-play-service-account.json не найден" -ForegroundColor Yellow
        Write-Host "   Скачайте из Google Play Console → Setup → API access"
        Write-Host "   и поместите в $CredentialsDir\"
    } else {
        Write-Host "✓ Google Play Service Account" -ForegroundColor Green
    }
    
    # Проверка EAS login
    try {
        $easUser = eas whoami 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ EAS авторизация: $easUser" -ForegroundColor Green
        } else {
            Write-Host "⚠ Не авторизован в EAS. Выполните: eas login" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠ Не авторизован в EAS. Выполните: eas login" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

function Build-GardCore {
    Write-Host "[3/6] Сборка GardCore..." -ForegroundColor Yellow
    
    if (-not (Test-Path $GardCoreDir)) {
        Write-Host "❌ Директория gard-core не найдена: $GardCoreDir" -ForegroundColor Red
        exit 1
    }
    
    Push-Location $GardCoreDir
    
    $aarPath = Join-Path $GardCoreDir "build\GardCore.aar"
    
    if (Test-Path $aarPath) {
        Write-Host "✓ GardCore.aar уже собран" -ForegroundColor Green
    } else {
        try {
            $goExists = Get-Command go -ErrorAction SilentlyContinue
            $gomobileExists = Get-Command gomobile -ErrorAction SilentlyContinue
            
            if ($goExists -and $gomobileExists) {
                Write-Host "Сборка GardCore.aar..." -ForegroundColor Blue
                & .\scripts\build-windows.ps1 android
                Write-Host "✓ GardCore.aar собран" -ForegroundColor Green
            } else {
                Write-Host "⚠ gomobile не установлен, пропускаю сборку GardCore" -ForegroundColor Yellow
                Write-Host "   Установите: go install golang.org/x/mobile/cmd/gomobile@latest"
            }
        } catch {
            Write-Host "⚠ Ошибка сборки GardCore: $_" -ForegroundColor Yellow
        }
    }
    
    # Копирование в модуль
    if (Test-Path $aarPath) {
        $destPath = Join-Path $MobileDir "modules\gard-core\android\libs\GardCore.aar"
        Copy-Item $aarPath $destPath -Force
        Write-Host "✓ GardCore.aar скопирован в модуль" -ForegroundColor Green
    }
    
    Pop-Location
    Write-Host ""
}

function Install-Dependencies {
    Write-Host "[4/6] Установка зависимостей..." -ForegroundColor Yellow
    
    Push-Location $MobileDir
    
    $nodeModulesPath = Join-Path $MobileDir "node_modules"
    if (-not (Test-Path $nodeModulesPath)) {
        Write-Host "Установка npm пакетов..." -ForegroundColor Blue
        npm install
    } else {
        Write-Host "✓ Зависимости уже установлены" -ForegroundColor Green
    }
    
    Pop-Location
    Write-Host ""
}

function Build-Android {
    Write-Host "[5/6] Сборка Android (Production)..." -ForegroundColor Yellow
    
    Push-Location $MobileDir
    
    Write-Host "Запуск EAS Build для Android..." -ForegroundColor Blue
    Write-Host "Профиль: production"
    Write-Host "Тип: app-bundle (.aab)"
    Write-Host ""
    
    eas build --profile production --platform android --non-interactive
    
    Write-Host "✓ Android build завершён" -ForegroundColor Green
    
    Pop-Location
    Write-Host ""
}

function Build-iOS {
    Write-Host "[6/6] Сборка iOS (Production)..." -ForegroundColor Yellow
    
    Push-Location $MobileDir
    
    Write-Host "Запуск EAS Build для iOS..." -ForegroundColor Blue
    Write-Host "Профиль: production"
    Write-Host "Тип: archive (.ipa)"
    Write-Host ""
    
    eas build --profile production --platform ios --non-interactive
    
    Write-Host "✓ iOS build завершён" -ForegroundColor Green
    
    Pop-Location
    Write-Host ""
}

function Submit-ToStores {
    Write-Host "Отправка в сторы..." -ForegroundColor Yellow
    
    Push-Location $MobileDir
    
    $androidConfirm = Read-Host "Отправить Android в Google Play? (y/n)"
    if ($androidConfirm -eq "y" -or $androidConfirm -eq "Y") {
        Write-Host "Отправка в Google Play (internal track)..." -ForegroundColor Blue
        eas submit --platform android --profile production
        Write-Host "✓ Отправлено в Google Play" -ForegroundColor Green
    }
    
    $iosConfirm = Read-Host "Отправить iOS в App Store? (y/n)"
    if ($iosConfirm -eq "y" -or $iosConfirm -eq "Y") {
        Write-Host "Отправка в App Store Connect..." -ForegroundColor Blue
        eas submit --platform ios --profile production
        Write-Host "✓ Отправлено в App Store Connect" -ForegroundColor Green
    }
    
    Pop-Location
    Write-Host ""
}

function Show-Help {
    Write-Host "Использование: .\build-production.ps1 [команда]"
    Write-Host ""
    Write-Host "Команды:"
    Write-Host "  all       - Полная сборка (Android + iOS)"
    Write-Host "  android   - Только Android"
    Write-Host "  ios       - Только iOS"
    Write-Host "  submit    - Отправить в сторы"
    Write-Host "  check     - Проверить зависимости"
    Write-Host "  help      - Показать справку"
    Write-Host ""
    Write-Host "Примеры:"
    Write-Host "  .\build-production.ps1 all        # Собрать для обеих платформ"
    Write-Host "  .\build-production.ps1 android    # Собрать только Android"
    Write-Host "  .\build-production.ps1 submit     # Отправить последние билды в сторы"
}

function Show-Success {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║              Production Build Завершён!                    ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Следующие шаги:"
    Write-Host "1. Проверьте билды в EAS Dashboard: https://expo.dev"
    Write-Host "2. Скачайте артефакты для тестирования"
    Write-Host "3. Запустите: .\build-production.ps1 submit для отправки в сторы"
}

# Основная логика
Write-Header

switch ($Command) {
    "all" {
        Check-Dependencies
        Check-Credentials
        Build-GardCore
        Install-Dependencies
        Build-Android
        Build-iOS
        Show-Success
    }
    "android" {
        Check-Dependencies
        Check-Credentials
        Build-GardCore
        Install-Dependencies
        Build-Android
    }
    "ios" {
        Check-Dependencies
        Check-Credentials
        Install-Dependencies
        Build-iOS
    }
    "submit" {
        Submit-ToStores
    }
    "check" {
        Check-Dependencies
        Check-Credentials
    }
    "help" {
        Show-Help
    }
    default {
        Write-Host "Неизвестная команда: $Command" -ForegroundColor Red
        Show-Help
        exit 1
    }
}
