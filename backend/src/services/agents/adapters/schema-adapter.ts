import type { ProjectSchema as UpstreamProjectSchema } from "../../../agents/types"
import type { ProjectSchema, SchemaEntity, SchemaField } from "../types"

/* ================================================================
   OSGARD · Адаптер ProjectSchema (Клод #2 → Клод #3)
   ----------------------------------------------------------------
   У ArchitectAgent (backend/src/agents/types.ts) ProjectSchema — это
   { name, folderStructure, database: { tables }, apiEndpoints,
   dependencies, pages }, БЕЗ полей description/entities/auth.
   У BackendAgent/OptimizerAgent/SecurityAgent (этот модуль) —
   { name, description, entities, auth? }. Это два разных контракта
   с одинаковым именем типа, не взаимозаменяемые напрямую — отсюда
   адаптер, а не приведение типов.

   Таблицу "users"/"user" не переносим в entities, если авторизация
   обнаружена: её создаёт и обслуживает сам BackendAgent (см.
   fallbackAuthMiddleware/fallbackAuthRoutes/fallbackSchemaSql), со
   своим набором колонок (email, password_hash, role) — перенос чужой
   users-таблицы 1:1 привёл бы к конфликту двух CREATE TABLE users.
   ================================================================ */

type UpstreamTable = UpstreamProjectSchema["database"]["tables"][number]
type UpstreamColumn = UpstreamTable["columns"][number]

const AUTH_TABLE_NAMES = new Set(["user", "users"])
const AUTO_MANAGED_COLUMNS = new Set(["id", "created_at", "updated_at"])

function detectAuthRequired(schema: UpstreamProjectSchema): boolean {
  const hasUserTable = schema.database.tables.some((t) => AUTH_TABLE_NAMES.has(t.name.toLowerCase()))
  const hasAuthEndpoint = schema.apiEndpoints.some((e) => /\/(auth|login|register|signin|signup)\b/i.test(e.path))
  return hasUserTable || hasAuthEndpoint
}

function toSchemaField(column: UpstreamColumn): SchemaField | null {
  if (column.primaryKey) return null
  if (AUTO_MANAGED_COLUMNS.has(column.name.toLowerCase())) return null

  return {
    name: column.name,
    type: column.type,
    required: column.nullable !== true,
  }
}

function toSchemaEntity(table: UpstreamTable): SchemaEntity {
  return {
    name: table.name,
    fields: table.columns.map(toSchemaField).filter((f): f is SchemaField => f !== null),
  }
}

/** Приводит выход ArchitectAgent (Клод #2) к ProjectSchema, который ожидают агенты этого модуля. */
export function adaptProjectSchema(upstream: UpstreamProjectSchema): ProjectSchema {
  const authRequired = detectAuthRequired(upstream)

  const entities = upstream.database.tables
    .filter((t) => !(authRequired && AUTH_TABLE_NAMES.has(t.name.toLowerCase())))
    .map(toSchemaEntity)
    .filter((e) => e.fields.length > 0)

  return {
    name: upstream.name,
    description: `Схема из ${upstream.database.tables.length} таблиц и ${upstream.apiEndpoints.length} API-эндпоинтов (ArchitectAgent).`,
    entities,
    auth: { required: authRequired, roles: authRequired ? ["user"] : undefined },
  }
}
