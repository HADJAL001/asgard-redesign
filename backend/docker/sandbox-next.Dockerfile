# ================================================================
# OSGARD · Преднастроенный образ песочницы для Next.js static-export
# ----------------------------------------------------------------
# ФАЙЛ СГЕНЕРИРОВАН. Не править руками — источник набора зависимостей:
#   backend/src/lib/app-scaffold-deps.ts
# Пересборка образа (из каталога backend/):
#   npm run sandbox:image
#
# Зависимости каркаса ставятся ОДИН РАЗ на этапе сборки образа. Дальше
# сборка сгенерированного проекта = только `next build` поверх готовых
# node_modules: быстро и БЕЗ СЕТИ (--network none), т.к. качать нечего.
#
# Отпечаток набора: 8b2eab8c4b5d4efb
# Песочница сверяет его с LABEL образа и не использует устаревший образ
# (иначе каждая сборка впустую тратит минуты и падает "module not found").
# ================================================================
FROM node:20-slim

WORKDIR /app

LABEL osgard.scaffold.deps="8b2eab8c4b5d4efb"

# Ровно тот же набор, что генератор кладёт в package.json приложения.
RUN printf '%s' '{"name":"osgard-sandbox-base","version":"0.1.0","private":true,"dependencies":{"next":"^14.2.0","react":"^18.3.0","react-dom":"^18.3.0","lucide-react":"^0.454.0"},"devDependencies":{"typescript":"^5.7.0","tailwindcss":"^3.4.0","postcss":"^8.4.0","autoprefixer":"^10.4.0","@types/node":"^22.0.0","@types/react":"^18.3.0","@types/react-dom":"^18.3.0"}}' > package.json \
  && npm install --no-audit --no-fund \
  && npm cache clean --force

# Прогреваем SWC-бинарь Next.js, чтобы первый next build не подтягивал его в рантайме.
ENV NEXT_TELEMETRY_DISABLED=1
