# Store metadata (черновик)

Текстовые заготовки для карточек App Store / Google Play. Готовы к вставке
в консоли, но публикация не выполнялась — нет доступа к Apple Developer /
Google Play аккаунтам в этой среде.

## Что ещё нужно вручную перед реальной публикацией

- **Иконки/сплэш**: `mobile/assets/images/*` — сейчас дефолтные заглушки
  Expo-шаблона (`icon.png`, `adaptive-icon.png`, `splash-icon.png`,
  `favicon.png`). Нужны брендированные OSGARD-версии (1024×1024 iOS-иконка,
  adaptive-icon foreground для Android, сплэш). В репозитории не нашлось
  готовых OSGARD-ассетов подходящего размера/формата для мобилки — только
  generic-плейсхолдеры (`public/placeholder-logo.*`), их использовать нельзя.
- **`app.json` → `extra.eas.projectId`**: сейчас `REPLACE_WITH_EAS_PROJECT_ID`.
  Заполняется автоматически при `eas init`/первом `eas build` под реальным
  EAS-аккаунтом.
- **Скриншоты** для App Store (6.7", 6.5", iPad опционально) и Google Play
  (телефон, минимум 2 шт., опционально планшет) — снимаются с реального
  билда на устройстве/симуляторе.
- **Privacy policy URL** и **support URL** — сейчас плейсхолдеры ниже,
  заменить на реальные страницы перед подачей.
- **Возрастной рейтинг / контентные декларации** в консолях — заполняются
  интерактивно при подаче (App Store Connect / Play Console questionnaire).

## Публикация (когда появятся аккаунты)

```
cd mobile
eas login
eas build --profile production --platform all
eas submit --profile production --platform all
```
