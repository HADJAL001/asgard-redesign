// ПЕРВОЙ строкой: форсирует DB_PATH=:memory: до загрузки lib/db (own-cluster-deploy тянет db).
import "./helpers/use-memory-db"
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · публикация на СВОЮ инфраструктуру — контракт
   ----------------------------------------------------------------
   Проверяем то, что нельзя проверить деплоем вживую, но что ломает
   продукт молча:

     • слаг годен как метка DNS и как имя репозитория (валидатор
       control-plane ^[a-z0-9-]+$, ≤63 символа);
     • секрет (токен Forgejo / control-plane) НИКОГДА не попадает в
       текст ошибки — иначе первая же неудачная попытка push
       опубликовала бы токен в deploy_error и показала его в UI;
     • классификация статусов совпадает с контрактом control-plane:
       успех ровно один ('live'), незавершённые не считаются отказом,
       НЕИЗВЕСТНЫЙ статус считается отказом (а не «ещё идёт» — иначе
       деплой висел бы до таймаута);
     • свой Dockerfile автора не перетирается;
     • и главное: resolveDeployTarget() не может выбрать чужую
       площадку без явного разрешения оператора. Мы продаём аренду
       СВОЕЙ инфраструктуры — уход приложений к конкуренту по
       умолчанию обнуляет сам продукт.
   ================================================================ */

import {
  slugifyClusterSlug,
  repoCreateEndpoint,
  redactSecrets,
  classifyDeploymentStatus,
  describeFailure,
  infraFilesToAdd,
  buildForgejoRemote,
  GENERATED_DOCKERFILE,
  GENERATED_NGINX_CONF,
  CLUSTER_INTERNAL_PORT,
  CLUSTER_REQUEST_TIMEOUT_MS,
  type OwnClusterConfig,
} from "../services/own-cluster-deploy"
import { resolveDeployTarget, isNetlifyFallbackAllowed } from "../services/deploy-target"

const CLUSTER_SLUG_RE = /^[a-z0-9-]+$/

test("внешние запросы деплоя имеют короткий и явный лимит", () => {
  assert.equal(CLUSTER_REQUEST_TIMEOUT_MS, 15_000)
  const source = fs.readFileSync(path.join(__dirname, "..", "services", "own-cluster-deploy.ts"), "utf-8")
  assert.match(source, /forgejoUrl}\/api\/v1\$\{pathname\}[\s\S]*signal: AbortSignal\.timeout\(CLUSTER_REQUEST_TIMEOUT_MS\)/)
  assert.match(source, /apiUrl}\$\{pathname\}[\s\S]*signal: AbortSignal\.timeout\(CLUSTER_REQUEST_TIMEOUT_MS\)/)
})

test("слаг приложения годен и как поддомен, и как имя репозитория", () => {
  const cases: Array<[string, number]> = [
    ["VITALIS — AI-коуч долголетия", 34],
    ["My App!!!", 7],
    ["", 1],
    ["---", 2],
    ["Помощник", 15],
    ["a".repeat(200), 999999],
  ]

  for (const [name, id] of cases) {
    const slug = slugifyClusterSlug(name, id)
    assert.match(slug, CLUSTER_SLUG_RE, `слаг "${slug}" не проходит валидатор control-plane`)
    assert.ok(slug.length <= 63, `слаг длиннее метки DNS: ${slug.length}`)
    assert.ok(!slug.startsWith("-") && !slug.endsWith("-"), `дефис по краю: ${slug}`)
    assert.ok(slug.endsWith(`-${id}`), `в слаге нет id проекта: ${slug}`)
  }

  // Разные проекты с одинаковым названием не должны драться за один адрес.
  assert.notEqual(slugifyClusterSlug("Тот же", 1), slugifyClusterSlug("Тот же", 2))
  // Идемпотентность: повторный деплой того же проекта уходит по тому же адресу.
  assert.equal(slugifyClusterSlug("VITALIS", 34), slugifyClusterSlug("VITALIS", 34))
})

test("ручка создания репозитория выбирается по владельцу, а не по коду ошибки", () => {
  /* Дефект, поймавшийся выстрелом в прод 30.07.2026: код пробовал
     /orgs/<владелец>/repos первым и откатывался на /user/repos по 404. Forgejo
     на владельце-пользователе отвечает 403 «нужен scope write:organization»
     (проверка скоупа идёт РАНЬШЕ разрешения имени) — откат не срабатывал,
     деплой падал, а сообщение указывало чинить не то место. */
  assert.equal(repoCreateEndpoint("osgard-deploy-bot", "osgard-deploy-bot"), "/user/repos")
  // Регистр логина Forgejo не различает — иначе «Osgard-Deploy-Bot» уехал бы в /orgs.
  assert.equal(repoCreateEndpoint("osgard-deploy-bot", "Osgard-Deploy-Bot"), "/user/repos")
  // Владелец-организация: личная ручка создала бы репозиторий НЕ у того владельца,
  // и последующий push ушёл бы в никуда (404) вместо честного отказа по скоупу.
  assert.equal(repoCreateEndpoint("apps", "osgard-deploy-bot"), "/orgs/apps/repos")
  // Неопознанный токен (GET /user не ответил) — не повод считать владельца собой.
  assert.equal(repoCreateEndpoint("osgard-deploy-bot", undefined), "/orgs/osgard-deploy-bot/repos")
  assert.equal(repoCreateEndpoint("osgard-deploy-bot", ""), "/orgs/osgard-deploy-bot/repos")
})

test("секрет не переживает redactSecrets ни в тексте, ни в URL", () => {
  // Фикстуры намеренно НЕ похожи на боевые ключи: строка с «живым» префиксом и
  // высокой энтропией срабатывает у сканера утёкших секретов (gitleaks, правило
  // generic-api-key) и валит гейт — тест кричал бы «утечка» там, где её нет.
  const token = "fixture-forgejo-token-not-real"
  const apiToken = "fixture-cluster-token-not-real"

  const gitError = `fatal: unable to access 'https://bot:${token}@git.osgard.cloud/apps/app-x-1.git/': 403`
  const redacted = redactSecrets(gitError, [token, apiToken])
  assert.ok(!redacted.includes(token), "токен Forgejo уехал бы в deploy_error")
  assert.ok(redacted.includes("***"))

  const apiError = `control-plane отклонил регистрацию: Bearer ${apiToken}`
  assert.ok(!redactSecrets(apiError, [token, apiToken]).includes(apiToken))

  // Basic-auth в URL вырезается даже если сам секрет в список не попал
  // (percent-encoding, обрезка вывода git и т.п.).
  const unlisted = redactSecrets("https://bot:p%40ss@git.osgard.cloud/x.git", [])
  assert.ok(!unlisted.includes("p%40ss"), `basic-auth остался в URL: ${unlisted}`)
  assert.ok(unlisted.startsWith("https://***@"))

  // Пустая строка в списке секретов не должна превращать весь текст в звёздочки.
  assert.equal(redactSecrets("чистый текст", ["", token]), "чистый текст")
})

test("remote для push содержит экранированные креды и вычищается редактором", () => {
  const cfg: OwnClusterConfig = {
    apiUrl: "https://cp.osgard.cloud",
    apiToken: "cp-token",
    baseDomain: "osgard.cloud",
    forgejoUrl: "https://git.osgard.cloud",
    forgejoOwner: "apps",
    forgejoUser: "bot@osgard",
    forgejoToken: "tok/en@with:specials",
  }

  const remote = buildForgejoRemote(cfg, "app-vitalis-34")
  assert.ok(remote.startsWith("https://"), remote)
  assert.ok(remote.endsWith("/apps/app-vitalis-34.git"), remote)
  // Спецсимволы обязаны быть экранированы, иначе '@' и '/' разорвали бы URL
  // и push ушёл бы не туда (или в никуда).
  assert.ok(!remote.includes("tok/en@with:specials"), remote)
  assert.equal(new URL(remote).hostname, "git.osgard.cloud")
  assert.equal(decodeURIComponent(new URL(remote).password), cfg.forgejoToken)
  assert.equal(decodeURIComponent(new URL(remote).username), cfg.forgejoUser)
  // И этот URL, попав в текст ошибки, не должен утечь.
  assert.ok(!redactSecrets(`fatal: ${remote}`, [cfg.forgejoToken]).includes("with%3Aspecials"))
})

test("классификация статусов деплоя совпадает с контрактом control-plane", () => {
  for (const s of ["queued", "fetching", "building", "pushing", "starting", "health_check"]) {
    assert.equal(classifyDeploymentStatus(s), "pending", s)
  }
  for (const s of [
    "build_failed",
    "push_failed",
    "start_failed",
    "health_failed",
    "rolled_back",
    "failed_interrupted",
    "environment_gone",
  ]) {
    assert.equal(classifyDeploymentStatus(s), "failed", s)
    assert.ok(
      !/^деплой завершился статусом/.test(describeFailure(s)),
      `нет человеческой причины отказа: ${s}`,
    )
  }

  assert.equal(classifyDeploymentStatus("live"), "live")
  // Успех ровно один: похожие по смыслу слова успехом не считаются.
  for (const s of ["success", "deployed", "ok", "LIVE", ""]) {
    assert.notEqual(classifyDeploymentStatus(s), "live", `ложный успех: "${s}"`)
  }
  // Незнакомый статус — отказ, а не «ещё идёт»: иначе джоб висел бы до таймаута.
  assert.equal(classifyDeploymentStatus("some_new_status"), "failed")
  assert.match(describeFailure("some_new_status"), /some_new_status/)
})

test("инфраструктурные файлы добавляются, но авторские не перетираются", () => {
  const added = infraFilesToAdd(["package.json", "app/page.tsx"])
  const paths = added.map((f) => f.path).sort()
  assert.deepEqual(paths, [".dockerignore", "Dockerfile", "deploy/nginx.conf"])

  // Свой Dockerfile автора (в т.ч. будущий бэкенд приложения) остаётся его.
  const withOwn = infraFilesToAdd(["Dockerfile", "deploy/nginx.conf", ".dockerignore"])
  assert.deepEqual(withOwn, [])
  assert.deepEqual(
    infraFilesToAdd(["Dockerfile"]).map((f) => f.path).sort(),
    [".dockerignore", "deploy/nginx.conf"],
  )
})

test("Dockerfile и nginx согласованы с проверкой здоровья control-plane", () => {
  // Порт, который control-plane будет опрашивать, обязан быть открыт образом.
  assert.match(GENERATED_DOCKERFILE, new RegExp(`EXPOSE ${CLUSTER_INTERNAL_PORT}\\b`))
  assert.match(GENERATED_NGINX_CONF, new RegExp(`listen ${CLUSTER_INTERNAL_PORT};`))
  // npm install ДО ENV NODE_ENV=production: иначе devDependencies
  // (tailwind/postcss) не встанут и сборка упадёт — ловушка netlify-пути.
  const installAt = GENERATED_DOCKERFILE.indexOf("npm install")
  const prodEnvAt = GENERATED_DOCKERFILE.indexOf("ENV NODE_ENV=production")
  assert.ok(installAt > 0 && prodEnvAt > installAt, "NODE_ENV=production выставлен до npm install")
  // Экспорт Next.js кладёт /about как about.html — без этого прямые ссылки 404.
  assert.match(GENERATED_NGINX_CONF, /try_files \$uri \$uri\.html/)
  assert.match(GENERATED_DOCKERFILE, /COPY --from=build \/app\/out/)
})

/* ---------------------------------------------------------------- */

const OWN_CLUSTER_ENV = {
  OSGARD_CLUSTER_API_URL: "https://cp.osgard.cloud",
  OSGARD_CLUSTER_API_TOKEN: "cp-token",
  OSGARD_FORGEJO_URL: "https://git.osgard.cloud",
  OSGARD_FORGEJO_OWNER: "apps",
  OSGARD_FORGEJO_TOKEN: "forgejo-token",
}
const DEPLOY_ENV_KEYS = [
  ...Object.keys(OWN_CLUSTER_ENV),
  "DEPLOY_ALLOW_NETLIFY_FALLBACK",
  "NETLIFY_AUTH_TOKEN",
]

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = new Map(DEPLOY_ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const key of DEPLOY_ENV_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value
  }
  try {
    fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("площадка по умолчанию — своя инфраструктура", () => {
  withEnv({ ...OWN_CLUSTER_ENV, NETLIFY_AUTH_TOKEN: "netlify-token" }, () => {
    const decision = resolveDeployTarget()
    assert.equal(decision.target, "own-cluster")
    // Даже когда Netlify настроен и доступен — приоритет у наших серверов.
    assert.match(decision.reason, /наши сервера/)
  })
})

test("без явного разрешения деплой НЕ уходит на чужую площадку", () => {
  // Ключевой бизнес-контракт: платформа продаёт аренду своей инфраструктуры.
  withEnv({ NETLIFY_AUTH_TOKEN: "netlify-token" }, () => {
    const decision = resolveDeployTarget()
    assert.equal(decision.target, "none", "приложение уехало бы к конкуренту молча")
    assert.match(decision.reason, /DEPLOY_ALLOW_NETLIFY_FALLBACK/)
    // В отказе перечислено, чего именно не хватает — иначе оператор не починит.
    assert.match(decision.reason, /OSGARD_CLUSTER_API_URL/)
  })

  // Флаг без значения "true" разрешением не является.
  for (const flag of ["1", "yes", "TRUE", ""]) {
    withEnv({ NETLIFY_AUTH_TOKEN: "t", DEPLOY_ALLOW_NETLIFY_FALLBACK: flag }, () => {
      assert.equal(isNetlifyFallbackAllowed(), false, `флаг "${flag}" принят за разрешение`)
      assert.equal(resolveDeployTarget().target, "none", `флаг "${flag}" пустил на чужую площадку`)
    })
  }
})

test("аварийный запас включается только явным флагом", () => {
  withEnv({ NETLIFY_AUTH_TOKEN: "netlify-token", DEPLOY_ALLOW_NETLIFY_FALLBACK: "true" }, () => {
    const decision = resolveDeployTarget()
    assert.equal(decision.target, "netlify")
    assert.match(decision.label, /аварийный запас/)
  })

  // Разрешение без настроенного Netlify — всё равно отказ, а не мнимый успех.
  withEnv({ DEPLOY_ALLOW_NETLIFY_FALLBACK: "true" }, () => {
    assert.equal(resolveDeployTarget().target, "none")
  })

  // Неполный конфиг своей инфраструктуры — это НЕ «сконфигурирована».
  for (const dropped of Object.keys(OWN_CLUSTER_ENV)) {
    const partial: Record<string, string> = { ...OWN_CLUSTER_ENV }
    delete partial[dropped]
    withEnv(partial, () => {
      assert.equal(
        resolveDeployTarget().target,
        "none",
        `без ${dropped} деплой считался бы настроенным`,
      )
      assert.match(resolveDeployTarget().reason, new RegExp(dropped))
    })
  }
})

test("ручка деплоя выбирает площадку, а не зовёт Netlify напрямую", () => {
  // Статическая проверка: маршрут не должен вернуться к прежнему поведению
  // (единственный провайдер = чужая площадка) при будущих правках.
  const routesPath = path.join(__dirname, "..", "routes", "projects.routes.ts")
  const source = fs.readFileSync(routesPath, "utf-8")

  assert.ok(source.includes("resolveDeployTarget"), "маршрут не выбирает площадку")
  assert.ok(
    !source.includes("runNetlifyDeployJob"),
    "маршрут снова зовёт Netlify напрямую, минуя выбор площадки",
  )
  // Совместимость со уже выпущенными клиентами (web/mobile ходят на /deploy-netlify).
  assert.ok(source.includes('"/:id/deploy"'), "нет канонического маршрута /deploy")
  assert.ok(source.includes('"/:id/deploy-netlify"'), "сломана совместимость старых клиентов")

  // Самотест детектора: он обязан ловить возврат прежнего вызова.
  assert.ok(
    "  void runNetlifyDeployJob(id)\n".includes("runNetlifyDeployJob"),
    "детектор не сработал бы на положительном входе",
  )
})
