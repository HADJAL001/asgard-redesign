import { buildNextFullstackApp } from "../src/services/sandbox.service"
import { SCAFFOLD_DEPENDENCIES, SCAFFOLD_DEV_DEPENDENCIES } from "../src/lib/app-scaffold-deps"
import { FULLSTACK_DEPENDENCIES } from "../src/lib/app-profiles"

/* ================================================================
   Гейт волны DB-A: fullstack-приложение РЕАЛЬНО собирается.

   Проверяется фактом, а не рассуждением: минимальный набор с
   серверным роутом, серверным клиентом Supabase (next/headers) и
   next.config.js БЕЗ output:"export" уходит в настоящий
   `npm install && next build` в изолированном контейнере.

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
        devDependencies: SCAFFOLD_DEV_DEPENDENCIES,
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
  {
    path: "lib/supabase/server.ts",
    content: `import { cookies } from "next/headers"
import { createServerClient as createClient } from "@supabase/ssr"

export function createServerClient() {
  const store = cookies()
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-key",
    {
      cookies: {
        get: (name: string) => store.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )
}
`,
  },
  {
    path: "lib/supabase/client.ts",
    content: `import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-key",
  )
}
`,
  },
  {
    path: "app/api/notes/route.ts",
    content: `import { createServerClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase.from("notes").select("*").limit(20)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ notes: data ?? [] })
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string }
  const supabase = createServerClient()
  const { data, error } = await supabase.from("notes").insert({ title: body.title ?? "Без названия" }).select()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ note: data?.[0] ?? null }, { status: 201 })
}
`,
  },
  {
    path: "app/page.tsx",
    content: `import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = createServerClient()
  const { data } = await supabase.from("notes").select("title").limit(5)

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Заметки</h1>
      <ul className="mt-4 space-y-2">
        {(data ?? []).map((note: { title: string }, i: number) => (
          <li key={i}>{note.title}</li>
        ))}
      </ul>
    </main>
  )
}
`,
  },
]

async function main() {
  console.log(`[gate] fullstack-набор: ${files.length} файлов, реальная сборка в Docker`)
  const started = Date.now()
  const result = await buildNextFullstackApp(files, { logLabel: "gate-fullstack" })

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
