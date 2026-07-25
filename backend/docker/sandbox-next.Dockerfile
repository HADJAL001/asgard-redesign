# ================================================================
# OSGARD · Преднастроенный образ песочницы для Next.js static-export
# ----------------------------------------------------------------
# Базовый тулчейн, который генерирует app-generator.ts (фикс-набор
# зависимостей static-export проекта), ставится ОДИН РАЗ на этапе
# сборки образа. Дальше сборка сгенерированного проекта = только
# `next build` поверх готовых node_modules — быстро и, главное,
# БЕЗ СЕТИ (--network none), т.к. качать из реестра больше нечего.
#
# Сборка образа (из каталога backend/):
#   docker build -f docker/sandbox-next.Dockerfile -t osgard-sandbox-next:latest .
#
# Версии зависимостей синхронны staticTemplateFiles() в
# services/app-generator.ts — при их изменении пересобрать образ.
# ================================================================
FROM node:20-slim

WORKDIR /app

# Ставим ровно те зависимости, что кладёт статический шаблон генератора.
RUN printf '%s' '{ \
  "name": "osgard-sandbox-base", \
  "version": "0.1.0", \
  "private": true, \
  "dependencies": { "next": "^14.2.0", "react": "^18.3.0", "react-dom": "^18.3.0" }, \
  "devDependencies": { \
    "typescript": "^5.7.0", "tailwindcss": "^3.4.0", "postcss": "^8.4.0", \
    "autoprefixer": "^10.4.0", "@types/node": "^22.0.0", \
    "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0" \
  } \
}' > package.json \
  && npm install --no-audit --no-fund \
  && npm cache clean --force

# Прогреваем SWC-бинарь Next.js, чтобы первый next build не подтягивал его в рантайме.
ENV NEXT_TELEMETRY_DISABLED=1
