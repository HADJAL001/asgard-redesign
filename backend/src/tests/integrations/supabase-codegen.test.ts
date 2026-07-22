import { test } from "node:test"
import assert from "node:assert/strict"
import { setupSupabase } from "../../services/integrations/supabase-codegen"

test("setupSupabase: без таблиц — только клиентские файлы", () => {
  const files = setupSupabase()
  const paths = files.map((f) => f.path)

  assert.deepEqual(paths, ["lib/supabase/client.ts", "lib/supabase/server.ts", ".env.local.example"])
})

test("setupSupabase: с таблицами — добавляет SQL-миграцию с RLS", () => {
  const files = setupSupabase({
    tables: [{ name: "todos", columns: [{ name: "title", type: "text", constraints: "not null" }] }],
  })
  const migration = files.find((f) => f.path === "supabase/migrations/0001_init.sql")

  assert.ok(migration, "миграция должна присутствовать при непустом tables")
  assert.match(migration!.content, /create table if not exists todos/)
  assert.match(migration!.content, /title text not null/)
  assert.match(migration!.content, /enable row level security/)
})
