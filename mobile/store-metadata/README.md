# Store metadata (черновик)

Текстовые заготовки для карточек App Store / Google Play. Готовы к вставке
в консоли, но публикация не выполнялась — нет доступа к Apple Developer /
Google Play аккаунтам в этой среде.

## Что уже сделано автоматически

- **Иконки/сплэш**: `mobile/assets/images/{icon,adaptive-icon,splash-icon,favicon}.png`
  сгенерированы скриптом `mobile/scripts/generate-brand-assets.js` (SVG-эмблема
  OSGARD — золотое кольцо + голубой гем — в цветах основного веб-приложения,
  `--background: #0A1128`, `--primary: #00F0FF`, `elite-chrome gold: #d4af37`,
  см. `app/globals.css`), отрендерирован через `sharp`. Это не дизайнерский
  логотип, а программная брендированная заглушка — годится для сборки/подачи,
  но при желании можно заменить на профессиональный дизайн тем же путём
  (переложить готовый PNG 1024×1024 в те же файлы).
- `app.json`: `android.adaptiveIcon.backgroundColor` и splash `backgroundColor`
  выставлены в `#0A1128`, цвет иконки push-уведомлений — `#00F0FF`.

## Что ещё нужно вручную перед реальной публикацией

- **`app.json` → `extra.eas.projectId`**: сейчас `REPLACE_WITH_EAS_PROJECT_ID`.
  Заполняется автоматически при `eas init`/первом `eas build` под реальным
  EAS-аккаунтом — см. `mobile/RELEASE.md`.
- **EAS credentials** (подписи iOS/Android) — загружаются через
  `eas credentials` под реальным аккаунтом, см. `mobile/RELEASE.md`.
- **Скриншоты** для App Store (6.7", 6.5", iPad опционально) и Google Play
  (телефон, минимум 2 шт., опционально планшет) — снимаются с реального
  билда на устройстве/симуляторе; автоматический захват через `expo start --web`
  в этой среде не сработал (см. `mobile/RELEASE.md`, раздел «Скриншоты»).
- **Privacy policy URL** и **support URL** — сейчас плейсхолдеры ниже,
  заменить на реальные страницы перед подачей.
- **Возрастной рейтинг / контентные декларации** в консолях — заполняются
  интерактивно при подаче (App Store Connect / Play Console questionnaire).

## Публикация

Полная пошаговая инструкция (от `eas login` до публикации) — в
`mobile/RELEASE.md`. Коротко:

```
cd mobile
eas login
eas build --profile production --platform all
eas submit --profile production --platform all
```
