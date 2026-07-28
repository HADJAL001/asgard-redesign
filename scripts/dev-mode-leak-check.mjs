/* ================================================================
   Проверка режима разработчика на утечки экономики.
   ----------------------------------------------------------------
   Зачем скрипт, а не глазами: прошлый заход по Dev Mode прошёл
   код-ревью «чисто», а живой браузер показал Кузницу, Маркет, Биржу,
   Кошелёк и Зал Славы в подвале и виджет ДЖАРВИСа. Причина —
   глобальные слои (серверный footer в app/layout.tsx, ДЖАРВИС в
   AppShell): их не видно в диффе своих файлов.

   Поэтому проверяем не разметку, а ВИДИМЫЙ текст после гидратации:
   innerText учитывает display:none, то есть даёт то же, что видит
   человек. Сырой HTML для этого не годится — серверный футер в нём
   присутствует всегда и скрывается CSS-правилом уже на клиенте.

   Запуск:  node scripts/dev-mode-leak-check.mjs [baseUrl]
   ================================================================ */

import { chromium } from "playwright"

const BASE = process.argv[2] || "http://localhost:3823"

/** Слова мира OSGARD, которых в студии быть не должно. */
const FORBIDDEN = [
  "Кузница", "Маркет", "Биржа", "Кошелёк", "Кошелек",
  "Зал Славы", "TimeCoin", "артефакт", "ДЖАРВИС", "кредитов",
]

const ROUTES = ["/dev", "/dev/agents", "/dev/deploy", "/dev/workspace"]

/** Экраны мира — контрольная группа: там экономика обязана остаться.
 *  Роут публичный намеренно: защищённые (/projects, /wallet) без сессии
 *  редиректят на /login, и проверка мерила бы страницу входа, а не мир. */
const WORLD_ROUTES = ["/"]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

/* Без сессии студия пуста: списки проектов, Мастерская и деплой просто не
   рендерятся — а именно в них экономика и утекала бы. Логинимся локальным
   пользователем из `npm run init-db`, иначе проверка «чисто» ничего не стоит. */
async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 })
  const user = page.locator('input[type="text"], input[name="email"]').first()
  if (!(await user.count())) return false
  await user.fill("alex_odin")
  await page.locator('input[type="password"]').first().fill("password123")
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).catch(() => {})
  return !new URL(page.url()).pathname.startsWith("/login")
}

const loggedIn = await login()
console.log(loggedIn ? "· вошли как alex_odin\n" : "· ВНИМАНИЕ: войти не удалось — проверка неполная\n")

let failures = 0
if (!loggedIn) failures++

for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60_000 })
  // Ждём класс режима: до гидратации CSS ещё не спрятал глобальный футер.
  await page.waitForFunction(() => document.documentElement.classList.contains("dev-mode"), {
    timeout: 20_000,
  }).catch(() => {})
  await page.waitForTimeout(700)

  const text = await page.evaluate(() => document.body.innerText)
  const hits = FORBIDDEN.filter((word) => text.toLowerCase().includes(word.toLowerCase()))

  if (hits.length > 0) {
    failures++
    console.log(`❌ ${route} — экономика на экране: ${hits.join(", ")}`)
  } else {
    console.log(`✅ ${route} — чисто`)
  }
}

/* Мастерская конкретного проекта — главный риск: это ОБЩИЙ с миром экран
   (components/project-workspace-view.tsx), а не собственный экран студии.
   Id берём из списка проектов, чтобы не хардкодить. */
const firstId = await page.evaluate(async () => {
  // Спрашиваем список тем же прокси, что и приложение: надёжнее, чем парсить
  // разметку пикера, который при единственном проекте сразу редиректит.
  const r = await fetch("/api/projects/mine", { credentials: "include" })
  if (!r.ok) return null
  const data = await r.json().catch(() => null)
  return data?.projects?.[0]?.id ?? null
})

if (firstId) {
  await page.goto(`${BASE}/dev/workspace/${firstId}`, { waitUntil: "networkidle", timeout: 60_000 })
  await page.waitForTimeout(2000)
  const text = await page.evaluate(() => document.body.innerText)
  const hits = FORBIDDEN.filter((w) => text.toLowerCase().includes(w.toLowerCase()))
  if (hits.length) {
    failures++
    console.log(`❌ /dev/workspace/${firstId} (Мастерская) — экономика: ${hits.join(", ")}`)
  } else {
    console.log(`✅ /dev/workspace/${firstId} (Мастерская) — чисто`)
  }
} else {
  // Не «просто пропустить»: непроверенная Мастерская — главная дыра прошлого раза.
  failures++
  console.log("❌ Мастерская НЕ проверена (нет проектов или сессии) — это не «чисто»")
}

/* Контроль: мир не должен «вылечиться» вместе со студией.
   Меряем в ЧИСТОЙ вкладке без сессии: с версии «студия по умолчанию»
   авторизованного человека с «/» намеренно уносит в студию, и проверять
   мир в той же вкладке бессмысленно — мы бы мерили студию. Гостю же
   лендинг показывается как был. */
const guest = await browser.newPage({ viewport: { width: 1440, height: 900 } })
for (const route of WORLD_ROUTES) {
  await guest.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await guest.waitForTimeout(2500)
  const text = await guest.evaluate(() => document.body.innerText)
  const present = FORBIDDEN.filter((w) => text.toLowerCase().includes(w.toLowerCase()))
  if (present.length === 0) {
    failures++
    console.log(`❌ ${route} — мир потерял экономику (её должно быть видно!)`)
  } else {
    console.log(`✅ ${route} — мир нетронут для гостя (${present.slice(0, 3).join(", ")}…)`)
  }
}
/* Студия — вход по умолчанию (директива основателя). Проверяем оба
   следствия: гостя на лендинге не трогаем, вошедшего с «/» уводим в студию.
   Без этой проверки регрессия была бы незаметной: оба экрана «работают». */
const landedGuest = new URL(guest.url()).pathname
if (landedGuest === "/") {
  console.log("✅ гость остаётся на лендинге")
} else {
  failures++
  console.log(`❌ гостя увело с лендинга на ${landedGuest}`)
}
await guest.close()

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 })
await page.waitForTimeout(3000)
const landedUser = new URL(page.url()).pathname
if (landedUser.startsWith("/dev")) {
  console.log("✅ вошедший попадает в студию по умолчанию")
} else {
  failures++
  console.log(`❌ вошедший остался на ${landedUser} — студия не стала входом по умолчанию`)
}

await browser.close()
console.log(failures === 0 ? "\nИТОГ: чисто" : `\nИТОГ: проблем — ${failures}`)
process.exit(failures === 0 ? 0 : 1)
