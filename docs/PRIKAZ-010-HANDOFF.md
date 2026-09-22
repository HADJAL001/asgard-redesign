# Приказ №010: handoff для продолжения работы

Дата: 2026-09-22  
Репозиторий: `https://github.com/HADJAL001/asgard-redesign`  
Ветка: `main`  
Последний commit: `387896fe fix(landing): use NASA Blue Marble globe textures`

## Цель

Выполнить финальный приказ №010: убрать legacy-визуальные слои, использовать NASA Blue Marble, сохранить рабочие Globe/Orchestrator/Projects, проверить сборку и опубликовать production.

## Выполнено

`components/landing/GlobeScene.tsx` использует дневную карту `/textures/earth/earth-day.jpg`, ночную карту `/textures/earth/earth-night.jpg` через `emissiveMap`, `emissive: 0xffffff` и `emissiveIntensity: 0.6`. Cleanup освобождает `nightTexture`.

Добавлены `public/textures/earth/earth-day.jpg` (NASA Blue Marble, 2,566,770 bytes) и `public/textures/earth/earth-night.jpg` (NASA night lights, 794,479 bytes).

## Проверки

Успешно выполнены: `npm ci`, `npm run lint`, `npm run build`, `git diff --check`, `npx playwright test e2e/landing-interview.spec.ts --workers=1` (`7 passed`). GitHub `security-scan` для `387896fe` успешен.

## Git

Репозиторий: `https://github.com/HADJAL001/asgard-redesign`  
HEAD и `origin/main`: `387896fe`  
Worktree после commit был чистым.

Проверка:

```powershell
git status --short --branch
git log -2 --oneline --decorate
git ls-remote origin refs/heads/main
```

## Production-блокер

`https://osgardnewworld.com` отвечает HTTP 200, но содержит старую сборку: `/textures/earth/earth-day.jpg` и `/textures/earth/earth-night.jpg` дают HTTP 404, старый `/textures/earth/earth_atmos_2048.jpg` даёт HTTP 200.

В `.github/workflows` нет frontend deploy workflow. `docs/own-infra-deploy.md` описывает control-plane/Forgejo deploy, но требуются серверные credentials/env (`OSGARD_CLUSTER_API_TOKEN`, Forgejo token и т.п.). В текущей сессии их нет, поэтому live production не изменён.

## Следующий шаг

1. Открыть этот файл и проверить `git status`.
2. Получить разрешённый доступ к deploy API или SSH к host, обслуживающему `osgardnewworld.com`.
3. Развернуть commit `387896fe`.
4. Проверить:

```powershell
curl.exe -I https://osgardnewworld.com
curl.exe -L -s -o NUL -w "%{http_code} %{size_download}" https://osgardnewworld.com/textures/earth/earth-day.jpg
curl.exe -L -s -o NUL -w "%{http_code} %{size_download}" https://osgardnewworld.com/textures/earth/earth-night.jpg
```

Ожидаемый результат обеих текстур: HTTP `200` и ненулевой размер. Затем повторить Globe desktop/mobile smoke-проверку.

Не использовать `git reset --hard`, force-push или публикацию секретов в репозитории.
