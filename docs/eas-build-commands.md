# EAS build/submit — команды

Справочник команд для координатора. Контекст и объяснение каждого шага —
[`mobile/RELEASE.md`](../mobile/RELEASE.md). Общий чек-лист по подаче в
сторы — [`docs/app-store-submission-checklist.md`](./app-store-submission-checklist.md).

Все команды выполняются из `mobile/`:

```bash
cd mobile
```

## Установка

```bash
npm install -g eas-cli
eas --version
```

## Вход в Expo

```bash
eas login
eas whoami   # проверить, что вошли под нужным аккаунтом
```

## Привязка проекта (один раз)

```bash
eas init
```
Заменит `REPLACE_WITH_EAS_PROJECT_ID` в `app.json` → `extra.eas.projectId` на
реальный ID. Закоммитить эту одну строку после выполнения.

## Credentials (подписи приложений)

```bash
eas credentials
```
Интерактивное меню, отдельно для iOS и Android. Для iOS — вход в Apple
Developer аккаунт. Можно довериться автогенерации EAS (проще всего, ключи
хранятся на серверах Expo).

## Сборка

```bash
# Внутреннее тестирование (apk/ipa напрямую на устройство)
eas build --platform android --profile preview
eas build --platform ios --profile preview

# Прод-сборка для магазинов
eas build --platform ios --profile production
eas build --platform android --profile production

# Обе платформы разом
eas build --platform all --profile production
```
5–20 минут на билд, прогресс — по ссылке в выводе CLI или на
`expo.dev/accounts/[аккаунт]/projects/OSGARD/builds`.

## Отправка в сторы

```bash
eas submit --platform ios --profile production
```
Спросит Apple ID/app-specific password (или возьмёт сохранённые credentials),
загрузит `.ipa` в App Store Connect (появится в TestFlight).

```bash
eas submit --platform android --profile production
```
Первый раз потребует Service Account JSON-ключ (Play Console → Setup →
API access). После загрузки `.aab` появится в Internal testing track —
перевод в Production выполняется вручную в консоли.

```bash
eas submit --platform all --profile production
```

## Секреты (если понадобятся API-ключи третьих сервисов)

Не класть в `eas.json` как plaintext:

```bash
eas secret:create --scope project --name SECRET_NAME --value "значение"
eas secret:list
```

## Полезные проверочные команды

```bash
eas build:list                 # история сборок
eas build:view <build-id>      # детали конкретной сборки
eas submit:list                # история отправок в сторы
```
