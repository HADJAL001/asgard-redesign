import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { buildNextFullstackApp } from "../src/services/sandbox.service"
import { SCAFFOLD_DEPENDENCIES, SCAFFOLD_DEV_DEPENDENCIES } from "../src/lib/app-scaffold-deps"
import { FULLSTACK_DEPENDENCIES, FULLSTACK_DEV_DEPENDENCIES } from "../src/lib/app-profiles"

const execFileAsync = promisify(execFile)

/* ================================================================
   Гейт волны DB-A: fullstack-приложение РЕАЛЬНО собирается.

   Проверяется фактом, а не рассуждением: минимальный набор с
   серверным роутом, платформенным модулем доступа к базе (`lib/db.ts`
   на драйвере `pg`) и next.config.js БЕЗ output:"export" уходит в
   настоящий `npm install && next build` в изолированном контейнере.

   Сборка идёт БЕЗ доступной базы (в контейнере `--network none`), и это
   осознанно: `next build` не должен требовать живого Postgres — иначе
   сборка приложения оказалась бы завязана на рантайм. Страница и роут
   поэтому переносят ошибку подключения, а не падают на ней.

   Запуск (из backend/): npx tsx scripts/verify-fullstack-build.ts
   Требует поднятого Docker. Ничего в БД не пишет.
   ================================================================ */

const files = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "fullstack-gate",
        version: "0.1.0",
        private: true,
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { ...SCAFFOLD_DEPENDENCIES, ...FULLSTACK_DEPENDENCIES },
        devDependencies: { ...SCAFFOLD_DEV_DEPENDENCIES, ...FULLSTACK_DEV_DEPENDENCIES },
      },
      null,
      2,
    ),
  },
  {
    path: "next.config.js",
    content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
`,
  },
  {
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "es2017",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
  },
  { path: "postcss.config.js", content: `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }\n` },
  {
    path: "tailwind.config.ts",
    content: `import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}

export default config
`,
  },
  { path: "app/globals.css", content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n" },
  {
    path: "app/layout.tsx",
    content: `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = { title: "Fullstack Gate", description: "Проверка сборки" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
`,
  },
  /* Ровно тот модуль доступа к базе, который платформа вписывает в fullstack-набор
     сама (app-generator, DB_MODULE_PATH). Гейт обязан собирать то же, что уедет
     пользователю, иначе он доказывает сборку постороннего кода. */
  {
    path: "lib/db.ts",
    content: `import { Pool } from "pg"

declare global {
  var __osgardPool: Pool | undefined
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL не задан: строку подключения выдаёт платформа OSGARD")
  }
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

export function getPool(): Pool {
  if (!global.__osgardPool) global.__osgardPool = createPool()
  return global.__osgardPool
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params)
  return result.rows as T[]
}
`,
  },
  {
    path: "db/schema.sql",
    content: `CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  },
  {
    path: "app/api/notes/route.ts",
    content: `import { query } from "@/lib/db"

export async function GET() {
  try {
    const notes = await query<{ id: number; title: string }>("SELECT id, title FROM notes ORDER BY id DESC LIMIT 20")
    return Response.json({ notes })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string }
  try {
    const rows = await query<{ id: number; title: string }>(
      "INSERT INTO notes (title) VALUES ($1) RETURNING id, title",
      [body.title ?? "Без названия"],
    )
    return Response.json({ note: rows[0] ?? null }, { status: 201 })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
`,
  },
  {
    path: "app/page.tsx",
    content: `import { query } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function Page() {
  let notes: Array<{ title: string }> = []
  try {
    notes = await query<{ title: string }>("SELECT title FROM notes ORDER BY id DESC LIMIT 5")
  } catch {
    notes = []
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Заметки</h1>
      <ul className="mt-4 space-y-2">
        {notes.map((note, i) => (
          <li key={i}>{note.title}</li>
        ))}
      </ul>
    </main>
  )
}
`,
  },
]

/**
 * Сборка того же набора БЕЗ Docker — на случай, когда демон не поднимается
 * (на dev-машинах это бывает). Изоляции здесь нет и не заявляется: набор
 * собирается в каталоге вне репозитория обычным `npm install && next build`.
 *
 * Что этот режим доказывает: набор файлов действительно собирается, серверный
 * роут попадает в сборку, статического экспорта нет.
 * Чего он НЕ доказывает: работу самой песочницы (`--network none`, лимиты,
 * `docker cp`). Поэтому он именно резервный, а не замена основному пути, и
 * говорит об этом вслух в выводе.
 */
async function buildLocally(): Promise<{ ok: boolean; logs: string; durationMs: number; timedOut: boolean }> {
  const os = await import("node:os")
  const fs = await import("node:fs/promises")
  const path = await import("node:path")

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "osgard-fullstack-gate-"))
  console.log(`[gate] РЕЗЕРВНЫЙ режим без Docker (изоляции нет): ${dir}`)

  for (const file of files) {
    const target = path.join(dir, file.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content, "utf8")
  }

  const started = Date.now()
  let logs = ""
  let ok = false
  try {
    const install = await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: dir,
      maxBuffer: 32 * 1024 * 1024,
      shell: true,
    })
    logs += install.stdout + install.stderr

    const build = await execFileAsync("npx", ["next", "build"], {
      cwd: dir,
      maxBuffer: 32 * 1024 * 1024,
      shell: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    })
    logs += build.stdout + build.stderr
    ok = true
  } catch (err: any) {
    logs += String(err?.stdout ?? "") + String(err?.stderr ?? "") + `\n${err?.message ?? err}`
  }

  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  return { ok, logs, durationMs: Date.now() - started, timedOut: false }
}

async function main() {
  const local = process.env.GATE_LOCAL_BUILD === "1"
  console.log(
    `[gate] fullstack-набор: ${files.length} файлов, реальная сборка ${local ? "локально (без Docker)" : "в Docker"}`,
  )
  const started = Date.now()
  const result = local ? await buildLocally() : await buildNextFullstackApp(files, { logLabel: "gate-fullstack" })

  const seconds = Math.round(result.durationMs / 1000)
  console.log(`\n[gate] ok=${result.ok} timedOut=${result.timedOut} ${seconds}с`)
  console.log("---- хвост лога сборки ----")
  console.log(result.logs.slice(-3000))
  console.log("---- конец лога ----")

  /* Признаки, что собралось именно то, что нужно: серверный роут попал в сборку,
     и это НЕ статический экспорт. Иначе «ok:true» мог бы значить что угодно. */
  const hasApiRoute = /\/api\/notes/.test(result.logs)
  const isStaticExport = /Export successful|output: export/i.test(result.logs)
  console.log(`[gate] серверный роут в выводе сборки: ${hasApiRoute}`)
  console.log(`[gate] признаки статического экспорта: ${isStaticExport} (ожидается false)`)
  console.log(`[gate] прошло ${Date.now() - started}мс`)

  process.exit(result.ok && hasApiRoute && !isStaticExport ? 0 : 1)
}

void main()
