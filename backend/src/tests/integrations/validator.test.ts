import { test } from "node:test"
import assert from "node:assert/strict"
import { validateProjectFiles } from "../../services/integrations/validator"

test("validateProjectFiles: пустое файловое дерево бросает ошибку", () => {
  assert.throws(() => validateProjectFiles([], "next"), /Файловое дерево пусто/)
})

test("validateProjectFiles: next без next.config.mjs бросает ошибку о недостающих файлах", () => {
  assert.throws(
    () => validateProjectFiles([{ path: "package.json", content: "{}" }], "next"),
    /Отсутствуют обязательные файлы для стека "next"/,
  )
})

test("validateProjectFiles: next с невалидным JSON в package.json бросает ошибку", () => {
  const files = [
    { path: "package.json", content: "{ not json" },
    { path: "next.config.mjs", content: "export default {}" },
  ]
  assert.throws(() => validateProjectFiles(files, "next"), /невалидный JSON/)
})

test("validateProjectFiles: next без скрипта build бросает ошибку", () => {
  const files = [
    { path: "package.json", content: JSON.stringify({ scripts: {} }) },
    { path: "next.config.mjs", content: "export default {}" },
  ]
  assert.throws(() => validateProjectFiles(files, "next"), /должен содержать скрипт "build"/)
})

test("validateProjectFiles: корректный next-проект проходит валидацию", () => {
  const files = [
    { path: "package.json", content: JSON.stringify({ scripts: { build: "next build" } }) },
    { path: "next.config.mjs", content: "export default {}" },
  ]
  assert.doesNotThrow(() => validateProjectFiles(files, "next"))
})

test("validateProjectFiles: static требует только index.html", () => {
  assert.doesNotThrow(() => validateProjectFiles([{ path: "index.html", content: "<html></html>" }], "static"))
})

test("validateProjectFiles: находит файлы по вложенному пути (app/package.json)", () => {
  const files = [
    { path: "app/package.json", content: JSON.stringify({ scripts: { build: "next build" } }) },
    { path: "app/next.config.mjs", content: "export default {}" },
  ]
  assert.doesNotThrow(() => validateProjectFiles(files, "next"))
})
