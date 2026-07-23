# OSGARD Mobile — инструкция по релизу

Пошаговый путь от чистого чекаута репозитория до публикации в App Store и
Google Play. Всё, что можно было сделать без учётных данных Apple/Google/Expo,
уже сделано и закоммичено (иконки, `app.json`, `eas.json`, тексты карточек
магазинов). Разделы ниже помечены **[ТРЕБУЕТ АККАУНТА]**, если шаг физически
невозможно выполнить без входа в чужой (пользовательский) аккаунт — это
единственное, что не может сделать агент за пользователя.

## 0. Предварительные требования

- Node.js + npm (версии — как в остальном репозитории).
- Аккаунт [expo.dev](https://expo.dev) (бесплатный) — для EAS Build/Submit.
- Аккаунт [Apple Developer Program](https://developer.apple.com/programs/) ($99/год) — для публикации в App Store.
- Аккаунт [Google Play Console](https://play.google.com/console) (разовый взнос $25) — для публикации в Google Play.
- Установить EAS CLI глобально: `npm install -g eas-cli`.

## 1. Установка зависимостей

```
cd mobile
npm ci
```

## 2. Вход в EAS **[ТРЕБУЕТ АККАУНТА]**

```
eas login
```

Введите email/пароль своего Expo-аккаунта (или `eas login --sso`, если в
организации настроен SSO). Проверить, что вход выполнен: `eas whoami`.

## 3. Привязка проекта к EAS **[ТРЕБУЕТ АККАУНТА]**

Сейчас в `app.json` стоит плейсхолдер:

```json
"extra": { "eas": { "projectId": "REPLACE_WITH_EAS_PROJECT_ID" } }
```

Выполните из `mobile/`:

```
eas init
```

Команда сама создаст проект на expo.dev (если его ещё нет), спросит
подтверждение и **автоматически подставит реальный `projectId`** в
`app.json`. После этого закоммитьте изменение в `app.json` (в этом файле
меняется только одна строка — `extra.eas.projectId`, остальное уже настроено).

## 4. Credentials (подписи приложений) **[ТРЕБУЕТ АККАУНТА]**

EAS может либо сгенерировать и хранить ключи подписи сама (рекомендуется —
проще всего), либо вы загружаете свои существующие.

### Вариант A — довериться EAS (рекомендуется)

Ничего отдельно делать не нужно: при первом `eas build` для iOS/Android EAS
сама спросит "Generate a new keystore/certificate?" — отвечайте `Yes`.
Ключи будут храниться на серверах Expo и переиспользоваться для всех
последующих сборок этого профиля.

### Вариант B — загрузить свои credentials вручную

```
cd mobile
eas credentials
```

Интерактивное меню:
- **Android**: `Android` → `production` → `Keystore: Set up a new keystore`
  (или `Upload existing keystore`, если он у вас уже есть — потребуется файл
  `.jks`/`.keystore`, alias и оба пароля).
- **iOS**: `iOS` → `production` → потребуется Apple Developer аккаунт с
  правами Admin/App Manager; EAS может сама создать Distribution Certificate
  и Provisioning Profile через API Apple (войдёт в ваш Apple ID прямо в CLI),
  либо вы загружаете свой `.p12` + `.mobileprovision`.

Куда что вводить: команда `eas credentials` — единственное место, вводить
в сторонние формы/файлы ничего не нужно, весь ввод интерактивный в терминале.

## 5. Переменные окружения сборки

Уже настроены в [`eas.json`](./eas.json) по профилям:

| Профиль | `EXPO_PUBLIC_API_URL` | Назначение |
|---|---|---|
| `development` | `http://localhost:3003` | dev-client, локальный backend |
| `preview` | `https://staging-api.osgard.example.com` | внутреннее тестирование |
| `production` | `https://api.osgard.example.com` | прод |

**[ТРЕБУЕТ ДЕЙСТВИЯ]** Замените `staging-api.osgard.example.com` и
`api.osgard.example.com` в `eas.json` на реальные адреса бэкенда перед
сборкой `preview`/`production` — сейчас это плейсхолдеры-примеры.

Если нужны секреты (API-ключи третьих сервисов), не кладите их в `eas.json`
как plaintext — используйте `eas secret:create` (см.
[docs.expo.dev/eas/environment-variables](https://docs.expo.dev/eas/environment-variables/)).

## 6. Сборка

```
cd mobile

# Внутреннее тестирование (сборка ставится напрямую на устройство, apk/ipa):
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Прод-сборка для магазинов:
eas build --profile production --platform all
```

Сборка идёт на серверах Expo (5–20 минут), прогресс — по ссылке, которую
выдаст CLI, либо на expo.dev/accounts/[аккаунт]/projects/OSGARD/builds.
По готовности CLI даёт ссылку на скачивание `.apk`/`.aab`/`.ipa`.

`preview`-профиль в `eas.json` настроен на `"buildType": "apk"` — прямой
`.apk` можно сразу поставить на Android-устройство без Play Console.

## 7. Скриншоты для карточек магазинов

**Статус: не выполнено в этой среде.** Автоматический захват через
`expo start --web` + браузерная автоматизация был опробован и заблокирован
pre-existing ошибкой окружения (`Cannot find module
'react-native-worklets/plugin'` — babel-плагин, который ожидает
`react-native-reanimated`, отсутствует в `node_modules`; это не связано с
задачей релиза и не исправлялось, чтобы не трогать общий `node_modules`/
babel-конфиг в репозитории, который параллельно правят другие инстансы).

Как получить скриншоты после сборки (`preview`-профиль, п.6):

1. Установите собранный `.apk`/`.ipa` на устройство или откройте в
   симуляторе iOS / эмуляторе Android.
2. Пройдите: логин → главный экран создания артефакта → история артефактов →
   (опционально) экран профиля/кошелька.
3. Сделайте снимки экрана штатными средствами ОС на нужных разрешениях:
   - iOS: 6.7" (1290×2796, iPhone 15 Pro Max) обязательно; 6.5" и iPad 12.9" опционально.
   - Android: минимум 2 скриншота телефона (любое разрешение, Play Console
     сам подгонит), опционально скриншоты планшета.
4. Сложите готовые файлы в `mobile/store-metadata/screenshots/ios/` и
   `mobile/store-metadata/screenshots/android/` (директории пока не созданы —
   создайте при добавлении файлов) для истории/переиспользования.

Точные требования по размерам — в `store-metadata/ios.md` и
`store-metadata/android.md` (раздел «Графика»).

## 8. Метаданные карточек

Готовые тексты (название, описание, ключевые слова, категория, промо-текст) —
в [`store-metadata/ios.md`](./store-metadata/ios.md) и
[`store-metadata/android.md`](./store-metadata/android.md). Перед подачей
замените плейсхолдеры:
- `support@osgard.example.com`, `https://osgard.example.com/support`,
  `https://osgard.example.com/privacy` — на реальные адреса/страницы.
- Демо-логин `alex_odin` / `password123` для App Review — либо оставить
  (тестовый пользователь есть в backend seed-данных), либо завести отдельный
  read-only demo-аккаунт специально для проверяющих.

## 9. App Store Connect **[ТРЕБУЕТ АККАУНТА]**

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → `+` → New App.
2. Bundle ID: `com.osgard.mobile` (уже задан в `app.json` → `ios.bundleIdentifier`,
   должен быть создан в [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers/list)
   — если ещё не создан, EAS создаёт его автоматически при `eas build`/
   `eas credentials`, либо создайте вручную с тем же Bundle ID).
3. Заполните карточку текстами из `store-metadata/ios.md`, загрузите
   скриншоты (п.7), укажите Privacy Policy URL.
4. App Review → Sign-In Information → внесите демо-логин (п.8).
5. Возрастной рейтинг — пройти опросник (контента для взрослых нет →
   стандартные ответы "No" на всё чувствительное).

## 10. Публикация в App Store **[ТРЕБУЕТ АККАУНТА]**

```
cd mobile
eas submit --profile production --platform ios
```

CLI спросит Apple ID/app-specific password (или использует уже сохранённые
credentials из `eas credentials`) и сам загрузит `.ipa` в App Store Connect
(TestFlight). После обработки (обычно 15–60 минут) билд появится в
TestFlight → выберите его в карточке приложения → отправьте на Review.

## 11. Google Play Console **[ТРЕБУЕТ АККАУНТА]**

1. [play.google.com/console](https://play.google.com/console) → Create app.
2. Package name: `com.osgard.mobile` (уже задан в `app.json` → `android.package`).
3. Dashboard → заполните все обязательные секции (Store listing текстами из
   `store-metadata/android.md`, Content rating опросник, Target audience,
   Data safety — на основе того, какие данные собирает backend: email,
   опционально геолокация для профиля — сверьтесь с `backend/README.md`,
   Privacy Policy URL).
4. Создайте Internal testing track для первой проверки перед Production.

## 12. Публикация в Google Play **[ТРЕБУЕТ АККАУНТА]**

```
cd mobile
eas submit --profile production --platform android
```

Первый `eas submit` на Android потребует Service Account JSON-ключ
(Play Console → Setup → API access → создать service account с ролью
"Release manager", скачать JSON-ключ, скормить путь к нему CLI при запросе —
EAS запомнит его для следующих `submit`). После загрузки `.aab` появится во
Internal testing track — переведите в Production вручную в консоли, когда
готовы к публичному релизу.

## 13. Detox e2e **[ТРЕБУЕТ Android SDK/Xcode]**

Конфиг и тесты уже готовы (`mobile/.detoxrc.js`, `mobile/e2e/`), но выполнить
их в этой Windows-сборке без Android SDK/эмулятора и без Xcode (macOS-only)
невозможно — проверено (`ANDROID_HOME`/`ANDROID_SDK_ROOT` не заданы, `adb`/
`emulator` отсутствуют, `xcodebuild` недоступен на Windows).

На машине с нужным тулчейном:

```
cd mobile

# Android (нужен запущенный эмулятор, см. AVD Manager):
npm run e2e:build:android
npm run e2e:test:android

# iOS (только macOS + Xcode):
npm run e2e:build:ios
npm run e2e:test:ios
```

## 14. Чек-лист перед первым релизом

- [ ] `eas login` выполнен, `eas whoami` показывает нужный аккаунт
- [ ] `eas init` выполнен, `app.json` → `extra.eas.projectId` — реальный ID
- [ ] `eas.json` → адреса `EXPO_PUBLIC_API_URL` заменены на реальные (не `*.example.com`)
- [ ] Credentials настроены (`eas credentials` или доверено автогенерации EAS)
- [ ] `eas build --profile production --platform all` прошла успешно
- [ ] Скриншоты сделаны и загружены в консоли
- [ ] Support/Privacy URL — реальные страницы, не плейсхолдеры
- [ ] App Store Connect / Google Play Console карточки заполнены
- [ ] `eas submit` выполнен для обеих платформ
- [ ] Приложение отправлено на Review (Apple) / переведено из Internal в Production (Google)
