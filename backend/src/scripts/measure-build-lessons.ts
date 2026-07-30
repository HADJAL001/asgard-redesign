/* ================================================================
   OSGARD · Замер: учится ли платформа на провале НАСТОЯЩЕЙ сборки
   ----------------------------------------------------------------
   ЗАЧЕМ. Волна 7, пункт 2: «компилятор — самый честный учитель, его
   сигнал выбрасывается». Уроки берутся из первого статического разбора
   (`project-engineering.ts`), а ветки, где статический разбор чист, а
   реальный `next build` падает, не пишут в память ни строчки.

   ЧЕМ ЭТО ИЗМЕРЯЕТСЯ. Не рассуждением и не выдуманными строками лога:
   скрипт СОБИРАЕТ настоящие приложения настоящим `next build` и кормит
   парсер настоящим выводом компилятора. Каркас берётся тот самый, что
   платформа кладёт в каждое приложение (`staticTemplateFiles`), версии —
   те самые, что стоят в образе песочницы (`app-scaffold-deps`: Next 14.2,
   React 18). Выдумывать формат ошибок нельзя: половина «очевидных» ошибок
   в этом каркасе сборку вообще не роняет — `next.config.js` объявляет
   `typescript.ignoreBuildErrors`, поэтому ошибка типов проходит молча.

   ГЛАВНОЕ ЧИСЛО. Знаменатель — случаи, где статический разбор ЧИСТ, а
   реальная сборка ПАДАЕТ: ровно те ветки (`:210–225`, `:285–298`), про
   которые сказано «уроков не пишут». Числитель — сколько из них теперь
   дают платформе хотя бы одно правило. До волны 7 числитель равен нулю
   по построению кода, и скрипт это показывает, а не утверждает.

   ЗАПУСК (стенд ставится один раз, вне рабочего дерева):
       npx tsx src/scripts/measure-build-lessons.ts
   Переменные: PROBE_DIR — каталог стенда, DUMP=1 — печатать хвосты логов.
   ================================================================ */

process.env.DB_PATH = ":memory:"

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const PROBE_DIR = process.env.PROBE_DIR ?? "C:/Users/HADJAL/work/.osgard-buildprobe"
const DUMP = process.env.DUMP === "1"
const BUILD_TIMEOUT_MS = 5 * 60 * 1000

type Case = {
  key: string
  title: string
  /** Файлы поверх каркаса. Ключ — путь в приложении. */
  files: Record<string, string>
}

/* Восемь классов дефектов, каждый — настоящая причина падения сборки в этом
   каркасе. Не «похожий на правду текст ошибки», а код, который компилятор
   действительно отказывается собрать. */
const CASES: Case[] = [
  {
    key: "use-client-missing",
    title: 'хук без директивы "use client"',
    files: {
      "app/page.tsx": `import { useState } from "react"

export default function Page() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>Нажато {n}</button>
}
`,
    },
  },
  {
    key: "import-missing",
    title: "импорт несуществующего файла проекта",
    files: {
      "app/page.tsx": `import { Header } from "./components/header"

export default function Page() {
  return <Header />
}
`,
    },
  },
  {
    key: "dependency-missing",
    title: "импорт пакета, которого нет в каркасе",
    files: {
      "app/page.tsx": `import confetti from "canvas-confetti"

export default function Page() {
  return <button onClick={() => confetti()}>Праздник</button>
}
`,
    },
  },
  {
    key: "browser-global-toplevel",
    title: "localStorage на верхнем уровне модуля",
    files: {
      "app/page.tsx": `"use client"

const saved = localStorage.getItem("осгард")

export default function Page() {
  return <div>{saved ?? "пусто"}</div>
}
`,
    },
  },
  {
    key: "suspense-boundary-missing",
    title: "useSearchParams без Suspense",
    files: {
      "app/page.tsx": `"use client"

import { useSearchParams } from "next/navigation"

export default function Page() {
  const params = useSearchParams()
  return <div>{params.get("q")}</div>
}
`,
    },
  },
  {
    key: "dynamic-route-unexportable",
    title: "динамический маршрут без generateStaticParams",
    files: {
      "app/page.tsx": `export default function Page() {
  return <div>главная</div>
}
`,
      "app/items/[id]/page.tsx": `export default function Item({ params }: { params: { id: string } }) {
  return <div>предмет {params.id}</div>
}
`,
    },
  },
  {
    key: "syntax",
    title: "незакрытый JSX-тег",
    files: {
      "app/page.tsx": `export default function Page() {
  return (
    <div>
      <span>текст
    </div>
  )
}
`,
    },
  },
  {
    key: "async-client-component",
    title: "async-компонент с директивой клиента",
    files: {
      "app/page.tsx": `"use client"

export default async function Page() {
  const data = await Promise.resolve("готово")
  return <div>{data}</div>
}
`,
    },
  },
  {
    key: "server-function-prop",
    title: "функция как проп из сервера в клиент",
    files: {
      "app/page.tsx": `import { Button } from "./button"

export default function Page() {
  return <Button onPress={() => console.log("клик")} />
}
`,
      "app/button.tsx": `"use client"

export function Button({ onPress }: { onPress: () => void }) {
  return <button onClick={onPress}>Нажми</button>
}
`,
    },
  },
  {
    key: "prerender-crash",
    title: "падение при пререндере на пустых данных",
    files: {
      "app/page.tsx": `const данные: { имя: string } | null = null

export default function Page() {
  /* Классическая ошибка модели: данные «точно есть». На сервере их нет. */
  return <div>{данные!.имя.toUpperCase()}</div>
}
`,
    },
  },
  {
    key: "client-metadata-conflict",
    title: "metadata в клиентском компоненте",
    files: {
      "app/page.tsx": `"use client"

import { useState } from "react"

export const metadata = { title: "Заголовок" }

export default function Page() {
  const [n] = useState(0)
  return <div>{n}</div>
}
`,
    },
  },
]

type Row = {
  key: string
  title: string
  staticClean: boolean
  buildFailed: boolean
  rulesFromLog: string[]
  logTail: string
}

async function writeApp(files: Array<{ path: string; content: string }>) {
  /* Каталог app чистим целиком: остатки предыдущего случая (например,
     app/items/[id]/page.tsx) иначе роняли бы следующую сборку и замер
     показывал бы чужой дефект. */
  await fs.rm(path.join(PROBE_DIR, "app"), { recursive: true, force: true })
  for (const file of files) {
    const full = path.join(PROBE_DIR, file.path)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, file.content, "utf8")
  }
}

function runBuild(): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["next", "build"], {
      cwd: PROBE_DIR,
      shell: true,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
    })
    let out = ""
    child.stdout.on("data", (d) => (out += String(d)))
    child.stderr.on("data", (d) => (out += String(d)))
    const timer = setTimeout(() => child.kill(), BUILD_TIMEOUT_MS)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, log: out })
    })
  })
}

async function main() {
  const { staticTemplateFiles } = await import("../services/app-generator")
  const { deriveDesignBrief } = await import("../lib/design-system")
  const { explainBuildIntegrity } = await import("../lib/build-integrity")
  const { lessonsFromBuildLog } = await import("../lib/build-log-lessons")

  const brief = deriveDesignBrief({ name: "Пробник", theme: "general" })
  const scaffold = staticTemplateFiles("Пробник", brief, "стенд проверки сборки")

  const rows: Row[] = []

  for (const testCase of CASES) {
    const extra = Object.entries(testCase.files).map(([p, content]) => ({ path: p, content }))
    const files = [...scaffold.filter((f) => !testCase.files[f.path]), ...extra]

    /* Что видит статический разбор ДО сборки — тот самый источник уроков сегодня. */
    const report = explainBuildIntegrity(files)
    const staticErrors = report.defects.filter((d) => d.severity === "error")

    await writeApp(files)
    const build = await runBuild()

    const fromLog = lessonsFromBuildLog(build.log)
    rows.push({
      key: testCase.key,
      title: testCase.title,
      staticClean: report.analyzed && staticErrors.length === 0,
      buildFailed: !build.ok,
      rulesFromLog: fromLog.map((l) => l.rule),
      logTail: build.log.slice(-1400),
    })

    const mark = !build.ok ? "СБОРКА УПАЛА" : "собралось   "
    const seen = staticErrors.length === 0 ? "разбор чист " : `разбор видит ${staticErrors.length}`
    console.log(
      `${mark}  ${seen}  ${testCase.key.padEnd(26)} уроки из лога: ${
        fromLog.map((l) => l.rule).join(", ") || "—"
      }`,
    )
    if (DUMP) console.log("\n----- лог -----\n" + build.log.slice(-2500) + "\n---------------\n")
  }

  /* ---------------- Итог ---------------- */

  /* Знаменатель — ровно спорные ветки: разбор чист, а сборка упала. */
  const blind = rows.filter((r) => r.staticClean && r.buildFailed)
  const learned = blind.filter((r) => r.rulesFromLog.length > 0)

  console.log("")
  console.log("ЗАМЕР: провал настоящей сборки, которого статический разбор НЕ видит")
  console.log("")
  for (const r of blind) {
    console.log(
      `${r.rulesFromLog.length ? "УЧИТСЯ    " : "не учится "} ${r.key.padEnd(26)} ${r.title.padEnd(38)} ${
        r.rulesFromLog.join(", ") || "—"
      }`,
    )
  }
  console.log("")
  console.log(`До волны 7: 0 из ${blind.length} — ветки падения сборки уроков не пишут вовсе.`)
  console.log(
    `После:      ${learned.length} из ${blind.length} = ${
      blind.length ? Math.round((learned.length / blind.length) * 1000) / 10 : 0
    }%`,
  )
  console.log("")

  /* Негативные контроли замера. Стенд, у которого «падает всё» или «ловится всё»,
     ничего не измеряет: первое означает сломанный каркас, второе — парсер, который
     выдаёт правило на любой текст. */
  const built = rows.filter((r) => !r.buildFailed)
  if (built.length === rows.length) console.log("ВНИМАНИЕ: не упало ни одной сборки — сломан стенд, а не платформа")
  if (rows.every((r) => r.buildFailed)) {
    console.log(`(справочно: успешных сборок нет — проверь, что каркас вообще собирается)`)
  }
  const falsePositive = built.filter((r) => r.rulesFromLog.length > 0)
  if (falsePositive.length > 0) {
    console.log(
      `ВНИМАНИЕ: парсер выдал правило на УСПЕШНУЮ сборку (${falsePositive
        .map((r) => r.key)
        .join(", ")}) — это ложное срабатывание`,
    )
  }
  const alsoStatic = rows.filter((r) => !r.staticClean && r.buildFailed)
  console.log(
    `Справочно: ещё ${alsoStatic.length} случаев ловит статический разбор до сборки — они и раньше давали уроки.`,
  )
}

main().catch((err) => {
  console.error("ЗАМЕР НЕ СОСТОЯЛСЯ:", err)
  process.exitCode = 1
})
