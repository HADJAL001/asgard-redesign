# Дашборд мониторинга OSGARD backend

Автоматически обновляется workflow `.github/workflows/daily-status-report.yml` раз в сутки на основе лога `monitoring/status-log.csv` (ветка `monitoring-data`), который пишет `.github/workflows/keep-alive.yml` каждые 10 минут.

Обновлено: 2026-07-29 07:37 UTC

## Сводка за последние 7 дней

| Метрика | Значение |
|---|---|
| Uptime (общий, health + tc-market/state) | 98.12% |
| Проверок всего | 160 |
| Успешных проверок | 157 |
| Ошибок 5xx | 0 |
| Среднее время ответа | 0.894s |

## По эндпоинтам

| Эндпоинт | Uptime | Проверок | Среднее время ответа |
|---|---|---|---|
| /api/health | 97.50% | 80 | 1.214s |
| /api/tc-market/state | 98.75% | 80 | 0.574s |

## Как читать

- Порог "медленного ответа" в keep-alive — 2 секунды (см. `SLOW_THRESHOLD_S` в keep-alive.yml).
- Ошибки 5xx считаются по коду ответа, начинающемуся с "5" (500, 502, 503 и т.д.).
- Сырые данные: ветка `monitoring-data`, файл `monitoring/status-log.csv`.
- Инструкция по ручному мониторингу: [monitoring-manual.md](./monitoring-manual.md).
