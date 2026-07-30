/* ================================================================
   OSGARD · Замер: доходит ли человеческий сигнал до отбора (волна 7, п.2)
   ----------------------------------------------------------------
   ЗАЧЕМ. Волна 7 утверждает, что качество корпуса было мнением одной
   машины: «собралось» решало всё, а что человек сделал с кодом дальше —
   выложил наружу или пошёл просить переделать — на отбор не влияло.
   Утверждение обязано быть числом, полученным ОДНИМ И ТЕМ ЖЕ скриптом
   на двух деревьях: «до» (main) и «после» (ветка).

   ЧТО ИЗМЕРЯЕТСЯ. Доля ситуаций отбора, которые корпус решает так, как
   решил бы человек, знающий факты. Каждая ситуация — две конкурирующие
   генерации одной темы с настоящими данными в настоящих таблицах:
   машинное качество считает `craftQuality` дерева, деплой лежит в
   `projects.deploy_status`, просьбы переделать — строками
   `project_refinements`. Выбор делает `findBestTemplate` дерева, и
   ничего кроме него: ни одно поле, заведённое волной 7, в измерении не
   участвует — иначе это был бы самоотчёт.

   ПОЧЕМУ ЧИСЛО «ДО» НЕ НОЛЬ ПО ПОСТРОЕНИЮ. Пять из девяти ситуаций —
   это НЕГАТИВНЫЕ КОНТРОЛИ: там правильный ответ означает «ничего не
   менять». Корпус без человеческого сигнала их проходит, и обязан
   проходить после волны тоже. Метрика, у которой «до» равно нулю
   механически, не умеет поймать перегиб — а перегиб здесь опаснее
   слепоты: человеческая дельта, ставшая правом вето, испортила бы
   отбор сильнее, чем её отсутствие.

   ЧЕСТНАЯ ПОБЛАЖКА «ДО». Колонка `source_project_id` создаётся самим
   скриптом, поэтому на main связь с проектом ЕСТЬ и данные о человеке
   лежат рядом — main их просто не читает. Четвёртый параметр
   `sourceProjectId` в вызове сохранения на main молча отбрасывается
   JS. Не давать «до» этих данных было бы подтасовкой в свою пользу.

   ЧЕСТНЫЙ ПРЕДЕЛ. Прод-базы с этой машины не видно (бэкенда без шелла),
   взвесить ситуации реальным трафиком нечем: каждая идёт с весом 1.
   Это не прод-статистика и выдавать её за неё нельзя. Прод-долю даст
   витрина `/dev/memory` полем `humanSignals.signalShare` — ровно для
   этого оно и заведено.

   ЗАПУСК ОДИНАКОВЫЙ НА ОБОИХ ДЕРЕВЬЯХ:
       npx tsx src/scripts/measure-human-signals.ts
   ================================================================ */

process.env.DB_PATH = ":memory:"

import type { craftQuality as CraftQuality } from "../lib/craft-corpus"
import type * as TemplateStore from "../services/template-store"

/* Всё, что зависит от схемы, — через `await import` внутри main. Статический import
   поднимается ВЫШЕ создания таблиц (первая версия скрипта на этом и споткнулась:
   миграция 092 отработала на несуществующей таблице и молча не добавила колонки). */
let db: typeof import("../lib/db").default
let craftQuality: typeof CraftQuality
let findBestTemplate: typeof TemplateStore.findBestTemplate
let saveTemplateFromGeneration: typeof TemplateStore.saveTemplateFromGeneration

/* Схема — минимальная, но настоящая: те же таблицы и колонки, что в проде
   (миграции 030 + 029 + 089 + 092). */
const SCHEMA = `
  CREATE TABLE project_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT UNIQUE NOT NULL,
    theme TEXT NOT NULL,
    keywords TEXT,
    name_sample TEXT,
    description_sample TEXT,
    badge TEXT,
    manifest TEXT NOT NULL,
    files TEXT NOT NULL,
    artifact_types TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    tokens_saved_estimate INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    deploy_status TEXT,
    live_url TEXT
  );
  CREATE TABLE project_refinements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    cost_credits INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`

/** Поднимает базу дерева: схема → миграция 092 (есть на обоих деревьях) → связь с
 *  проектом. Колонку `source_project_id` создаёт сам скрипт: на main миграции 100 нет,
 *  а данные о человеке «до» обязаны лежать рядом — иначе поблажка не честная. */
async function setUpTree() {
  ;({ default: db } = await import("../lib/db"))
  db.exec(SCHEMA)
  ;({ craftQuality } = await import("../lib/craft-corpus"))
  await import("../migrations/092_craft_corpus")
  ;({ findBestTemplate, saveTemplateFromGeneration } = await import("../services/template-store"))

  const cols = (db.prepare(`PRAGMA table_info(project_templates)`).all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes("source_project_id")) {
    db.exec(`ALTER TABLE project_templates ADD COLUMN source_project_id INTEGER`)
  }
  if (!cols.includes("quality_score")) {
    throw new Error("миграция 092 не добавила quality_score — замер измерял бы не то дерево")
  }
}

/* ---------------------------------------------------------------- */

type Candidate = {
  /** Имя генерации. Оно же — ответ: по нему видно, какой шаблон выбрал корпус. */
  name: string
  /** Балл интерфейса, из которого дерево само считает машинное качество. */
  designScore: number
  /** Ремонты, которые потребовались коду. */
  repairs?: number
  /** Сколько раз шаблон уже переиспользовали (историческая сортировка). */
  usage?: number
  /** Человек выложил результат наружу. */
  deployed?: boolean
  /** Сколько раз человек просил переделать. */
  refinements?: number
  /** Шаблон старого корпуса: без проекта-родителя (вся база до миграции 100). */
  orphan?: boolean
  /** Шаблон старого корпуса без измеренного качества (база до миграции 092). */
  unmeasured?: boolean
}

type Situation = {
  key: string
  /** Что именно проверяем. */
  what: string
  theme: string
  /** Ключевые слова запроса: намеренно НЕ совпадают ни с одним шаблоном, чтобы отбор
      шёл по теме (точное совпадение хэша — отдельная ветка кода, здесь не она). */
  ask: string[]
  candidates: Candidate[]
  /** Кто обязан победить и почему. Задано ДО запуска. */
  expect: string
  why: string
  /** Негативный контроль: правильный ответ — «ничего не менять». */
  control?: true
}

/* Названия подобраны так, чтобы `detectTheme` дал одну тему и РАЗНЫЕ ключевые слова —
   иначе два кандидата схлопнулись бы в один хэш и конкуренции не возникло. */
const SITUATIONS: Situation[] = [
  {
    key: "deploy-decides",
    what: "равный машинный балл, один результат человек выложил наружу",
    theme: "fantasy",
    ask: ["quest"],
    candidates: [
      { name: "магия", designScore: 70, deployed: true },
      { name: "дракон", designScore: 70, usage: 5 },
    ],
    expect: "магия",
    why: "деплой — сильнейшее «годится», какое платформа видит; популярность слабее",
  },
  {
    key: "refine-demotes",
    what: "равный машинный балл, один результат просили переделать дважды",
    theme: "social",
    ask: ["community"],
    candidates: [
      { name: "чат", designScore: 80, refinements: 2, usage: 3 },
      { name: "профиль", designScore: 80 },
    ],
    expect: "профиль",
    why: "две доработки — признание, что результат не подошёл",
  },
  {
    key: "deploy-outweighs-small-gap",
    what: "задеплоенный код слабее машинно на 4 балла",
    theme: "game",
    ask: ["level"],
    candidates: [
      { name: "рпг", designScore: 72, deployed: true },
      { name: "аркада", designScore: 76, orphan: true },
    ],
    expect: "рпг",
    why: "четыре балла интерфейса слабее факта, что человек выложил проект наружу",
  },
  {
    key: "refined-loses-despite-deploy",
    what: "задеплоен, но трижды переделан — против спокойного соседа",
    theme: "blog",
    ask: ["magazine"],
    candidates: [
      { name: "новости", designScore: 75, deployed: true, refinements: 3 },
      { name: "статья", designScore: 72 },
    ],
    expect: "статья",
    why: "выложил, но трижды переделывал — итог сигнала отрицательный",
  },
  {
    key: "signal-not-veto",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: заметно лучший код против задеплоенного",
    theme: "scifi",
    ask: ["cyberpunk"],
    candidates: [
      { name: "робот", designScore: 60, deployed: true },
      { name: "космос", designScore: 75, orphan: true },
    ],
    expect: "космос",
    why: "человеческая дельта — поправка, а не право вето над инженерией",
  },
  {
    key: "legacy-untouched",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: старый корпус без связей с проектами",
    theme: "dashboard",
    ask: ["crm"],
    candidates: [
      { name: "аналитика", designScore: 70, usage: 9, orphan: true },
      { name: "панель", designScore: 70, orphan: true },
    ],
    expect: "аналитика",
    why: "нет сигнала — судим ровно как до волны 7, по качеству и переиспользованию",
  },
  {
    key: "quiet-project-no-penalty",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: проект есть, но его не деплоили",
    theme: "portfolio",
    ask: ["resume"],
    candidates: [
      { name: "портфолио", designScore: 70, usage: 9 },
      { name: "лендинг", designScore: 70, orphan: true },
    ],
    expect: "портфолио",
    why: "отсутствие деплоя — отсутствие данных, а не поголовный штраф",
  },
  {
    key: "penalty-capped",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: десять доработок против трёх",
    theme: "ecommerce",
    ask: ["checkout"],
    candidates: [
      { name: "магазин", designScore: 80, refinements: 10, usage: 9 },
      { name: "каталог", designScore: 80, refinements: 3 },
    ],
    expect: "магазин",
    why: "штраф ограничен потолком: человек, доводящий проект итерациями, вовлечён, а не обманут",
  },
  {
    key: "unmeasured-not-lifted",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: задеплоенный код без измеренного качества",
    theme: "fantasy",
    ask: ["sword"],
    candidates: [
      { name: "меч", designScore: 0, deployed: true, unmeasured: true },
      { name: "квест", designScore: 50, orphan: true },
    ],
    expect: "квест",
    why: "сначала «работает», и только потом «понравилось»: неизмеренное не поднимают",
  },
]

/* ---------------------------------------------------------------- */

let nextProjectId = 1

function reset() {
  db.exec(`DELETE FROM project_templates; DELETE FROM projects; DELETE FROM project_refinements;`)
}

function setUpCandidate(theme: string, c: Candidate) {
  let projectId: number | undefined

  if (!c.orphan) {
    projectId = nextProjectId++
    db.prepare(`INSERT INTO projects (id, user_id, name, deploy_status) VALUES (?, 1, ?, ?)`).run(
      projectId,
      c.name,
      c.deployed ? "deployed" : null,
    )
    for (let i = 0; i < (c.refinements ?? 0); i += 1) {
      db.prepare(
        `INSERT INTO project_refinements (user_id, project_id, prompt, status, cost_credits, created_at)
         VALUES (1, ?, 'переделай', 'ready', 0, 1)`,
      ).run(projectId)
    }
  }

  if (c.unmeasured) {
    /* Шаблон корпуса до миграции 092: качество NULL. Такие строки в проде есть, и
       функция сохранения их создать не может — вставляем как есть. */
    db.prepare(
      `INSERT INTO project_templates
         (hash, theme, keywords, name_sample, description_sample, badge, manifest, files, artifact_types,
          usage_count, tokens_saved_estimate, created_at, updated_at, quality_score, source_project_id)
       VALUES (?, ?, ?, ?, 'd', 'b', '[]', '[]', '[]', ?, 0, 1, 1, NULL, ?)`,
    ).run(`legacy-${theme}-${c.name}`, theme, c.name, c.name, c.usage ?? 0, projectId ?? null)
    return
  }

  saveTemplateFromGeneration({
    name: c.name,
    description: "d",
    badge: "b",
    manifest: [],
    files: [],
    artifactTypes: [],
    quality: craftQuality({ verdict: "passed", designScore: c.designScore, repairs: c.repairs ?? 0 }),
    verdict: "passed",
    designScore: c.designScore,
    repairs: c.repairs ?? 0,
    /* На main этот параметр отбрасывается молча — в этом и состоит поблажка «до». */
    sourceProjectId: projectId,
  } as Parameters<typeof saveTemplateFromGeneration>[0])

  if (c.usage) {
    db.prepare(`UPDATE project_templates SET usage_count = ? WHERE name_sample = ?`).run(c.usage, c.name)
  }
}

async function main() {
  await setUpTree()

  const rows: Array<{ key: string; expect: string; got: string; ok: boolean; control: boolean; what: string }> = []

  for (const s of SITUATIONS) {
    reset()
    for (const c of s.candidates) setUpCandidate(s.theme, c)

    const chosen = findBestTemplate(s.theme, s.ask)
    const got = chosen?.nameSample ?? "(ничего)"
    rows.push({ key: s.key, expect: s.expect, got, ok: got === s.expect, control: Boolean(s.control), what: s.what })
  }

  const total = rows.length
  const ok = rows.filter((r) => r.ok).length
  const controls = rows.filter((r) => r.control)
  const controlsOk = controls.filter((r) => r.ok).length
  const signalCases = rows.filter((r) => !r.control)
  const signalOk = signalCases.filter((r) => r.ok).length

  console.log("\n=== Человеческий сигнал в отборе шаблонов (волна 7, п.2) ===\n")
  for (const r of rows) {
    console.log(
      `${r.ok ? "✔" : "✘"} ${r.control ? "[контроль] " : ""}${r.key}\n    ${r.what}\n    ожидание: ${r.expect}   выбрано: ${r.got}`,
    )
  }
  console.log(
    `\nИТОГО: ${ok} из ${total} ситуаций решены как решил бы человек (${Math.round((ok / total) * 100)}%)` +
      `\n  ситуации с человеческим сигналом: ${signalOk} из ${signalCases.length}` +
      `\n  негативные контроли (правильный ответ — «ничего не менять»): ${controlsOk} из ${controls.length}\n`,
  )

  /* Ненулевой код выхода, если провалился НЕГАТИВНЫЙ контроль: слепота корпуса — это
     «до», а перегиб — это поломка, и она не имеет права выглядеть как обычная цифра. */
  if (controlsOk < controls.length) process.exitCode = 1
}

void main()
