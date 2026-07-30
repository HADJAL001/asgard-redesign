"use client"

/* ================================================================
   OSGARD · DevMemoryView — «чему платформа научилась».
   ----------------------------------------------------------------
   Раздел отвечает на вопрос, который до сих пор нельзя было проверить
   вообще никак: платформа правда учится на своих ошибках или это только
   написано в коде?

   Механизм существовал (lib/craft-corpus: частоты дефектов копятся в
   `generation_lessons`, топ правил подмешивается в промпт каждой
   следующей генерации), но обе сводки — `getLessonsReport` и
   `getTemplateSavingsReport` — не были подключены ни к одному роуту.
   Шелла в прод-контейнер нет, значит увидеть накопленное было нечем:
   «платформа учится» оставалось утверждением про код, а не фактом.

   Честность здесь важнее приятной цифры, поэтому раздел показывает и
   ПРОВАЛ обучения: правило может копиться в базе и при этом не доходить
   до модели — если у него нет человеческой формулировки, промпт его
   отбрасывает. Такой регресс тихий (счётчик растёт, толку ноль), и
   ровно он случился до волны 2 с правилами досборки контракта. Поэтому
   блок «копится впустую» стоит рядом с выученным, а не спрятан.

   Вторая асимметрия, которую нельзя скрывать: в промпт уходит только
   ТОП правил, поэтому редкое правило с формулировкой всё равно до
   модели не доходит. Мы не выдаём это за обучение.

   Волна 5 сняла главный предел обучения: раньше формулировка урока
   существовала только в рукописном словаре внутри кода, и правило без
   строки в КОДЕ промпт отбрасывал навсегда. Теперь платформа формулирует
   урок сама, разобрав реальный дефект. Витрина показывает это ЧЕСТНО:
   у каждого урока видно, кто автор, а рядом — отказы разбора и то,
   повторялся ли дефект ПОСЛЕ обучения. Урок, который не помог, здесь
   виден числом; без этого «платформа умнеет» осталось бы верой.

   Волна 6 добавила ВЫВОД из этого измерения. Раньше витрина показывала
   число повторов и молчала о последствиях, потому что последствий не
   было: место в промпте давалось по одной частоте. Теперь урок, который
   не работает, место уступает — и раздел обязан показывать это так же
   прямо, как успех. Отсюда два новых блока: сколько уроков доказанно
   работают против доказанно негодных, и список уроков, у которых
   формулировка ЕСТЬ, а в промпт они не идут — с причиной. Причину
   нельзя сливать в одно: «не работает» — вина формулировки и повод её
   переписать, «вне топа» — редкий дефект и никакой вины. У переписанного
   урока видна пометка о ревизии, иначе «платформа исправила свой урок»
   было бы неотличимо от «урок такой и был».

   Волна 7 закрывает дыру, из-за которой всё вышеперечисленное могло
   быть правдой и при этом ничего не значить: витрина отвечала, ЧТО
   платформа знает, и молчала о том, в какой ДОЛЕ генераций это знание
   участвует. А доля была далека от единицы — основной, бесплатный путь
   (адаптация шаблона) собирал промпт без уроков вовсе, и раздел при
   этом честно светил «платформа учится». Поэтому доля стоит первой
   цифрой, с разрезом по ветвям: одна средняя цифра снова спрятала бы
   неучащийся путь внутри себя.

   Тексты русские прямо здесь — принятый в dev-зоне паттерн
   (см. DevAgentsView/DevDeployView, i18n сюда не заведён).
   ================================================================ */

import { useCallback, useEffect, useState } from "react"
import { Brain, Loader2, GraduationCap, EyeOff, Package, RefreshCw, AlertTriangle } from "lucide-react"
import { apiClient } from "@/lib/api-client"

type TaughtLesson = {
  rule: string
  count: number
  text: string
  /** `hand` — формулировка написана руками, `self` — платформа разобрала дефект сама. */
  origin?: "hand" | "self"
  /** Повторы дефекта после начала обучения. `null` — не измеряется (у рукописных). */
  repeatedAfterLearning?: number | null
  /** Сколько раз формулировку переписывали, когда она не работала (волна 6). */
  revisions?: number
  /** Вердикт о пользе урока (волна 8: добавились `measuring` и `unmeasured`). */
  effect?: "works" | "unclear" | "fails" | "measuring" | "unmeasured"
  /** Сколько раз урок дошёл до модели после начала измерения (волна 8). */
  taughtTimes?: number
  /* Поля волны 7, п.3. Необязательные намеренно: против бэкенда без знаменателя (журнала
     генераций нет) их не будет вовсе — и тогда витрина обязана показывать абсолютные
     числа, как раньше, а не выдумывать частоту. */
  /** Сколько генераций случилось после начала обучения — знаменатель частоты. */
  generationsSinceTeaching?: number | null
  /** Доля генераций, в которых дефект возвращался после урока, 0..1. `null` — мерить нечем. */
  repeatRate?: number | null
  /** Сколько генераций прошло с последней встречи дефекта. */
  generationsSinceLastSeen?: number | null
  /** Множитель затухания, 0..1. Единица — дефект встречался только что либо мерить нечем. */
  decay?: number
}
type SilentLesson = { rule: string; count: number }
type AuthoringFailure = { rule: string; reason: string; attempts: number }
/** Урок с формулировкой, который в промпт не попал, и почему именно (волна 6). */
type DemotedLesson = { rule: string; count: number; reason: string; revisions: number }

/** Разрез охвата обучения: `key` — ветвь получения кода или глубина (волна 7). */
type CoverageSlice = { key: string; total: number; taught: number }
type LearningCoverage = {
  total: number
  taught: number
  learned: number
  /** `null` значит «генераций в окне не было» и отличается от нуля намеренно. */
  taughtShare: number | null
  learnedShare: number | null
  byPath: CoverageSlice[]
  byDepth: CoverageSlice[]
}

/** Человеческий сигнал в качестве корпуса (волна 7, п.2). `signalShare === null` —
 *  корпус пуст, это отличается от «сигнал не доходит ни до чего». */
type HumanSignalsReport = {
  templates: number
  linked: number
  deployed: number
  refined: number
  lifted: number
  penalized: number
  signalShare: number | null
}

type PlatformMemory = {
  mistakes: {
    rules: number
    occurrences: number
    promptLimit: number
    taught: TaughtLesson[]
    silent: SilentLesson[]
    silentRules: number
  }
  successes: { templates: number; reuses: number; tokensSaved: number }
  learning: boolean
  /* Поля волны 5. Необязательные намеренно: витрина обязана работать и против
     бэкенда без авторства (частичный выкат) — иначе диагностика падает там, где
     нужна больше всего. */
  authoring?: { selfAuthored: number; failures: AuthoringFailure[] }
  /* Поля волны 6 — так же необязательные: против бэкенда без отбора по пользе витрина
     обязана остаться рабочей, просто без вердиктов. */
  effectiveness?: {
    working: number
    failing: number
    demoted: DemotedLesson[]
    /* Поля волны 8, тоже необязательные: против бэкенда без точки отсчёта витрина
       остаётся рабочей и просто не показывает «идёт измерение». */
    measuring?: number
    unmeasured?: number
    supersededHandwritten?: number
    /* Поля волны 7, п.3. Тоже необязательные: бэкенд без затухания их не отдаёт, и
       блока просто нет. `rateJudged: 0` при живом корпусе — это диагноз (журнала
       генераций нет), поэтому число показывается, а не прячется. */
    faded?: number
    rateJudged?: number
  }
  /* Поле волны 7. Необязательное по той же причине: старый бэкенд доли не отдаёт, и
     тогда блока охвата просто нет — выдумывать 100% нельзя, это была бы ровно та ложь,
     которую волна 7 и снимает. */
  coverage?: { allTime: LearningCoverage; lastWeek: LearningCoverage }
  /* Поле волны 7, пункт 2. Необязательное: старый бэкенд человеческого сигнала не
     отдаёт, и тогда блока просто нет. Рисовать нули нельзя — «сигнал есть, но он ни на
     что не влияет» и «бэкенд о сигнале не знает» это разные факты. */
  humanSignals?: HumanSignalsReport
}

/* Человеческие имена ветвей получения кода. Ветвь важнее процента: она отвечает на
   вопрос «почему не учится», а не только «насколько». */
const PATH_LABELS: Record<string, string> = {
  ai: "полная AI-генерация",
  "ai-cached": "выдано из кэша",
  "template-ai": "адаптация шаблона моделью",
  "template-local": "шаблон без модели",
  fallback: "статическая заглушка",
}

const DEPTH_LABELS: Record<string, string> = {
  quick: "быстрая (бесплатная)",
  standard: "стандартная",
  deep: "глубокая",
}

/** Доля в проценты. `null` (генераций не было) — прочерк, а не «0%». */
function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`
}

const MUTED = "rgb(148 163 184 / 90%)"
const DASHED = "1px dashed rgb(226 232 240 / 18%)"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{ border: DASHED }}>
      <div className="dev-title text-[22px] leading-none">{value}</div>
      <div className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
        {label}
      </div>
      {hint ? (
        <div className="mt-1 text-[12px]" style={{ color: "rgb(148 163 184 / 65%)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export function DevMemoryView() {
  const [data, setData] = useState<PlatformMemory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<PlatformMemory>("/projects/platform-memory")
      setData(res)
    } catch {
      /* Витрина диагностическая: не получилось — так и говорим, а не
         рисуем нули, которые выглядели бы как «платформа не учится». */
      setError("Не удалось прочитать память платформы")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const m = data?.mistakes
  /* Правило с формулировкой, не попавшее в топ, до модели НЕ доходит. Считаем
     честно: всего с формулировками минус то, что реально уходит в промпт. */
  const withText = m ? m.rules - m.silentRules : 0
  const waiting = m ? Math.max(0, withText - m.taught.length) : 0
  /* Бэкенд без волны 5 не отдаёт `authoring` вовсе — тогда блоков авторства просто нет,
     а остальная витрина работает как раньше. */
  const failures = data?.authoring?.failures ?? []
  const selfAuthored = data?.authoring?.selfAuthored ?? 0
  const demoted = data?.effectiveness?.demoted ?? []
  const coverage = data?.coverage
  /* Волна 7, п.2: человеческий сигнал. Бэкенд без него поля не отдаёт — блока не будет. */
  const humanSignals = data?.humanSignals
  /* Поля волны 8. Бэкенд без точки отсчёта их не отдаёт — тогда цифры нулевые, а
     витрина работает как в волне 6. */
  const measuring = data?.effectiveness?.measuring ?? 0
  const unmeasured = data?.effectiveness?.unmeasured ?? 0
  const superseded = data?.effectiveness?.supersededHandwritten ?? 0
  /* Волна 7, п.3. `undefined` (бэкенд без затухания) и 0 различаются намеренно: ноль
     затухших уроков — рабочее состояние молодого корпуса, а отсутствие поля значит, что
     механизма нет вовсе. Показывать в обоих случаях «0» значило бы прятать второе. */
  const faded = data?.effectiveness?.faded
  const rateJudged = data?.effectiveness?.rateJudged

  return (
    <>
      <section className="pt-2">
        <h1 className="dev-title text-[26px] leading-tight md:text-[32px]">Память платформы</h1>
        <p className="mt-2 text-[14px]" style={{ color: MUTED }}>
          {loading
            ? "Читаем, что платформа успела запомнить…"
            : error
              ? /* При ошибке чтения нельзя говорить «ничему не научилась»: мы этого не знаем.
                   Поймано живой проверкой в браузере — подпись противоречила сообщению об
                   ошибке ниже и врала в самую невыгодную для платформы сторону. */
                "Память платформы сейчас недоступна — что в ней лежит, неизвестно."
              : data?.learning
                ? /* «Учится» без доли — полуправда: до волны 7 эта фраза стояла и при том,
                     что основной путь генерации уроков не видел. Если доля известна, она
                     идёт в ту же фразу, чтобы успех нельзя было прочитать шире факта. */
                  coverage && coverage.allTime.taughtShare !== null
                  ? `Платформа учится на своих поломках, и это участвует в ${pct(coverage.allTime.taughtShare)} генераций: правила ниже уходят в промпт.`
                  : "Платформа учится на своих поломках: правила ниже уходят в промпт каждой следующей генерации."
                : "Платформа пока ничему не научилась — уроки появятся после первых сборок с дефектами."}
        </p>
      </section>

      {loading ? (
        <div className="mt-8 flex items-center gap-2.5" role="status">
          <Loader2 size={18} className="animate-spin" style={{ color: "#94A3B8" }} aria-hidden="true" />
          <span className="text-[14px]" style={{ color: MUTED }}>
            Смотрим память…
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="mt-7 flex items-center gap-3 rounded-2xl px-5 py-5" style={{ border: DASHED }} role="status">
          <AlertTriangle size={18} strokeWidth={1.75} style={{ color: "#F59E0B" }} aria-hidden="true" />
          <span className="text-[14px]" style={{ color: MUTED }}>
            {error}
          </span>
          <button type="button" onClick={() => void load()} className="dev-btn ml-auto">
            <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
            Повторить
          </button>
        </div>
      ) : null}

      {m && !error ? (
        <>
          {/* ГЛАВНАЯ ЦИФРА РАЗДЕЛА, и она стоит первой намеренно. Всё остальное описывает
              содержимое памяти; эта — отвечает, участвует ли память в работе платформы
              вообще. Без неё «уроков 24, все уходят в промпт» звучало как успех при том,
              что четыре генерации из пяти шли мимо обучения. */}
          {coverage ? (
            <section className="mt-7">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat
                  label="генераций учатся (за неделю)"
                  value={pct(coverage.lastWeek.taughtShare)}
                  hint={
                    coverage.lastWeek.total === 0
                      ? "генераций за неделю не было — это не ноль"
                      : `${coverage.lastWeek.taught} из ${coverage.lastWeek.total}: код рождён промптом с уроками`
                  }
                />
                <Stat
                  label="генераций учатся (за всё время)"
                  value={pct(coverage.allTime.taughtShare)}
                  hint={
                    coverage.allTime.total === 0
                      ? "журнал пуст: измерение началось с волны 7"
                      : `${coverage.allTime.taught} из ${coverage.allTime.total}`
                  }
                />
                <Stat
                  label="генераций пополнили память"
                  value={pct(coverage.allTime.learnedShare)}
                  hint="вернули уроки платформе — обратное направление, считается отдельно"
                />
              </div>

              {/* Разрез по ветвям — единственное место, где видно, ПОЧЕМУ доля не 100%.
                  Средняя цифра выше прячет неучащийся путь внутри себя, поэтому одна без
                  другой бесполезна. */}
              {coverage.allTime.byPath.length > 0 ? (
                <>
                  <p className="mt-4 text-[13px]" style={{ color: MUTED }}>
                    Код можно получить пятью путями, и обучение доходит не до всех. Ветвь важнее
                    процента: она говорит, что именно чинить. Кэш и шаблон без модели уроков не
                    получают по своей природе — там код не рождается заново.
                  </p>
                  <ul className="mt-3 grid list-none grid-cols-1 gap-2 p-0">
                    {coverage.allTime.byPath.map((slice) => (
                      <li
                        key={slice.key}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-[13px]"
                        style={{ border: DASHED }}
                      >
                        <span>{PATH_LABELS[slice.key] ?? slice.key}</span>
                        <span style={{ color: "rgb(148 163 184 / 65%)" }}>{slice.key}</span>
                        <span
                          className="ml-auto"
                          style={{ color: slice.taught > 0 ? "#34D399" : "rgb(148 163 184 / 65%)" }}
                        >
                          {slice.taught} из {slice.total} с уроками
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {/* Разрез по глубине — проверка того самого дефекта: беден ли обучением
                  именно бесплатный путь, которым идёт основной трафик. */}
              {coverage.allTime.byDepth.length > 0 ? (
                <ul className="mt-3 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3">
                  {coverage.allTime.byDepth.map((slice) => (
                    <li key={slice.key} className="rounded-xl px-4 py-3 text-[13px]" style={{ border: DASHED }}>
                      <div>{DEPTH_LABELS[slice.key] ?? slice.key}</div>
                      <div className="mt-1" style={{ color: "rgb(148 163 184 / 65%)" }}>
                        {slice.taught} из {slice.total} с уроками
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="правил в памяти" value={String(m.rules)} hint={`${m.occurrences} поломок всего`} />
            <Stat
              label="уходит в промпт"
              value={String(m.taught.length)}
              hint={`не больше ${m.promptLimit} за раз`}
            />
            <Stat
              label="копится впустую"
              value={String(m.silentRules)}
              hint={m.silentRules > 0 ? "нет формулировки — модель их не видит" : "таких правил нет"}
            />
          </div>

          {/* Рост знания, которого не было в коде. Это и есть ответ на вопрос «платформа
              умнеет сама или только когда её правит разработчик». */}
          {data.authoring ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat
                label="уроков платформа написала сама"
                value={String(selfAuthored)}
                hint={selfAuthored > 0 ? "знание, которого не было в коде" : "пока все формулировки рукописные"}
              />
              <Stat
                label="разборов без результата"
                value={String(failures.length)}
                hint={failures.length > 0 ? "причины — ниже, это не тишина" : "неудачных разборов нет"}
              />
            </div>
          ) : null}

          {/* Главный вывод волны 6: не «сколько уроков», а сколько из них ПОМОГЛО.
              Без этой пары цифр рост числа уроков выглядел бы успехом сам по себе. */}
          {data.effectiveness ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="уроков доказанно работают"
                value={String(data.effectiveness.working)}
                hint={
                  data.effectiveness.working > 0
                    ? "после них дефект не повторялся — место в промпте закреплено"
                    : "пока ни один урок не подтверждён измерением"
                }
              />
              <Stat
                label="уроков не работают"
                value={String(data.effectiveness.failing)}
                hint={
                  data.effectiveness.failing > 0
                    ? "дефект повторяется — формулировка уступает место и переписывается"
                    : "негодных формулировок нет"
                }
              />
              {/* Волна 8. Третья цифра появилась потому, что первые две были обречены на
                  ноль: у рукописных уроков не существовало момента, с которого считать
                  повторы. Теперь он есть — и пока пробега мало, честный ответ не
                  «работает» и не «не работает», а «измеряем». */}
              <Stat
                label="уроков в измерении"
                value={String(measuring)}
                hint={
                  measuring > 0
                    ? "отсчёт начат, но модель видела их слишком мало раз для вывода"
                    : unmeasured > 0
                      ? `${unmeasured} урок(а) не измеряются: в промпт ещё не уходили`
                      : "все уроки с формулировкой уже под измерением"
                }
              />
            </div>
          ) : null}

          {/* Волна 7, п.3. Затухание — единственный механизм памяти, который что-то
              ОТНИМАЕТ: место в промпте у правила, чей дефект давно не встречался. Механизм,
              отнимающий молча, невозможно отличить от поломки отбора, поэтому «почему этого
              урока нет в промпте» обязано иметь ответ числом.

              Вторая цифра отвечает на вопрос, чем платформа судит уроки. Ноль при живом
              корпусе — не косметика: значит журнала генераций нет, знаменателя нет, и рост
              трафика снова выглядит как деградация уроков. */}
          {typeof faded === "number" || typeof rateJudged === "number" ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat
                label="уроков затухло"
                value={String(faded ?? 0)}
                hint={
                  (faded ?? 0) > 0
                    ? "дефект давно не встречался — правило больше не держит место историей"
                    : "историей место никто не держит"
                }
              />
              <Stat
                label="уроков судятся частотой"
                value={String(rateJudged ?? 0)}
                hint={
                  (rateJudged ?? 0) > 0
                    ? "повторы делятся на число генераций — рост трафика больше не выглядит деградацией"
                    : "знаменателя нет: вердикты выносятся по абсолютному счётчику, как до волны 7"
                }
              />
            </div>
          ) : null}

          {/* Единственный случай, когда машина переспорила разработчика. Держим отдельной
              строкой: это исключение из приоритета рукописного текста, и оно должно быть
              заметно основателю, а не спрятано в агрегате. */}
          {superseded > 0 ? (
            <div className="mt-3">
              <Stat
                label="рукописных формулировок платформа заменила своими"
                value={String(superseded)}
                hint="рукописный текст измеренно не работал — дефект повторялся после него"
              />
            </div>
          ) : null}

          {/* Выученное — то, что реально доходит до модели. */}
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-[15px] font-medium">
              <GraduationCap size={17} strokeWidth={1.75} style={{ color: "#F59E0B" }} aria-hidden="true" />
              Что платформа говорит себе перед каждой генерацией
            </h2>
            {m.taught.length > 0 ? (
              <ol className="mt-4 grid list-none grid-cols-1 gap-2.5 p-0">
                {m.taught.map((lesson, i) => (
                  <li key={lesson.rule} className="rounded-2xl px-5 py-4" style={{ border: DASHED }}>
                    <div className="flex items-baseline gap-2.5">
                      <span className="dev-title text-[15px] leading-none">{i + 1}</span>
                      <p className="text-[14px] leading-relaxed">{lesson.text}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "rgb(148 163 184 / 65%)" }}>
                      <span>
                        {lesson.rule} · ломало сборку {lesson.count} раз(а)
                      </span>
                      {lesson.origin === "self" ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ border: DASHED, color: "#F59E0B" }}
                          title="Формулировку платформа написала сама, разобрав реальный дефект"
                        >
                          сформулировала сама
                        </span>
                      ) : null}
                      {/* Ревизия. Без пометки «платформа исправила свою формулировку»
                          неотличимо от «формулировка такой и была». */}
                      {lesson.revisions ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ border: DASHED, color: MUTED }}
                          title="Прежняя формулировка не работала, платформа написала новую"
                        >
                          переписан {lesson.revisions} раз(а)
                        </span>
                      ) : null}
                      {/* Работает ли урок. Показываем ТОЛЬКО когда измеряем: у урока без
                          точки отсчёта её нет, и подставлять ноль было бы ложью.

                          Волна 8 добавила третью подпись. Ноль повторов у урока, который
                          модель видела один-два раза, — это ещё не «сработало»: пока
                          зелёная надпись стояла и там, витрина торопилась с выводом. */}
                      {/* Затухание (волна 7, п.3). Пометка обязательна: у ЗАТУХШЕГО урока,
                          оставшегося в промпте, место дало не давление дефекта, а доказанная
                          польза — без подписи это неотличимо от «правило всё ещё частое». */}
                      {typeof lesson.decay === "number" && lesson.decay < 0.5 ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{ border: DASHED, color: MUTED }}
                          title="Дефект давно не встречался: правило больше не держит место в промпте своей историей"
                        >
                          затухло
                          {typeof lesson.generationsSinceLastSeen === "number"
                            ? ` · не встречалось ${lesson.generationsSinceLastSeen} генераций`
                            : ""}
                        </span>
                      ) : null}
                      {typeof lesson.repeatedAfterLearning === "number" ? (
                        lesson.effect === "measuring" ? (
                          <span style={{ color: MUTED }}>
                            идёт измерение
                            {typeof lesson.taughtTimes === "number" ? ` · модель видела ${lesson.taughtTimes} раз(а)` : ""}
                          </span>
                        ) : (
                          <span style={{ color: lesson.repeatedAfterLearning === 0 ? "#34D399" : "#F59E0B" }}>
                            {lesson.repeatedAfterLearning === 0
                              ? "после урока не повторялось"
                              : /* Волна 7, п.3: повторы со ЗНАМЕНАТЕЛЕМ. Одна и та же двойка —
                                   провал урока на десяти генерациях и успех на тысяче, поэтому
                                   абсолютное число без частоты вводило в заблуждение. Частоты
                                   нет (старый бэкенд) — остаётся прежняя фраза, без выдумок. */
                                `повторилось ${lesson.repeatedAfterLearning} раз(а)` +
                                (typeof lesson.generationsSinceTeaching === "number" &&
                                typeof lesson.repeatRate === "number"
                                  ? ` за ${lesson.generationsSinceTeaching} генераций — ${Math.round(
                                      lesson.repeatRate * 100,
                                    )}%${
                                      lesson.effect === "fails"
                                        ? ": формулировка не работает"
                                        : ": для приговора мало"
                                    }`
                                  : " после урока — формулировка не работает")}
                          </span>
                        )
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-2xl px-5 py-6 text-[14px]" style={{ border: DASHED, color: MUTED }}>
                Пока пусто. Это не поломка: уроки берутся из реальных дефектов, а их ещё не было.
              </p>
            )}
          </section>

          {/* Провал обучения — рядом с успехом, а не спрятан. */}
          {m.silent.length > 0 ? (
            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-[15px] font-medium">
                <EyeOff size={17} strokeWidth={1.75} style={{ color: "#F59E0B" }} aria-hidden="true" />
                Считается, но не учит
              </h2>
              <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                У этих правил пока нет формулировки, поэтому промпт их отбрасывает: счётчик растёт, а
                модель ошибку повторяет. Платформа берёт их на разбор сама — по два за генерацию,
                начиная с самых частых. Если правило задержалось здесь, причина видна ниже.
              </p>
              <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                {m.silent.map((lesson) => (
                  <li
                    key={lesson.rule}
                    className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px]"
                    style={{ border: DASHED }}
                  >
                    <span>{lesson.rule}</span>
                    <span style={{ color: "rgb(148 163 184 / 65%)" }}>{lesson.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Вторая потеря обучения, которую волна 4 не различала: формулировка ЕСТЬ, а
              до модели не доходит. Раньше здесь стояла одна фраза «ждут очереди» — она
              валила в кучу редкий дефект и негодную формулировку, то есть скрывала ровно
              то, что надо чинить. Теперь у каждого урока названа причина. */}
          {demoted.length > 0 ? (
            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-[15px] font-medium">
                <EyeOff size={17} strokeWidth={1.75} style={{ color: "#F59E0B" }} aria-hidden="true" />
                Урок есть, но в промпт не идёт
              </h2>
              <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                Мест в промпте ровно {m.promptLimit}, поэтому каждый бесполезный урок стоит одного
                полезного. «Не работает» значит, что дефект повторялся после урока — такую
                формулировку платформа переписывает сама. «Вне топа» вины формулировки не значит:
                дефект просто слишком редкий, чтобы занять место.
              </p>
              <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0">
                {demoted.map((lesson) => (
                  <li
                    key={lesson.rule}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-[13px]"
                    style={{ border: DASHED }}
                  >
                    <span>{lesson.rule}</span>
                    <span style={{ color: lesson.reason === "не работает" ? "#F59E0B" : "rgb(148 163 184 / 65%)" }}>
                      {lesson.reason}
                    </span>
                    <span className="ml-auto" style={{ color: "rgb(148 163 184 / 65%)" }}>
                      {lesson.count} поломок{lesson.revisions ? ` · переписан ${lesson.revisions} раз(а)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : waiting > 0 ? (
            /* Бэкенд без волны 6 причин не отдаёт — тогда честнее старая общая фраза,
               чем выдуманный вердикт. */
            <p className="mt-6 text-[13px]" style={{ color: MUTED }}>
              Ещё {waiting} правил(о) с формулировкой ждут очереди: в промпт уходит только топ по
              частоте, поэтому редкий дефект до модели пока не доходит.
            </p>
          ) : null}

          {/* Отказы разбора. Без этого блока задержка правила в «не учит» была бы
              необъяснимой: непонятно, разбор ещё не доходил до него или модель не смогла
              дать годную формулировку. Провал обучения обязан быть виден так же, как успех. */}
          {failures.length > 0 ? (
            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-[15px] font-medium">
                <AlertTriangle size={17} strokeWidth={1.75} style={{ color: "#F59E0B" }} aria-hidden="true" />
                Разбор не дал урока
              </h2>
              <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                Платформа пыталась сформулировать урок для этих правил и отказалась от результата.
                Формулировка уходит в промпт каждой следующей генерации, поэтому сомнительную лучше
                не принимать вовсе: после двух отказов правило перестаёт тратить вызовы модели.
              </p>
              <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0">
                {failures.map((f) => (
                  <li key={f.rule} className="rounded-xl px-4 py-3 text-[13px]" style={{ border: DASHED }}>
                    <span>{f.rule}</span>
                    <span className="ml-2" style={{ color: "rgb(148 163 184 / 65%)" }}>
                      {f.reason} · попыток: {f.attempts}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Память удач — вторая половина корпуса ремесла. */}
          <section className="mt-9">
            <h2 className="flex items-center gap-2 text-[15px] font-medium">
              <Package size={17} strokeWidth={1.75} style={{ color: "#F59E0B" }} aria-hidden="true" />
              Память удач
            </h2>
            <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
              Шаблоны, отобранные по измеримому качеству: лучший вытесняет худшего, поэтому корпус
              улучшается, а не просто растёт.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="шаблонов в корпусе" value={String(data.successes.templates)} />
              <Stat label="переиспользований" value={String(data.successes.reuses)} />
              <Stat
                label="сэкономлено токенов"
                value={data.successes.tokensSaved.toLocaleString("ru-RU")}
                hint="оценка, а не счёт провайдера"
              />
            </div>

            {/* Человеческий сигнал (волна 7, п.2). Всё выше — измерения машины: собралось,
                сколько ремонтов, какой балл интерфейса. Здесь видно, что с кодом сделал
                ЧЕЛОВЕК: выложил наружу или пошёл просить переделать.

                Первой стоит доля, до которой сигнал ДОХОДИТ, а не сами сигналы. Механизм
                работает только по шаблонам с проектом-родителем, и корпус, накопленный до
                миграции 100, такой связи не имеет — «сигнал включён» при нулевой доле
                означает ноль изменённых решений, и это обязано быть видно числом. */}
            {humanSignals ? (
              <div className="mt-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat
                    label="шаблонов под человеческим сигналом"
                    value={pct(humanSignals.signalShare)}
                    hint={
                      humanSignals.templates === 0
                        ? "корпус пуст — это не ноль"
                        : `${humanSignals.lifted + humanSignals.penalized} из ${humanSignals.templates}: у остальных нет проекта-родителя`
                    }
                  />
                  <Stat
                    label="человек выложил наружу"
                    value={String(humanSignals.deployed)}
                    hint="деплой — сильнейшее «годится», какое платформа видит"
                  />
                  <Stat
                    label="человек просил переделать"
                    value={String(humanSignals.refined)}
                    hint="доработка — признание, что результат не подошёл"
                  />
                </div>
                <p className="mt-3 text-[13px]" style={{ color: MUTED }}>
                  Отбор поднял {humanSignals.lifted}{" "}
                  {humanSignals.lifted === 1 ? "шаблон" : "шаблонов"} и опустил{" "}
                  {humanSignals.penalized}. Связь с проектом есть у {humanSignals.linked} из{" "}
                  {humanSignals.templates}: отсутствие сигнала не штраф — такой шаблон судится
                  только машинным баллом, как и раньше.
                </p>
              </div>
            ) : null}
          </section>

          <div className="mt-8 flex items-center gap-3">
            <button type="button" onClick={() => void load()} className="dev-btn">
              <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
              Обновить
            </button>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "rgb(148 163 184 / 65%)" }}>
              <Brain size={13} strokeWidth={1.75} aria-hidden="true" />
              данные из реальной статистики этой платформы
            </span>
          </div>
        </>
      ) : null}
    </>
  )
}

export default DevMemoryView
