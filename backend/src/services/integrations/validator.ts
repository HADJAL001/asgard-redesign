import type { FileTree } from "../../types/file-tree"

/* ================================================================
   OSGARD · Валидация файлового дерева перед деплоем
   ----------------------------------------------------------------
   Чистая проверка (без сети/ФС) — ловит очевидно неполные проекты
   ДО похода к Vercel/GitHub, а не после платного/медленного вызова.
   ================================================================ */

export type ProjectStack = "next" | "react" | "node" | "static"

const REQUIRED_FILES: Record<ProjectStack, string[]> = {
  next: ["package.json", "next.config.mjs"],
  react: ["package.json", "index.html"],
  node: ["package.json"],
  static: ["index.html"],
}

function findFile(files: FileTree, path: string) {
  return files.find((f) => f.path === path || f.path.endsWith(`/${path}`))
}

/** Бросает Error с человекочитаемым описанием первой найденной проблемы. */
export function validateProjectFiles(files: FileTree, stack: ProjectStack): void {
  if (files.length === 0) {
    throw new Error("Файловое дерево пусто")
  }

  const required = REQUIRED_FILES[stack]
  const missing = required.filter((path) => !findFile(files, path))
  if (missing.length > 0) {
    throw new Error(`Отсутствуют обязательные файлы для стека "${stack}": ${missing.join(", ")}`)
  }

  if (stack === "next" || stack === "node") {
    const pkgFile = findFile(files, "package.json")
    if (pkgFile) {
      let pkg: { scripts?: Record<string, string> }
      try {
        pkg = JSON.parse(pkgFile.content)
      } catch {
        throw new Error("package.json содержит невалидный JSON")
      }
      if (!pkg.scripts?.build && stack === "next") {
        throw new Error('package.json должен содержать скрипт "build"')
      }
    }
  }
}
