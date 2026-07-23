import autocannon, { Result } from "autocannon"
import fs from "fs"
import path from "path"

/* ================================================================
   OSGARD · Нагрузочный тест перед PH-запуском
   ----------------------------------------------------------------
   Гоняет read-heavy публичные пути (то, что реально получит трафик
   с Product Hunt: главная, лендинги, публичные списки) против уже
   запущенных локальных dev-серверов. Авторизационные ручки
   (/auth/login и т.п.) намеренно не нагружаются — там свой
   rate-limiter, и под нагрузочным тестом он покажет не реальную
   пропускную способность, а просто порог самого лимитера.

   Запуск: npx tsx src/scripts/load-test.ts
   Пороговые значения ниже — ориентир для "готов к PH или нет",
   не строгий SLA.
   ================================================================ */

const BACKEND_URL = process.env.LOAD_TEST_BACKEND_URL || "http://localhost:3003"
const FRONTEND_URL = process.env.LOAD_TEST_FRONTEND_URL || "http://localhost:3000"
const DURATION_SEC = Number(process.env.LOAD_TEST_DURATION || 20)
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS || 50)

const THRESHOLDS = {
  errorRatePct: 1, // допустимая доля ошибок/non-2xx
  p99Ms: 1000, // p99 латентности
}

type Scenario = { name: string; url: string }

const scenarios: Scenario[] = [
  { name: "backend /health", url: `${BACKEND_URL}/health` },
  { name: "backend /leaderboard", url: `${BACKEND_URL}/leaderboard` },
  { name: "backend /hall-of-fame", url: `${BACKEND_URL}/hall-of-fame` },
  { name: "backend /feed", url: `${BACKEND_URL}/feed` },
  { name: "backend /posts", url: `${BACKEND_URL}/posts` },
  { name: "frontend /", url: `${FRONTEND_URL}/` },
  { name: "frontend /pricing", url: `${FRONTEND_URL}/pricing` },
]

async function warmup(url: string) {
  // Next.js dev-сервер компилирует страницу on-demand при первом обращении —
  // без прогрева первая волна запросов меряет компиляцию, а не реальную
  // отдачу. В production build (next start) такого нет, но прогрев не
  // мешает и там.
  try {
    await fetch(url)
  } catch {
    /* дальше упадёт сам сценарий, если сервер правда недоступен */
  }
}

async function runScenario(scenario: Scenario): Promise<Result> {
  await warmup(scenario.url)
  return autocannon({
    url: scenario.url,
    duration: DURATION_SEC,
    connections: CONNECTIONS,
    pipelining: 1,
  })
}

function summarize(name: string, r: Result) {
  const total = r.requests.sent
  const nonOk = r["2xx"] !== undefined ? total - r["2xx"] : r.non2xx
  const errorRatePct = total > 0 ? (nonOk / total) * 100 : 100
  const p99 = r.latency.p99
  const pass = errorRatePct <= THRESHOLDS.errorRatePct && p99 <= THRESHOLDS.p99Ms

  return {
    name,
    url: r.url,
    requestsPerSec: r.requests.average,
    latencyP50Ms: r.latency.p50,
    latencyP99Ms: p99,
    errors: r.errors,
    timeouts: r.timeouts,
    non2xx: nonOk,
    totalRequests: total,
    errorRatePct: Number(errorRatePct.toFixed(2)),
    pass,
  }
}

async function main() {
  console.log(
    `\nLoad test: ${CONNECTIONS} conns × ${DURATION_SEC}s per scenario against ${BACKEND_URL} / ${FRONTEND_URL}\n`,
  )

  const results: ReturnType<typeof summarize>[] = []

  for (const scenario of scenarios) {
    process.stdout.write(`→ ${scenario.name} ... `)
    try {
      const r = await runScenario(scenario)
      const s = summarize(scenario.name, r)
      results.push(s)
      console.log(
        `${s.pass ? "OK" : "FAIL"}  ${s.requestsPerSec} req/s, p50=${s.latencyP50Ms}ms, p99=${s.latencyP99Ms}ms, errors=${s.errorRatePct}%`,
      )
    } catch (err: any) {
      console.log(`SKIP (${err.message})`)
      results.push({
        name: scenario.name,
        url: scenario.url,
        requestsPerSec: 0,
        latencyP50Ms: 0,
        latencyP99Ms: 0,
        errors: 0,
        timeouts: 0,
        non2xx: 0,
        totalRequests: 0,
        errorRatePct: 100,
        pass: false,
      })
    }
  }

  const reportDir = path.join(__dirname, "..", "..", "load-test-results")
  fs.mkdirSync(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, `load-test-${Date.now()}.json`)
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ ranAt: new Date().toISOString(), connections: CONNECTIONS, durationSec: DURATION_SEC, results }, null, 2),
  )

  const failed = results.filter((r) => !r.pass)
  console.log(`\nReport saved: ${reportPath}`)
  console.log(failed.length === 0 ? "\n✅ Все сценарии в пределах порогов." : `\n❌ ${failed.length} сценарий(ев) не прошли пороги:`)
  failed.forEach((f) => console.log(`   - ${f.name}: ${f.errorRatePct}% ошибок, p99=${f.latencyP99Ms}ms`))

  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("Load test crashed:", err)
  process.exit(1)
})
