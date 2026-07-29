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
}
type SilentLesson = { rule: string; count: number }
type AuthoringFailure = { rule: string; reason: string; attempts: number }

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
                ? "Платформа учится на своих поломках: правила ниже уходят в промпт каждой следующей генерации."
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
                      {/* Работает ли урок. Показываем ТОЛЬКО когда измеряем: у рукописных
                          точки отсчёта нет, и подставлять ноль было бы ложью. */}
                      {typeof lesson.repeatedAfterLearning === "number" ? (
                        <span style={{ color: lesson.repeatedAfterLearning === 0 ? "#34D399" : "#F59E0B" }}>
                          {lesson.repeatedAfterLearning === 0
                            ? "после урока не повторялось"
                            : `повторилось ${lesson.repeatedAfterLearning} раз(а) после урока — формулировка не работает`}
                        </span>
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

          {waiting > 0 ? (
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
