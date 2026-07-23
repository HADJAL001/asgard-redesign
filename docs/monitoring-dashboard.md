# Дашборд мониторинга OSGARD backend

Автоматически обновляется workflow `.github/workflows/daily-status-report.yml` раз в сутки на основе лога `monitoring/status-log.csv` (ветка `monitoring-data`), который пишет `.github/workflows/keep-alive.yml` каждые 10 минут.

Данных пока нет — дашборд заполнится реальными цифрами после первого прогона `daily-status-report.yml` (запускается ежедневно в 08:00 МСК, либо вручную через workflow_dispatch).

## Что здесь будет

| Метрика | Значение |
|---|---|
| Uptime (общий, health + tc-market/state) | — |
| Проверок всего | — |
| Успешных проверок | — |
| Ошибок 5xx | — |
| Среднее время ответа | — |

## По эндпоинтам

| Эндпоинт | Uptime | Проверок | Среднее время ответа |
|---|---|---|---|
| /api/health | — | — | — |
| /api/tc-market/state | — | — | — |

## Как читать

- Порог "медленного ответа" в keep-alive — 2 секунды (см. `SLOW_THRESHOLD_S` в keep-alive.yml).
- Ошибки 5xx считаются по коду ответа, начинающемуся с "5" (500, 502, 503 и т.д.).
- Сырые данные: ветка `monitoring-data`, файл `monitoring/status-log.csv`.
- Инструкция по ручному мониторингу: [monitoring-manual.md](./monitoring-manual.md).
