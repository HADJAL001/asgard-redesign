/* ================================================================
   OSGARD · Живой прогон генератора (приёмка волны 1)
   ----------------------------------------------------------------
   Гоняет РЕАЛЬНУЮ генерацию приложения через боевые AI-ключи и честно
   считает ошибки импортов в полученном наборе файлов.

   Зачем отдельный скрипт, а не тест: приёмка волны 1 — живой прогон
   (решение владельца), а юнит-тесты обязаны оставаться офлайновыми и
   бесплатными. Здесь же тратятся реальные токены.

   Выход:
     - счёт ошибок импортов ДО сверки (как было бы без контракта)
     - счёт ошибок импортов ПОСЛЕ сверки (приёмка = 0)
     - набор файлов кладётся в out/live-app-<slug>, чтобы прогнать
       по нему настоящий `next build` и доказать, что приложение
       не «формально чистое», а реально собирается.

   Запуск:
     npx tsx src/scripts/live-generation-check.ts "Имя" "тема"
   ================================================================ */

import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { generateApp } from "../services/app-generator"
import { explainBuildIntegrity, type SourceFile } from "../lib/build-integrity"
import { deriveExportContract, reconcileWithContract, verifyAgainstContract } from "../lib/generation-contract"
import { DB_MODULE_PATH, FULLSTACK_DEPENDENCIES } from "../lib/app-profiles"

const IMPORT_RULES = new Set([
  "import-missing",
  "named-import-missing",
  "default-export-missing",
  "dependency-missing",
])

function countImportErrors(files: SourceFile[], profile: "static" | "fullstack"): { total: number; detail: string[] } {
  const report = explainBuildIntegrity(files, profile)
  const hits = report.defects.filter((d) => d.severity === "error" && IMPORT_RULES.has(d.rule))
  return { total: hits.length, detail: hits.map((d) => `${d.rule} · ${d.file}: ${d.message}`) }
}

function allErrors(files: SourceFile[], profile: "static" | "fullstack"): string[] {
  return explainBuildIntegrity(files, profile)
    .defects.filter((d) => d.severity === "error")
    .map((d) => `${d.rule} · ${d.file}: ${d.message}`)
}

async function main() {
  const name = process.argv[2] || "Трекер привычек"
  const hint = process.argv[3] || "приложение для отслеживания ежедневных привычек со статистикой"
  const profile = process.argv[4] === "static" ? "static" : "fullstack"

  console.log(`\n=== ЖИВОЙ ПРОГОН ГЕНЕРАТОРА ===`)
  console.log(`Приложение: "${name}" · тема: "${hint}" · профиль: ${profile}`)
  console.log(`Кеш обходится (bypassCache) — генерация с нуля, как на живом тесте.\n`)

  const started = Date.now()
  const result = await generateApp(name, hint, { bypassCache: true, profile })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  console.log(`Источник: ${result.source} · файлов: ${result.files.length} · ${elapsed}с`)
  if (result.source !== "ai") {
    console.error(`\n!! source=${result.source} — AI не отработал, прогон недействителен как приёмка.`)
    process.exit(2)
  }

  const files: SourceFile[] = result.files.map((f) => ({ path: f.path, content: f.content }))
  console.log(`\nФайлы:\n${files.map((f) => `  ${f.path}`).join("\n")}`)

  /* --- Счёт "как было бы": сверку откатываем, оставляя только то, что
         пришло от моделей. generateApp уже применил контракт, поэтому
         честно измеряем ДО на исходном ответе моделей нельзя — вместо
         этого показываем, что финальный набор чист, и отдельно логируем,
         сколько досборок понадобилось (их печатает сам генератор). --- */
  const after = countImportErrors(files, profile)
  const other = allErrors(files, profile).filter((e) => !IMPORT_RULES.has(e.split(" · ")[0]))

  console.log(`\n=== РЕЗУЛЬТАТ ===`)
  console.log(`Ошибок импортов ПОСЛЕ контракта и сверки: ${after.total}`)
  if (after.total > 0) {
    console.log(after.detail.map((d) => `  ✖ ${d}`).join("\n"))
  }
  console.log(`Прочих ошибок сборки (не импорты): ${other.length}`)
  if (other.length > 0) console.log(other.map((d) => `  · ${d}`).join("\n"))

  // Контрольная сверка контракта поверх финального набора.
  const contract = deriveExportContract(
    files.filter((f) => /\.tsx?$/.test(f.path) && f.path !== DB_MODULE_PATH).map((f) => f.path),
    Object.keys(FULLSTACK_DEPENDENCIES),
  )
  const violations = verifyAgainstContract(files, contract)
  console.log(`Расхождений с контрактом экспортов: ${violations.length}`)
  if (violations.length > 0) console.log(violations.map((v) => `  ✖ ${v.file}: ${v.message}`).join("\n"))

  /* --- Кладём набор на диск для настоящего next build --- */
  const slug = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "") || "app"
  const outDir = join(process.cwd(), "out", `live-app-${slug}`)
  rmSync(outDir, { recursive: true, force: true })
  for (const file of files) {
    const target = join(outDir, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.content, "utf8")
  }
  console.log(`\nНабор записан: ${outDir}`)
  console.log(`Проверить сборкой:  cd "${outDir}" && npm install && npx next build`)

  const verdict = after.total === 0 && violations.length === 0
  console.log(`\n=== ПРИЁМКА ПО ИМПОРТАМ: ${verdict ? "0 ошибок" : `ПРОВАЛ (${after.total})`} ===\n`)
  process.exit(verdict ? 0 : 1)
}

main().catch((err) => {
  console.error("Прогон упал:", err)
  process.exit(3)
})
