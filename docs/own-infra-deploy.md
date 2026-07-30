# Публикация сгенерированных приложений на СВОЮ инфраструктуру

Продукт платформы — **аренда нашей инфраструктуры**. Значит приложение, рождённое
движком OSGARD, обязано жить на наших серверах (`*.osgard.cloud`), а не на чужой
площадке. До этой правки единственным провайдером деплоя был Netlify: платформа
продавала аренду, а приложения клиентов уезжали к конкуренту.

## Как это работает теперь

```
файлы проекта (project_files)
      ↓  + Dockerfile и deploy/nginx.conf, если движок их не сгенерировал
временный каталог → git push --force в наш Forgejo (git.osgard.cloud)
      ↓  POST /api/projects            (регистрация приложения, идемпотентно)
      ↓  POST /api/projects/:slug/deploy → 202 {deployment_id, host}
      ↓  GET  /api/projects/:slug/deployments (опрос до терминального статуса)
projects.live_url = https://<slug>.osgard.cloud
```

Сборка образа идёт **внутри нашего кластера** (docker build на CORE), а не в
процессе бэкенда: недоверенный сгенерированный код на хосте платформы не
исполняется вообще. Это отличие от netlify-пути, где сборку приходилось делать у
себя, чтобы отдать готовый `out/`.

Код: [backend/src/services/own-cluster-deploy.ts](../backend/src/services/own-cluster-deploy.ts),
выбор площадки — [backend/src/services/deploy-target.ts](../backend/src/services/deploy-target.ts),
контракт закреплён тестом
[backend/src/tests/own-cluster-deploy.test.ts](../backend/src/tests/own-cluster-deploy.test.ts).

Адрес приложения = `app-<имя>-<id проекта>.osgard.cloud`. Слаг хранится в
`projects.cluster_slug` (миграция 096), потому что имя проекта переписывается
текстом доработки — без сохранённого слага повторный деплой ушёл бы в НОВОЕ
приложение, бросив старое работать по прежнему адресу.

## Переменные окружения бэкенда (Railway)

| Переменная | Обязательна | Смысл |
| --- | --- | --- |
| `OSGARD_CLUSTER_API_URL` | да | база API control-plane — `https://cp.osgard.cloud` |
| `OSGARD_CLUSTER_API_TOKEN` | да | `CONTROL_PLANE_API_TOKEN` кластера (доступ на запись) |
| `OSGARD_FORGEJO_URL` | да | `https://git.osgard.cloud` |
| `OSGARD_FORGEJO_OWNER` | да | владелец репозиториев приложений (организация или пользователь) |
| `OSGARD_FORGEJO_TOKEN` | да | токен Forgejo с правом создавать репозитории и пушить |
| `OSGARD_CLUSTER_BASE_DOMAIN` | нет | по умолчанию `osgard.cloud` |
| `OSGARD_FORGEJO_USER` | нет | пользователь для basic-auth при push, по умолчанию = owner |
| `DEPLOY_ALLOW_NETLIFY_FALLBACK` | нет | `true` — разрешить аварийный запас на Netlify |

Пока эти переменные не заданы, ручка деплоя **отказывает с объяснением**, а не
уходит молча на чужую площадку. Netlify включается только явным
`DEPLOY_ALLOW_NETLIFY_FALLBACK=true` — это закреплено тестом.

## Состояние инфраструктуры (30.07.2026)

Оба внешних условия закрыты, замерено фактом:

- **API control-plane опубликован наружу** — `https://cp.osgard.cloud`
  (задание 3.9 в `osgard-infra`, статический маршрут Caddy `@id=osgard-cp-api`,
  боевой сертификат Let's Encrypt). Проверка: без токена и с неверным токеном —
  `401 {"error":"unauthorized"}`. Адреса `deploy.osgard.cloud` не существует —
  он попадает под wildcard и отдаёт 404; в первой версии этого документа было
  указано именно оно, и блокер оказался мнимым.
- **Токены выданы платформе.** Для Forgejo сгенерирован отдельный токен
  `platform-app-deploy` (пользователь `osgard-deploy-bot`, скоупы
  `write:repository,write:user`), лежит на CORE в
  `/opt/osgard/core/secrets/platform-forgejo-token.txt` (права 600). Право на
  создание репозитория проверено выстрелом: `POST /user/repos` → 201, удаление
  пробного репозитория → 204. У прежнего токена `FORGEJO_BOT_TOKEN` этого права
  нет (`403 token does not have at least one of required scope(s): write:user`) —
  его нельзя было использовать для платформы.
  Все шесть переменных выставлены в окружении Railway сервиса `asgard-backend`
  (секреты — только через `--set-from-stdin`, значение не проходило через argv).

Если переменные снять, ручка деплоя честно ответит «деплой не сконфигурирован на
сервере (нет: …)» — приложение не опубликуется вообще, вместо того чтобы уехать к
конкуренту.

## Чего это ещё не доказывает

Сквозной деплой приложения на своих серверах (репозиторий → образ → контейнер →
`https://<slug>.osgard.cloud` отдаёт 200) на момент этой записи **не прогнан**.
Готовы: код платформы, маршрут, токены, права. Не проверено выстрелом: сборка
сгенерированного Next.js внутри кластера — именно там живёт класс дефектов,
который netlify-путь ловил только в проде.
