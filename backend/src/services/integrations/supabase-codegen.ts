import type { FileTree } from "../../types/file-tree"

/* ================================================================
   OSGARD · Supabase Setup Codegen
   ----------------------------------------------------------------
   НЕ вызывает Supabase Management API и не создаёт реальный проект —
   генерирует файлы клиента + опциональную SQL-миграцию для встраивания
   ВНУТРЬ сгенерированного пользователем Next.js-приложения. Реальный
   проект пользователь создаёт сам на supabase.com и вставляет ключи
   в .env.local по инструкции из сгенерированного .env.local.example.

   Пример вызова:
     const files = setupSupabase({
       tables: [{ name: "todos", columns: [{ name: "title", type: "text" }] }],
     })
   ================================================================ */

export type SupabaseColumn = {
  name: string
  type: string
  constraints?: string
}

export type SupabaseTable = {
  name: string
  columns: SupabaseColumn[]
}

export type SupabaseSetupOptions = {
  tables?: SupabaseTable[]
}

function columnToSql(column: SupabaseColumn): string {
  return `  ${column.name} ${column.type}${column.constraints ? ` ${column.constraints}` : ""}`
}

function tableToSql(table: SupabaseTable): string {
  const columns = [
    "  id uuid primary key default gen_random_uuid()",
    "  created_at timestamptz not null default now()",
    ...table.columns.map(columnToSql),
  ]

  return `create table if not exists ${table.name} (\n${columns.join(",\n")}\n);\n\nalter table ${table.name} enable row level security;\n`
}

export function setupSupabase(options: SupabaseSetupOptions = {}): FileTree {
  const { tables = [] } = options

  const clientBrowser = `import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
`

  const clientServer = `import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
}
`

  const envExample = `NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
`

  const files: FileTree = [
    { path: "lib/supabase/client.ts", content: clientBrowser },
    { path: "lib/supabase/server.ts", content: clientServer },
    { path: ".env.local.example", content: envExample },
  ]

  if (tables.length > 0) {
    const migrationSql = tables.map(tableToSql).join("\n")
    files.push({ path: "supabase/migrations/0001_init.sql", content: migrationSql })
  }

  return files
}
