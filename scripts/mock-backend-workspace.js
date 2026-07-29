/* ================================================================
   Мок-бэкенд ровно для проверки мастерской глазами.

   Зачем: правку «код спрятан по умолчанию» нельзя сдать по описанию —
   нужно увидеть оба экрана в браузере. Настоящий бэкенд для этого тянет
   за собой базу, авторизацию и живого Клода; здесь отвечают только те
   пять ручек, которые читает ProjectWorkspaceView.

   Это инструмент проверки, а не часть продукта: в сборку не входит,
   запускается руками и подставляется через BACKEND_URL.

   Сценарий выбирается переменной MOCK_SCENARIO:
     generating — проект собирается прямо сейчас (SSE-стадии идут),
     ready      — приложение готово и проверено.
   ================================================================ */

const http = require("http")

const SCENARIO = process.env.MOCK_SCENARIO === "ready" ? "ready" : "generating"
const PORT = Number(process.env.MOCK_PORT || 4599)

const FILES = [
  { path: "app/page.tsx", content: 'export default function Page() {\n  return <main>Привычки</main>\n}\n' },
  { path: "app/layout.tsx", content: 'export default function Layout({ children }: any) {\n  return <html><body>{children}</body></html>\n}\n' },
  { path: "components/HabitCard.tsx", content: "export function HabitCard() {\n  return <div>карточка</div>\n}\n" },
  { path: "lib/storage.ts", content: "export const load = () => []\n" },
  { path: "package.json", content: '{\n  "name": "privychki"\n}\n' },
]

const PROJECT = {
  id: 1,
  name: "Трекер привычек",
  description: "Приложение для отслеживания привычек",
  status: SCENARIO === "ready" ? "ready" : "generating",
  deployStatus: "not_deployed",
  liveUrl: null,
  generationError: null,
  createdAt: Date.now() - 60000,
}

const ENGINEERING =
  SCENARIO === "ready"
    ? {
        verified: true,
        verdict: "passed",
        verifiedAt: Date.now(),
        report: {
          verifiedBy: "static",
          analyzedFiles: FILES.length,
          initialErrors: 0,
          attempts: 0,
          durationMs: 640,
          defects: [],
          repairs: [],
          checks: [
            { key: "syntax", label: "Синтаксис", passed: true, errors: 0, warnings: 0, detail: "" },
            { key: "graph", label: "Граф модулей", passed: true, errors: 0, warnings: 0, detail: "" },
            { key: "boundary", label: "Клиент/сервер", passed: true, errors: 0, warnings: 0, detail: "" },
            { key: "export", label: "Статический экспорт", passed: true, errors: 0, warnings: 0, detail: "" },
            { key: "routes", label: "Маршруты", passed: true, errors: 0, warnings: 0, detail: "" },
          ],
          meter: {
            durationMs: 64000,
            aiCalls: 27,
            tokensTotal: 89800,
            tokensEstimated: true,
            repairRounds: 0,
            firstAttempt: true,
            byProvider: [
              { provider: "claude", tokens: 55900, calls: 15 },
              { provider: "deepseek-raw", tokens: 31400, calls: 11 },
            ],
          },
        },
      }
    : { verified: false, verdict: null, report: null, verifiedAt: null }

function json(res, payload, status = 200) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) })
  res.end(body)
}

/** Живой поток стадий генерации — тот же формат, что читает useProjectGenerationStream. */
function stream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })
  const stages = [
    { stage: "prompt", label: "Разбираю замысел", progress: 0.1 },
    { stage: "plan", label: "Составляю план файлов", progress: 0.25 },
    { stage: "code", label: "Пишу компоненты приложения", progress: 0.45 },
    { stage: "code", label: "Пишу хуки и хранилище", progress: 0.62 },
  ]
  let i = 0
  const send = () => {
    const stage = stages[Math.min(i, stages.length - 1)]
    res.write(`data: ${JSON.stringify({ ...stage, at: Date.now(), meter: { aiCalls: 8 + i * 3, tokensTotal: 12000 + i * 9000, tokensEstimated: true } })}\n\n`)
    i++
  }
  send()
  const timer = setInterval(send, 2500)
  res.on("close", () => clearInterval(timer))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1")
  const p = url.pathname.replace(/^\/api/, "")
  console.log(`[mock] ${req.method} ${p}`)

  if (p === "/auth/me") {
    return json(res, { user: { id: 1, username: "osnovatel", email: "founder@osgard.local", role: "user", isAdmin: true } })
  }
  if (p === "/wallet" || p === "/wallet/me") {
    return json(res, { wallet: { credits: 12000, timecoin: 340, tc: 340, staked: 0, level: 3 } })
  }
  if (p === "/projects/1") return json(res, { project: PROJECT, artifacts: [] })
  if (p === "/projects/1/files") return json(res, { files: FILES })
  if (p === "/projects/1/refinements") return json(res, { refinements: [], refinementsRemaining: 3 })
  if (p === "/projects/1/engineering") return json(res, ENGINEERING)
  if (p === "/projects/1/generation-stream" || p.endsWith("/stream")) return stream(res)

  /* Ручки не мастерской, а глобальных элементов страницы (навбар, тикер
     курса, уведомления). Пустой `{}` их роняет: они деструктурируют
     массивы и вызывают .map. Отдаём пустые КОЛЛЕКЦИИ — «данных нет» вместо
     «поля нет». Список собран по фактическим запросам из лога, а не
     угадан. */
  const EMPTY_COLLECTIONS = {
    "/tc-market/state": { state: { price: 1, change24h: 0, volume24h: 0 } },
    "/tc-market/orderbook": { bids: [], asks: [] },
    "/tc-market/trades": { trades: [] },
    "/stakes": { stakes: [] },
    "/transactions": { transactions: [] },
    "/notifications": { notifications: [], unreadCount: 0 },
    "/messages/threads": { threads: [], unreadCount: 0 },
    "/projects": { projects: [] },
    "/artifacts": { artifacts: [] },
  }
  if (p in EMPTY_COLLECTIONS) return json(res, EMPTY_COLLECTIONS[p])

  // Остальное — честный пустой объект, а не 500: экран не должен падать
  // из-за ручки, к которой страница обращается мимоходом.
  return json(res, {})
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock] сценарий «${SCENARIO}» на http://127.0.0.1:${PORT}`)
})
