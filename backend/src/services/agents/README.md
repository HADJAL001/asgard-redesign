# services/agents — Backend / Tester / Optimizer / Security

Второй участок пайплайна генерации проекта OSGARD. Первый участок (Analyst →
Architect → Designer → Frontend, `backend/src/agents`) отвечает за спецификацию,
схему БД, дизайн-систему и фронтенд-код. Этот модуль достраивает бэкенд, тесты,
оптимизацию и аудит безопасности поверх результата первого участка.

```
description (строка)
   │
   ▼
runAgentPipeline()               ← backend/src/agents (Клод #2)
   │  upstream.projectSchema.data, upstream.frontend.data
   ▼
adaptProjectSchema / adaptFrontendArtifact   ← ./adapters/*
   │  ProjectSchema, FrontendArtifact (контракт этого модуля, ./types.ts)
   ▼
BackendAgent   .run({ schema, frontend })              → BackendArtifact
TesterAgent    .run({ frontend, backend })             → TestArtifact
OptimizerAgent .run({ schema, frontend, backend, tests })→ OptimizedArtifact
SecurityAgent  .run({ schema, frontend, backend, tests })→ SecurityReport
```

Собрано в `pipeline-bridge.ts` → `runFullPipeline(description, taskId?)`.

## Контракты (два разных `ProjectSchema`/`FrontendArtifact`)

`backend/src/agents/types.ts` (Клод #2) и `./types.ts` (этот модуль) независимо
определяют свои `ProjectSchema`/`FrontendArtifact` — с одинаковыми именами, но
разными полями. Это не ошибка, а два самостоятельных контракта, у каждого — свои
потребители. Мост между ними — `./adapters/schema-adapter.ts` и
`./adapters/frontend-adapter.ts`, а не приведение типов. При обнаружении
авторизации (`users`/`user`-таблица или `/auth|login|register|...`-эндпоинт)
`adaptProjectSchema` исключает эту таблицу из `entities` — её создаёт и
обслуживает сам `BackendAgent` (свои колонки: `email`, `password_hash`, `role`).

## Агенты

Каждый агент (`BaseAgent<TInput, TOutput>`, `base-agent.ts`) реализует только
`execute(input): Promise<TOutput>` и **никогда не бросает исключение** — при
недоступном AI-провайдере или ошибке возвращает детерминированный
fallback-артефакт (`source: "fallback"` вместо `"ai"`).

- **BackendAgent** (`backend-agent.ts`) — Express-роуты, SQL-схема, middleware
  авторизации по `schema.auth`.
- **TesterAgent** (`tester-agent.ts`) — unit/integration-тесты для бэкенда и
  фронтенда.
- **OptimizerAgent** (`optimizer-agent.ts`) — находки по производительности/
  структуре кода (`OptimizationSuggestion`), часть — с автопатчем файла.
- **SecurityAgent** (`security-agent.ts`) — детерминированный regex-скан
  (SQLi/XSS/CSRF/auth/secrets) + AI-обзор поверх него; до 3 самых серьёзных
  находок патчатся автоматически.

## `BaseAgent.run()` — метрики, прогресс, кеш

`execute()` агентов не меняется. `run(input, taskId?)` оборачивает его:

1. **Кеш** (`cache.ts`, `AgentCache`) — по sha256-хешу `JSON.stringify(input)`,
   через уже существующий `cacheService` (Redis, если доступен, иначе
   in-memory Map процесса — тот же контракт, что и везде в проекте). TTL 1 час.
   При попадании в кеш `execute()` не вызывается вовсе.
2. **Прогресс** (`emitProgress`, использует `pipelineEvents` из
   `../chain-manager`) — событие `{ type: "agent_progress", agent, progress,
   message }` в канал `task:${taskId}`, тот же канал, который уже слушает
   `GET /api/generate-project/task/:taskId/stream` (SSE). Без `taskId` — no-op
   (например, локальный прогон `example.ts`). Эмитится на старте (0) и по
   завершении (100) — процент реального прогресса *внутри* `execute()` намеренно
   не имитируется (нет отдельного шага, где это можно измерить, не трогая логику
   уже проверенных `execute()`).
3. **Метрики** (`metrics.ts`, `AgentMetrics.track`) — одна строка в
   `agent_executions` (миграция `047_agent_executions.ts`) на каждый вызов:
   `agent_name, success, duration_ms, task_id, created_at`. `try/catch` вокруг
   `execute()` — защитный рубеж (агенты и так не бросают исключение по
   контракту); ошибка записи метрики в БД никогда не роняет пайплайн.

## Пример

```bash
npx ts-node backend/src/services/agents/example.ts
```

или из кода:

```ts
import { runFullPipeline } from "./pipeline-bridge"

const result = await runFullPipeline("Создай todo-приложение с авторизацией и задачами", taskId)
// result.schema, result.frontend, result.backend, result.tests, result.optimized, result.security
```
