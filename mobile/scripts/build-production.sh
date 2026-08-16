#!/bin/bash
# OSGARD Production Build Script
# Волна Ядро-8: Финальная сборка для Google Play и App Store

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Директории
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
GARD_CORE_DIR="$MOBILE_DIR/../../gard-core"
CREDENTIALS_DIR="$MOBILE_DIR/credentials"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           OSGARD Production Build Script                   ║${NC}"
echo -e "${BLUE}║                    Волна Ядро-8                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Функция проверки зависимостей
check_dependencies() {
    echo -e "${YELLOW}[1/6] Проверка зависимостей...${NC}"
    
    # Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js не установлен${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
    
    # npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm не установлен${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ npm $(npm -v)${NC}"
    
    # EAS CLI
    if ! command -v eas &> /dev/null; then
        echo -e "${YELLOW}⚠ EAS CLI не установлен, устанавливаю...${NC}"
        npm install -g eas-cli
    fi
    echo -e "${GREEN}✓ EAS CLI $(eas --version)${NC}"
    
    # Go (для сборки GardCore)
    if ! command -v go &> /dev/null; then
        echo -e "${YELLOW}⚠ Go не установлен (нужен для сборки GardCore.aar)${NC}"
    else
        echo -e "${GREEN}✓ Go $(go version | awk '{print $3}')${NC}"
    fi
    
    echo ""
}

# Функция проверки credentials
check_credentials() {
    echo -e "${YELLOW}[2/6] Проверка credentials...${NC}"
    
    if [ ! -d "$CREDENTIALS_DIR" ]; then
        echo -e "${YELLOW}⚠ Создаю директорию credentials...${NC}"
        mkdir -p "$CREDENTIALS_DIR"
    fi
    
    # Google Play Service Account
    if [ ! -f "$CREDENTIALS_DIR/google-play-service-account.json" ]; then
        echo -e "${YELLOW}⚠ google-play-service-account.json не найден${NC}"
        echo -e "   Скачайте из Google Play Console → Setup → API access"
        echo -e "   и поместите в $CREDENTIALS_DIR/"
    else
        echo -e "${GREEN}✓ Google Play Service Account${NC}"
    fi
    
    # Проверка EAS login
    if ! eas whoami &> /dev/null; then
        echo -e "${YELLOW}⚠ Не авторизован в EAS. Выполните: eas login${NC}"
    else
        echo -e "${GREEN}✓ EAS авторизация: $(eas whoami)${NC}"
    fi
    
    echo ""
}

# Функция сборки GardCore
build_gard_core() {
    echo -e "${YELLOW}[3/6] Сборка GardCore...${NC}"
    
    if [ ! -d "$GARD_CORE_DIR" ]; then
        echo -e "${RED}❌ Директория gard-core не найдена: $GARD_CORE_DIR${NC}"
        exit 1
    fi
    
    cd "$GARD_CORE_DIR"
    
    # Проверка наличия GardCore.aar
    if [ -f "build/GardCore.aar" ]; then
        echo -e "${GREEN}✓ GardCore.aar уже собран${NC}"
    else
        if command -v go &> /dev/null && command -v gomobile &> /dev/null; then
            echo -e "${BLUE}Сборка GardCore.aar...${NC}"
            make android
            echo -e "${GREEN}✓ GardCore.aar собран${NC}"
        else
            echo -e "${YELLOW}⚠ gomobile не установлен, пропускаю сборку GardCore${NC}"
            echo -e "   Установите: go install golang.org/x/mobile/cmd/gomobile@latest"
        fi
    fi
    
    # Копирование в модуль
    if [ -f "build/GardCore.aar" ]; then
        cp build/GardCore.aar "$MOBILE_DIR/modules/gard-core/android/libs/"
        echo -e "${GREEN}✓ GardCore.aar скопирован в модуль${NC}"
    fi
    
    cd "$MOBILE_DIR"
    echo ""
}

# Функция установки зависимостей
install_dependencies() {
    echo -e "${YELLOW}[4/6] Установка зависимостей...${NC}"
    
    cd "$MOBILE_DIR"
    
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        echo -e "${BLUE}Установка npm пакетов...${NC}"
        npm install
    else
        echo -e "${GREEN}✓ Зависимости уже установлены${NC}"
    fi
    
    echo ""
}

# Функция сборки Android
build_android() {
    echo -e "${YELLOW}[5/6] Сборка Android (Production)...${NC}"
    
    cd "$MOBILE_DIR"
    
    echo -e "${BLUE}Запуск EAS Build для Android...${NC}"
    echo -e "Профиль: production"
    echo -e "Тип: app-bundle (.aab)"
    echo ""
    
    eas build --profile production --platform android --non-interactive
    
    echo -e "${GREEN}✓ Android build завершён${NC}"
    echo ""
}

# Функция сборки iOS
build_ios() {
    echo -e "${YELLOW}[6/6] Сборка iOS (Production)...${NC}"
    
    cd "$MOBILE_DIR"
    
    echo -e "${BLUE}Запуск EAS Build для iOS...${NC}"
    echo -e "Профиль: production"
    echo -e "Тип: archive (.ipa)"
    echo ""
    
    eas build --profile production --platform ios --non-interactive
    
    echo -e "${GREEN}✓ iOS build завершён${NC}"
    echo ""
}

# Функция отправки в сторы
submit_to_stores() {
    echo -e "${YELLOW}Отправка в сторы...${NC}"
    
    cd "$MOBILE_DIR"
    
    read -p "Отправить Android в Google Play? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Отправка в Google Play (internal track)...${NC}"
        eas submit --platform android --profile production
        echo -e "${GREEN}✓ Отправлено в Google Play${NC}"
    fi
    
    read -p "Отправить iOS в App Store? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Отправка в App Store Connect...${NC}"
        eas submit --platform ios --profile production
        echo -e "${GREEN}✓ Отправлено в App Store Connect${NC}"
    fi
    
    echo ""
}

# Функция вывода справки
show_help() {
    echo "Использование: $0 [команда]"
    echo ""
    echo "Команды:"
    echo "  all       - Полная сборка (Android + iOS)"
    echo "  android   - Только Android"
    echo "  ios       - Только iOS"
    echo "  submit    - Отправить в сторы"
    echo "  check     - Проверить зависимости"
    echo "  help      - Показать справку"
    echo ""
    echo "Примеры:"
    echo "  $0 all        # Собрать для обеих платформ"
    echo "  $0 android    # Собрать только Android"
    echo "  $0 submit     # Отправить последние билды в сторы"
}

# Основная логика
case "${1:-all}" in
    all)
        check_dependencies
        check_credentials
        build_gard_core
        install_dependencies
        build_android
        build_ios
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║              Production Build Завершён!                    ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo "Следующие шаги:"
        echo "1. Проверьте билды в EAS Dashboard: https://expo.dev"
        echo "2. Скачайте артефакты для тестирования"
        echo "3. Запустите: $0 submit для отправки в сторы"
        ;;
    android)
        check_dependencies
        check_credentials
        build_gard_core
        install_dependencies
        build_android
        ;;
    ios)
        check_dependencies
        check_credentials
        install_dependencies
        build_ios
        ;;
    submit)
        submit_to_stores
        ;;
    check)
        check_dependencies
        check_credentials
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Неизвестная команда: $1${NC}"
        show_help
        exit 1
        ;;
esac
