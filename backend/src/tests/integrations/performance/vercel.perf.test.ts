import { test } from "node:test"
import assert from "node:assert/strict"
import { deployToVercel } from "../../../services/integrations/vercel"
import type { FileTree } from "../../../types/file-tree"

/* ================================================================
   OSGARD · Vercel — замер длительности реального деплоя
   ----------------------------------------------------------------
   Как и e2e/vercel.e2e.test.ts, бьёт по НАСТОЯЩЕМУ Vercel API — только
   вручную/в CI с VERCEL_TOKEN. Порог в 10с — ориентировочный (реальная
   готовность деплоя на Vercel обычно занимает больше, см. POLL_INTERVAL_MS
   и READY_TIMEOUT_MS в vercel.ts), поэтому это не hard gate для CI, а
   диагностический сигнал через console.log при регрессии.
   ================================================================ */

test("длительность деплоя на Vercel логируется и не превышает разумный порог", async (t) => {
  if (!process.env.VERCEL_TOKEN) {
    t.skip("VERCEL_TOKEN не задан — пропускаем перф-тест реального деплоя")
    return
  }

  const files: FileTree = [{ path: "index.html", content: "<html><body>perf test</body></html>" }]

  const start = Date.now()
  const url = await deployToVercel(files, "osgard-perf-test", { force: true })
  const duration = Date.now() - start

  console.log(`[perf] Vercel deploy took ${duration}ms -> ${url}`)
  assert.ok(duration < 5 * 60 * 1000, "деплой не должен упираться в READY_TIMEOUT_MS (5 мин)")
})
