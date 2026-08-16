# Credentials для публикации в сторы

> ⚠️ **ВАЖНО**: Файлы в этой директории содержат секретные ключи и НЕ должны коммититься в репозиторий!

## Необходимые файлы

### Google Play (Android)

#### `google-play-service-account.json`

Сервисный аккаунт для автоматической публикации в Google Play.

**Как получить:**

1. Перейти в [Google Play Console](https://play.google.com/console)
2. Setup → API access
3. Create new service account (или использовать существующий)
4. В Google Cloud Console:
   - IAM & Admin → Service Accounts
   - Создать ключ (JSON)
   - Скачать файл
5. Переименовать в `google-play-service-account.json`
6. Поместить в эту директорию

**Необходимые права:**
- Release manager
- Или: Edit and delete draft apps, Release apps to testing tracks

### App Store (iOS)

#### Переменные окружения (рекомендуется)

Для iOS рекомендуется использовать переменные окружения вместо файлов:

```bash
# В .env.local или в EAS Secrets
APPLE_ID=your-apple-id@example.com
ASC_APP_ID=1234567890
APPLE_TEAM_ID=ABCD1234
```

**Как получить:**

1. **APPLE_ID**: Ваш Apple ID (email)
2. **ASC_APP_ID**: 
   - App Store Connect → My Apps → Выбрать приложение
   - General → App Information → Apple ID
3. **APPLE_TEAM_ID**:
   - Apple Developer Portal → Membership → Team ID

#### App Store Connect API Key (опционально)

Для автоматизации без ввода пароля:

1. App Store Connect → Users and Access → Keys
2. Generate API Key
3. Скачать `.p8` файл
4. Сохранить Key ID и Issuer ID

```bash
# В EAS Secrets
EXPO_APPLE_APP_STORE_CONNECT_API_KEY_KEY_ID=XXXXXXXXXX
EXPO_APPLE_APP_STORE_CONNECT_API_KEY_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EXPO_APPLE_APP_STORE_CONNECT_API_KEY_PATH=./credentials/AuthKey_XXXXXXXXXX.p8
```

## Настройка EAS Secrets

Рекомендуется хранить секреты в EAS:

```bash
# Установить секреты
eas secret:create --name APPLE_ID --value "your-apple-id@example.com"
eas secret:create --name ASC_APP_ID --value "1234567890"
eas secret:create --name APPLE_TEAM_ID --value "ABCD1234"

# Для Google Play - загрузить файл
eas secret:create --name GOOGLE_SERVICE_ACCOUNT --type file --value ./credentials/google-play-service-account.json
```

## Проверка настройки

```bash
# Проверить EAS авторизацию
eas whoami

# Проверить секреты
eas secret:list

# Тестовая сборка
eas build --profile preview --platform android
```

## Безопасность

1. **Никогда** не коммитьте файлы credentials в Git
2. Используйте `.gitignore` (уже настроен)
3. Храните резервные копии в безопасном месте (1Password, Vault, etc.)
4. Регулярно ротируйте ключи
5. Используйте минимально необходимые права

## Структура директории

```
credentials/
├── .gitignore              # Игнорирует все секретные файлы
├── README.md               # Этот файл
├── google-play-service-account.json  # Google Play (не коммитить!)
└── AuthKey_XXXXXXXXXX.p8   # App Store Connect API Key (не коммитить!)
```

## Troubleshooting

### "Service account not found"
- Проверьте, что файл называется точно `google-play-service-account.json`
- Проверьте права сервисного аккаунта в Google Play Console

### "Invalid Apple credentials"
- Проверьте APPLE_ID и пароль
- Включите App-Specific Password если используете 2FA
- Проверьте ASC_APP_ID

### "Team not found"
- Проверьте APPLE_TEAM_ID
- Убедитесь, что аккаунт имеет доступ к команде

## Ссылки

- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Google Play API Access](https://support.google.com/googleplay/android-developer/answer/6112435)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
