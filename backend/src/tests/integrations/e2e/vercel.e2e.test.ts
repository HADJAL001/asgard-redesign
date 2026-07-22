import { test } from "node:test"
import assert from "node:assert/strict"
import { deployToVercel } from "../../../services/integrations/vercel"
import type { FileTree } from "../../../types/file-tree"

/* ================================================================
   OSGARD · Vercel — реальный E2E-деплой
   ----------------------------------------------------------------
   В отличие от vercel.test.ts (мок fetch), этот тест бьёт по НАСТОЯЩЕМУ
   Vercel API и создаёт настоящий деплой. Запускается только вручную/в
   CI с секретами — если VERCEL_TOKEN не задан, тест пропускается, а не
   падает, чтобы не ломать обычный `npm test`.
   ================================================================ */

test("реальный деплой минимального проекта на Vercel", async (t) => {
  if (!process.env.VERCEL_TOKEN) {
    t.skip("VERCEL_TOKEN не задан — пропускаем E2E-тест реального деплоя")
    return
  }

  const files: FileTree = [{ path: "index.html", content: "<html><body>Hello E2E</body></html>" }]

  const url = await deployToVercel(files, "osgard-e2e-test", { force: true })
  assert.match(url, /^https:\/\/.*\.vercel\.app$/)
})
