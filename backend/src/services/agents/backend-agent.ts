import { BaseAgent, generateFileSet, schemaSummary } from "./base-agent"
import type { BackendAgentInput, BackendArtifact, GeneratedFile, ProjectSchema, SchemaField } from "./types"

/* ================================================================
   OSGARD · BackendAgent
   ----------------------------------------------------------------
   Вход: ProjectSchema (сущности + требования к авторизации) и
   FrontendArtifact (список файлов фронтенда — нужен только для
   согласования путей/названий, само содержимое не переиспользуется).
   Выход: BackendArtifact — REST API на Node.js/Express + better-sqlite3
   (без ORM, чистый параметризованный SQL — тот же стек, что и у
   остального бэкенда OSGARD) + JWT-авторизация (jsonwebtoken + bcryptjs).
   ================================================================ */

const PATH_PATTERN = /^(server\.ts|db\/[\w\-]+\.(sql|ts)|middleware\/[\w\-]+\.ts|routes\/[\w\-]+\.ts)$/

function buildManifestPrompt(input: BackendAgentInput): string {
  const { schema } = input
  const authRequired = !!schema.auth?.required

  return `Ты — Backend-разработчик в мультиагентном пайплайне генерации проектов OSGARD.
Дана схема данных проекта "${schema.name}" (${schema.description}):
${schemaSummary(schema)}
${authRequired ? `Требуется JWT-авторизация. Роли: ${(schema.auth?.roles || ["user"]).join(", ")}.` : "Авторизация не требуется."}

Спроектируй REST API на Node.js + Express + better-sqlite3 (без ORM, чистый параметризованный SQL) + TypeScript.

Верни СТРОГО валидный JSON (без markdown, без пояснений) вида:
{
  "files": [
    { "path": "server.ts", "purpose": "точка входа Express-приложения" },
    { "path": "db/schema.sql", "purpose": "SQL DDL для всех сущностей" },
    { "path": "routes/<entity>.ts", "purpose": "CRUD-роуты для сущности <entity>" }
  ]
}
Требования:
- От 3 до 10 файлов, обязательно включи "server.ts" и "db/schema.sql".
- ${authRequired ? 'Обязательно включи "middleware/auth.ts" (проверка JWT) и "routes/auth.ts" (register/login).' : "Middleware авторизации не нужен."}
- По одному файлу routes/<entity>.ts на каждую сущность схемы (имя файла — snake/kebab-case имени сущности).
Ответь только JSON.`
}

function buildFilePrompt(input: BackendAgentInput, manifest: { path: string; purpose: string }[], entry: { path: string; purpose: string }): string {
  const { schema } = input
  const authRequired = !!schema.auth?.required
  const fileList = manifest.map((f) => `- ${f.path}: ${f.purpose}`).join("\n")

  return `Ты пишешь исходный код backend-файла для REST API проекта "${schema.name}" на Node.js + Express 4 + better-sqlite3 + TypeScript.

Схема данных:
${schemaSummary(schema)}
${authRequired ? `JWT-авторизация обязательна (jsonwebtoken + bcryptjs), роли: ${(schema.auth?.roles || ["user"]).join(", ")}.` : ""}

Полный список файлов бэкенда (для согласованности импортов между ними):
${fileList}

Сейчас напиши ПОЛНОЕ содержимое файла "${entry.path}" (${entry.purpose}).

Требования:
- Валидный TypeScript, Express 4.x, better-sqlite3 (синхронный API — db.prepare(...).run/get/all, без async на самих запросах).
- Импорты между файлами — относительные, строго по путям из списка выше.
- Пароли — только через bcryptjs.hash/compare, никогда в открытом виде.
- SQL — ТОЛЬКО параметризованные запросы (db.prepare(sql).run(param)), никакой конкатенации пользовательского ввода в SQL-строку.
- JWT — jsonwebtoken, секрет из process.env.JWT_SECRET, никогда не хардкодь секрет.
- Верни ТОЛЬКО код в одном \`\`\`ts (или \`\`\`sql для .sql файлов) блоке, без пояснений до или после.`
}

function sqlType(fieldType: string): string {
  const t = fieldType.toLowerCase()
  if (["number", "int", "integer", "float", "double"].includes(t)) return "REAL"
  if (["boolean", "bool"].includes(t)) return "INTEGER"
  return "TEXT"
}

function entitySlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function fallbackSchemaSql(schema: ProjectSchema): string {
  const authRequired = !!schema.auth?.required
  const userTable = authRequired
    ? `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '${(schema.auth?.roles || ["user"])[0]}',
  created_at INTEGER NOT NULL
);\n\n`
    : ""

  const entityTables = schema.entities
    .map((entity) => {
      const table = entitySlug(entity.name)
      const columns = entity.fields
        .map((f: SchemaField) => `  ${entitySlug(f.name)} ${sqlType(f.type)}${f.required ? " NOT NULL" : ""}${f.unique ? " UNIQUE" : ""}`)
        .join(",\n")
      return `CREATE TABLE IF NOT EXISTS ${table} (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n${columns}${columns ? "," : ""}\n  created_at INTEGER NOT NULL\n);`
    })
    .join("\n\n")

  return userTable + entityTables + "\n"
}

function fallbackAuthMiddleware(): string {
  return `import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || ""

export interface AuthedRequest extends Request {
  userId?: number
  role?: string
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token || !JWT_SECRET) {
    res.status(401).json({ error: "unauthorized" })
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }
    req.userId = payload.userId
    req.role = payload.role
    next()
  } catch {
    res.status(401).json({ error: "invalid_token" })
  }
}
`
}

function fallbackAuthRoutes(schema: ProjectSchema): string {
  const defaultRole = (schema.auth?.roles || ["user"])[0]
  return `import { Router } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import db from "../db/database"

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || ""

router.post("/register", async (req, res) => {
  const { email, password } = req.body || {}
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "invalid_input" })
    return
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email)
  if (existing) {
    res.status(409).json({ error: "email_taken" })
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const info = db
    .prepare("INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)")
    .run(email, passwordHash, "${defaultRole}", Date.now())

  res.status(201).json({ id: info.lastInsertRowid })
})

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {}
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "invalid_input" })
    return
  }

  const user = db.prepare("SELECT id, password_hash, role FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string; role: string }
    | undefined
  if (!user || !JWT_SECRET) {
    res.status(401).json({ error: "invalid_credentials" })
    return
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    res.status(401).json({ error: "invalid_credentials" })
    return
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" })
  res.json({ token })
})

export default router
`
}

function fallbackEntityRoutes(entity: ProjectSchema["entities"][number], authRequired: boolean): string {
  const table = entitySlug(entity.name)
  const writableFields = entity.fields.map((f) => entitySlug(f.name))
  const columns = ["id", ...writableFields, "created_at"].join(", ")
  const placeholders = writableFields.map(() => "?").join(", ")
  const insertColumns = writableFields.join(", ")

  const authImport = authRequired ? `import { requireAuth } from "../middleware/auth"\n` : ""
  const authGuard = authRequired ? ", requireAuth" : ""

  return `import { Router } from "express"
${authImport}import db from "../db/database"

const router = Router()

router.get("/"${authGuard}, (req, res) => {
  const rows = db.prepare("SELECT ${columns} FROM ${table} ORDER BY id DESC").all()
  res.json(rows)
})

router.get("/:id"${authGuard}, (req, res) => {
  const row = db.prepare("SELECT ${columns} FROM ${table} WHERE id = ?").get(req.params.id)
  if (!row) {
    res.status(404).json({ error: "not_found" })
    return
  }
  res.json(row)
})

router.post("/"${authGuard}, (req, res) => {
  const body = req.body || {}
  const values = [${writableFields.map((f) => `body.${f}`).join(", ")}]
  const info = db
    .prepare("INSERT INTO ${table} (${insertColumns}, created_at) VALUES (${placeholders}, ?)")
    .run(...values, Date.now())
  res.status(201).json({ id: info.lastInsertRowid })
})

router.put("/:id"${authGuard}, (req, res) => {
  const body = req.body || {}
  const values = [${writableFields.map((f) => `body.${f}`).join(", ")}]
  db.prepare("UPDATE ${table} SET ${writableFields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?").run(...values, req.params.id)
  res.json({ ok: true })
})

router.delete("/:id"${authGuard}, (req, res) => {
  db.prepare("DELETE FROM ${table} WHERE id = ?").run(req.params.id)
  res.status(204).end()
})

export default router
`
}

function fallbackServer(schema: ProjectSchema): string {
  const authRequired = !!schema.auth?.required
  const routeImports = schema.entities
    .map((e) => `import ${entitySlug(e.name)}Router from "./routes/${entitySlug(e.name)}"`)
    .join("\n")
  const routeMounts = schema.entities
    .map((e) => `app.use("/api/${entitySlug(e.name)}", ${entitySlug(e.name)}Router)`)
    .join("\n")
  const authImport = authRequired ? `import authRouter from "./routes/auth"\n` : ""
  const authMount = authRequired ? `app.use("/api/auth", authRouter)\n` : ""

  return `import express from "express"
${authImport}${routeImports}

const app = express()
app.use(express.json())

${authMount}${routeMounts}

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(\`${schema.name} backend listening on :\${PORT}\`)
})

export default app
`
}

function fallbackBackendFiles(schema: ProjectSchema): GeneratedFile[] {
  const authRequired = !!schema.auth?.required
  const files: GeneratedFile[] = [
    { path: "server.ts", content: fallbackServer(schema) },
    { path: "db/schema.sql", content: fallbackSchemaSql(schema) },
  ]

  if (authRequired) {
    files.push({ path: "middleware/auth.ts", content: fallbackAuthMiddleware() })
    files.push({ path: "routes/auth.ts", content: fallbackAuthRoutes(schema) })
  }

  for (const entity of schema.entities) {
    files.push({ path: `routes/${entitySlug(entity.name)}.ts`, content: fallbackEntityRoutes(entity, authRequired) })
  }

  return files
}

export class BackendAgent extends BaseAgent<BackendAgentInput, BackendArtifact> {
  readonly name = "backend"

  async execute(input: BackendAgentInput): Promise<BackendArtifact> {
    const files = await generateFileSet({
      manifestPrompt: buildManifestPrompt(input),
      maxEntries: 10,
      pathPattern: PATH_PATTERN,
      filePrompt: (entry, manifest) => buildFilePrompt(input, manifest, entry),
      fileMaxTokens: 6000,
      logLabel: "backend-agent",
    })

    if (files) return { type: "backend", files, source: "ai" }
    return { type: "backend", files: fallbackBackendFiles(input.schema), source: "fallback" }
  }
}
