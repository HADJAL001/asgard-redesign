# Чек-лист публикации OSGARD Mobile в App Store / Google Play

Статус на 2026-07-23: билды **не запускались** и в сторы **ничего не отправлено** —
в этой среде нет доступа к Expo/Apple/Google аккаунтам (нет `EXPO_TOKEN`,
`eas-cli` не установлен, `eas.json` → `submit.production` пуст). Всё, что
можно было подготовить без чужих учётных данных, — готово и описано ниже.

Подробная пошаговая инструкция со всеми командами — [`mobile/RELEASE.md`](../mobile/RELEASE.md).
Здесь — сжатый чек-лист именно для координатора.

## Готово ✅

- [x] Иконка/сплэш-скрин: `mobile/assets/images/{icon,adaptive-icon,splash-icon,favicon}.png`
      (брендированная заглушка OSGARD, 1024×1024 исходник — EAS сама генерирует
      все размеры при сборке, отдельно ничего готовить не нужно)
- [x] Тексты карточек: [`mobile/store-metadata/ios.md`](../mobile/store-metadata/ios.md),
      [`mobile/store-metadata/android.md`](../mobile/store-metadata/android.md)
      — название, описание, категория, ASO-ключевые слова проверены и дополнены
- [x] `eas.json` содержит профили `development`/`preview`/`production`
- [x] `mobile/RELEASE.md` — полная инструкция от `eas login` до отправки на ревью

## Требует координатора (без этого дальше двигаться нельзя) 🔒

### 1. Аккаунты и оплата
- [ ] Аккаунт [expo.dev](https://expo.dev) (бесплатно)
- [ ] [Apple Developer Program](https://developer.apple.com/programs/) — **$99/год**
- [ ] [Google Play Console](https://play.google.com/console) — **$25 разово**

### 2. Установка и вход
```bash
npm install -g eas-cli
cd mobile
eas login          # свой Expo-логин
eas whoami          # проверить, что вошли
```
Подробности — [`docs/eas-build-commands.md`](./eas-build-commands.md).

### 3. Привязка проекта к EAS
```bash
eas init
```
Автоматически заменит плейсхолдер `REPLACE_WITH_EAS_PROJECT_ID` в
`mobile/app.json` → `extra.eas.projectId` на реальный ID. **Закоммитить** это
изменение (единственная строка) после выполнения.

⚠️ Перед этим шагом сделайте `git pull` и проверьте `git diff mobile/app.json` —
несколько Claude-инстансов параллельно правят этот репозиторий, и файл мог
измениться с момента подготовки этого чек-листа.

### 4. Проверить адреса backend в `eas.json`
Сейчас там плейсхолдеры-примеры:
- `preview`: `https://staging-api.osgard.example.com`
- `production`: `https://api.osgard.example.com`

Замените на реальные адреса продакшен/staging backend перед сборкой.

### 5. Credentials (подписи)
```bash
eas credentials
```
Для iOS нужен вход в тот же Apple Developer аккаунт (EAS сама создаст
Distribution Certificate и Provisioning Profile через API). Для Android можно
довериться автогенерации keystore EAS — проще всего.

### 6. Сборка
```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```
5–20 минут на билд, идёт на серверах Expo. Ссылка на прогресс/скачивание —
в выводе CLI.

### 7. ⚠️ Скриншоты для карточек — ЕЩЁ НЕ ГОТОВЫ
`marketing/screenshots/` содержит скриншоты **веб-лендинга**, не мобильного
приложения (проверено: 1425×4747px, контент — hero/hall-of-fame/referral
страницы сайта). Их **нельзя** использовать для App Store/Google Play.

Реальные скриншоты можно снять только после шага 6, с настоящего билда:
1. Установите `.ipa`/`.apk` на устройство или откройте в симуляторе/эмуляторе.
2. Пройдите: логин → создание артефакта → история → кошелёк/профиль.
3. Снимите скриншоты штатными средствами ОС:
   - iOS: обязателен набор 6.7" (1290×2796, iPhone 15 Pro Max)
   - Android: минимум 2 скриншота телефона
4. Сложите в `mobile/store-metadata/screenshots/{ios,android}/` (папок пока нет).

Подробности — раздел «Скриншоты» в [`mobile/RELEASE.md`](../mobile/RELEASE.md#7-скриншоты-для-карточек-магазинов).

### 8. Заменить плейсхолдеры перед подачей
- `support@osgard.example.com` → реальный email
- `https://osgard.example.com/support` → реальная страница поддержки
- `https://osgard.example.com/privacy` → реальная политика конфиденциальности
- Демо-логин для App Review (`alex_odin`/`password123`) — оставить как есть
  (есть в backend seed) либо завести отдельный read-only demo-аккаунт

### 9. App Store Connect
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → `+` → New App
2. Bundle ID: `com.osgard.mobile`
3. Заполнить карточку текстами из `mobile/store-metadata/ios.md`, загрузить
   скриншоты (шаг 7), указать Privacy Policy URL
4. App Review → Sign-In Information → демо-логин (шаг 8)
5. Возрастной рейтинг — пройти опросник (контента для взрослых нет)
6. Загрузить билд:
   ```bash
   eas submit --platform ios --profile production
   ```
   (или вручную через Transporter/Xcode)
7. Выбрать билд в карточке → **Submit for Review**

### 10. Google Play Console
1. [play.google.com/console](https://play.google.com/console) → Create app
2. Package name: `com.osgard.mobile`
3. Заполнить Store listing текстами из `mobile/store-metadata/android.md`,
   пройти Content rating, Target audience, Data safety опросники
4. Загрузить билд:
   ```bash
   eas submit --platform android --profile production
   ```
   Первый раз потребует Service Account JSON-ключ (Play Console → Setup →
   API access → создать service account с ролью "Release manager")
5. Internal testing track → проверить → перевести в Production вручную

### 11. Ждать ревью
- Apple: обычно 24–48 часов, может занять до недели
- Google: обычно несколько часов — 3 дня

## Итоговое сообщение координатору

> Клод #3 подготовил всё, что можно без твоих аккаунтов: метаданные проверены
> и дополнены ASO-словами, чек-лист и команды готовы. **Билды не запускались**
> (нет доступа к Expo-аккаунту) и **реальных скриншотов мобильного приложения
> нет** — только скриншоты веб-сайта, для сторов не годятся. Тебе нужно:
> 1. Завести/войти в expo.dev, Apple Developer ($99/год), Google Play Console ($25)
> 2. Пройти шаги 2–6 этого чек-листа (`eas login` → `eas build`)
> 3. Снять реальные скриншоты с готового билда (шаг 7)
> 4. Заполнить карточки в App Store Connect / Google Play Console и отправить
>    на ревью (шаги 8–10)
> Полная инструкция с объяснениями — `mobile/RELEASE.md`.
