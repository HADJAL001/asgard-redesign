import { BaseAgent } from "./base-agent"
import { ProjectSchemaSchema, type ProjectSchema, type Specification, type PipelineArtifactType } from "./types"

/* ================================================================
   OSGARD · Агент «Архитектор»
   ----------------------------------------------------------------
   Вход: Specification (от Бизнес-аналитика).
   Выход: ProjectSchema — структура папок, схема БД, API-эндпоинты,
   зависимости и список страниц, которые дальше читают Дизайнер
   (для DesignSystem) и Frontend-агент (для генерации кода).
   ================================================================ */

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "osgard-project"
}

export class ArchitectAgent extends BaseAgent<Specification, ProjectSchema> {
  readonly role = "Архитектор"
  readonly artifactType: PipelineArtifactType = "schema"
  readonly schema = ProjectSchemaSchema
  protected readonly maxTokens = 3072

  protected buildPrompt(spec: Specification): string {
    return `Ты — архитектор ПО в команде OSGARD. На основе спецификации проекта спроектируй
техническую схему: структуру папок, схему базы данных, REST API-эндпоинты, зависимости
и список страниц фронтенда.

Спецификация проекта (JSON):
${JSON.stringify(spec, null, 2)}

Верни СТРОГО валидный JSON (без markdown, без пояснений вне JSON) со структурой:
{
  "name": "slug-имя-проекта (латиница, дефисы)",
  "folderStructure": [
    { "path": "app/dashboard", "description": "назначение папки/файла" }
  ],
  "database": {
    "tables": [
      {
        "name": "имя_таблицы",
        "columns": [
          { "name": "id", "type": "integer", "primaryKey": true },
          { "name": "user_id", "type": "integer", "references": "users.id" }
        ]
      }
    ]
  },
  "apiEndpoints": [
    { "method": "GET", "path": "/api/resource", "description": "что делает эндпоинт" }
  ],
  "dependencies": [
    { "name": "next", "version": "^14.2.0", "purpose": "фреймворк приложения" }
  ],
  "pages": [
    { "route": "/", "name": "Главная", "description": "что на странице" }
  ]
}
Схема БД и API должны напрямую покрывать фичи из спецификации. Дай минимум 1 таблицу,
минимум 2 эндпоинта и минимум 2 страницы. Ответь только JSON.`
  }

  protected buildFallback(spec: Specification): ProjectSchema {
    const name = slugify(spec.projectName)

    return {
      name,
      folderStructure: [
        { path: "app/page.tsx", description: "Главная страница" },
        { path: "app/layout.tsx", description: "Корневой layout приложения" },
        { path: "components/", description: "Переиспользуемые UI-компоненты" },
        { path: "lib/", description: "Утилиты и клиенты API" },
      ],
      database: {
        tables: [
          {
            name: "users",
            columns: [
              { name: "id", type: "integer", primaryKey: true },
              { name: "email", type: "text" },
              { name: "created_at", type: "integer" },
            ],
          },
          {
            name: "items",
            columns: [
              { name: "id", type: "integer", primaryKey: true },
              { name: "user_id", type: "integer", references: "users.id" },
              { name: "title", type: "text" },
              { name: "created_at", type: "integer" },
            ],
          },
        ],
      },
      apiEndpoints: [
        { method: "GET", path: "/api/items", description: "Список элементов пользователя" },
        { method: "POST", path: "/api/items", description: "Создать новый элемент" },
      ],
      dependencies: [
        { name: "next", version: "^14.2.0", purpose: "фреймворк приложения" },
        { name: "react", version: "^18.3.0", purpose: "UI-библиотека" },
        { name: "tailwindcss", version: "^3.4.0", purpose: "стилизация" },
      ],
      pages: [
        { route: "/", name: "Главная", description: spec.summary },
        { route: "/dashboard", name: "Личный кабинет", description: "Основной рабочий экран пользователя" },
      ],
    }
  }
}
