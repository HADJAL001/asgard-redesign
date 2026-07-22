# OSGARD

## Интеграции

Адаптеры для деплоя и публикации сгенерированных приложений —
`backend/src/services/integrations/` (полная документация по сигнатурам,
env-переменным и примерам вызова: [backend/src/services/integrations/README.md](backend/src/services/integrations/README.md)).

### Vercel
Автоматический деплой на Vercel через REST API, с кешированием результата
по хешу файлов. Требуется `VERCEL_TOKEN` в `backend/.env` (опционально `VERCEL_TEAM_ID`).

### GitHub
Создание репозитория и пуш кода одним коммитом через Git Data API.
Требуется `GITHUB_TOKEN` в `backend/.env` (Personal Access Token с правом `repo`).

### Docker
Генерация `Dockerfile` и `docker-compose.yml` для 5 стеков: `nextjs`, `react`, `node`, `static`, `python`.

### Stripe
Кодогенерация интеграции с Stripe Checkout — встраивается в сгенерированное приложение, не создаёт реальные Product/Price в самом OSGARD.

### Supabase
Кодогенерация Supabase-клиента и SQL-миграций для сгенерированного приложения.

### WebContainer
Фронтенд-модуль (`lib/integrations/webcontainer.ts`) для запуска сгенерированного приложения прямо в браузере пользователя. Требует заголовков `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: require-corp` на странице, где используется.
