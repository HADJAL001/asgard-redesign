import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  PREBAKED_NEXT_IMAGE,
  isDockerAvailable,
  isPrebakedImageAvailable,
} from "../services/sandbox.service"
import { DOCKERFILE_PATH, renderSandboxDockerfile, scaffoldDepsFingerprint } from "../lib/app-scaffold-deps"

/* ================================================================
   OSGARD · Сборка образа песочницы (кэш node_modules для сборок)
   ----------------------------------------------------------------
   Запуск:  npm run sandbox:image          (собрать, если нужно)
            npm run sandbox:image -- --force   (пересобрать всегда)
            npm run sandbox:image -- --write-only  (только обновить Dockerfile)

   Что делает:
   1. Генерирует docker/sandbox-next.Dockerfile из lib/app-scaffold-deps —
      единственного источника набора зависимостей каркаса.
   2. Собирает образ и помечает его отпечатком набора (LABEL), по которому
      песочница потом решает, годен ли кэш.

   Идемпотентен: если образ уже помечен текущим отпечатком, ничего не делает
   (`docker build` тоже дёшев из-за слоёв, но лишние минуты npm install под
   Docker Desktop на Windows стоят дорого — проверяем метку заранее).

   Скрипт нужен ровно потому, что кэш «был, но его не было»: образ собирался
   один раз руками в июле, набор зависимостей с тех пор менялся, и никакой
   команды «привести кэш в соответствие» в платформе не существовало.
   ================================================================ */

const execFileAsync = promisify(execFile)

async function writeDockerfile(): Promise<string> {
  const target = path.resolve(process.cwd(), DOCKERFILE_PATH)
  const content = renderSandboxDockerfile()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, "utf-8")
  return target
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const writeOnly = args.includes("--write-only")
  const fingerprint = scaffoldDepsFingerprint()

  const dockerfile = await writeDockerfile()
  console.log(`[sandbox:image] Dockerfile обновлён: ${dockerfile}`)
  console.log(`[sandbox:image] отпечаток набора зависимостей: ${fingerprint}`)

  if (writeOnly) return

  if (!(await isDockerAvailable())) {
    console.error("[sandbox:image] Docker-демон недоступен — запусти Docker Desktop и повтори")
    process.exitCode = 1
    return
  }

  if (!force && (await isPrebakedImageAvailable())) {
    console.log(`[sandbox:image] образ ${PREBAKED_NEXT_IMAGE} уже соответствует набору — пересборка не нужна`)
    return
  }

  /* Контекст сборки нарочно пустой: Dockerfile самодостаточен (package.json
     печатается внутрь), так что незачем отправлять демону весь backend/. */
  const emptyContext = await fs.mkdtemp(path.join(os.tmpdir(), "osgard-img-ctx-"))
  const started = Date.now()
  try {
    console.log(`[sandbox:image] сборка ${PREBAKED_NEXT_IMAGE} — npm install внутри образа, это может занять минуты…`)
    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["build", "-f", dockerfile, "-t", PREBAKED_NEXT_IMAGE, emptyContext],
      { timeout: 25 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 },
    )
    const tail = [stdout, stderr].filter(Boolean).join("\n").trim().split("\n").slice(-6).join("\n")
    console.log(tail)
    console.log(`[sandbox:image] готово за ${Math.round((Date.now() - started) / 1000)}с`)
  } catch (err: any) {
    console.error(`[sandbox:image] сборка не удалась: ${err?.message ?? err}`)
    const out = [err?.stdout, err?.stderr].filter(Boolean).join("\n").trim()
    if (out) console.error(out.split("\n").slice(-20).join("\n"))
    process.exitCode = 1
  } finally {
    await fs.rm(emptyContext, { recursive: true, force: true }).catch(() => {})
  }
}

void main()
