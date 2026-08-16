"use client"

/* ================================================================
   OSGARD · GenerationMeter — честный чек сборки приложения.
   ----------------------------------------------------------------
   Зачем это существует. На рынке AI-сборщиков (Lovable, Bolt.new, v0,
   Replit Agent) претензия №1 у пользователей одна и та же: расход
   кредитов непредсказуем и выясняется ПОСТФАКТУМ. Человек нажимает
   «собрать», смотрит в спиннер, а цену узнаёт когда квота сгорела.
   Претензия №2 — «выглядит готовым, но не работает»: сборщик объявляет
   успех, а кнопка в приложении не нажимается.

   Здесь закрыты обе, и это то, чего нет ни у одного конкурента:

   • LiveGenerationMeter — расход ВИДЕН, пока идёт работа. Обращения к
     моделям, токены и время растут на глазах, а не появляются в конце.
   • GenerationMeterCard — итог с метрикой «с первого раза»: заработало
     ли приложение без единой починки. Строгий смысл: вердикт `passed`
     И ноль ремонтов. Починенное сюда не входит — платформа справилась,
     но с первого раза не вышло, и записывать это себе в успех значило
     бы обманывать ровно так, как обманывают конкуренты.

   Правило честности, которому подчинён весь файл: НЕТ ДАННЫХ ≠ НОЛЬ.
   Проект, сгенерированный до появления счётчика, показывает «расход не
   измерялся», а не «0 токенов». Вызов модели, не вернувший usage, даёт
   пометку «приблизительно», а не тихо считается точным. Выдуманная
   цифра здесь хуже отсутствующей — она подрывает единственное, ради
   чего этот экран нужен.
   ================================================================ */

import { useEffect, useState } from "react"
import { Gauge, Coins, Timer, Bot, CheckCircle2, Wrench, HelpCircle } from "lucide-react"
import type { LiveMeter } from "@/hooks/useProjectGenerationStream"
import type { GenerationMeter } from "@/lib/store/osgard-store"

/* ---------------- форматирование ---------------- */

/** Токены: 0 → «0», 1 234 → «1 234», 12 345 → «12,3 тыс.».
 *  Тысячи сокращаем, потому что точное число шестизначных токенов
 *  человеку ничего не говорит, а длина ломает строку счётчика. */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return n.toLocaleString("ru-RU")
  return `${(n / 1000).toFixed(1).replace(".", ",")} тыс.`
}

/** Время: 8 с · 1 мин 12 с · 3 мин. Миллисекунды человеку не нужны. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} с`
  const min = Math.floor(total / 60)
  const sec = total % 60
  return sec === 0 ? `${min} мин` : `${min} мин ${sec} с`
}

/* ---------------- живой счётчик (во время сборки) ---------------- */

/**
 * Тикающий расход прямо во время генерации.
 *
 * @param meter     последний снимок расхода из SSE (null — тиков ещё не было)
 * @param startedAt время начала сборки (мс) — из первой стадии потока
 * @param active    идёт ли сборка: на терминале секунды замирают
 */
export function LiveGenerationMeter({
  meter,
  startedAt,
  active,
  compact = false,
}: {
  meter: LiveMeter | null
  startedAt: number | null
  active: boolean
  /** Компактный вид — одна строка без рамки (для ряда агента в списке). */
  compact?: boolean
}) {
  /* Секунды идут локально: слать кадр раз в секунду только ради часов —
     напрасный трафик, а время и без сервера известно точно. Токены при
     этом ТОЛЬКО из потока: выдумывать их локально нельзя. */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active || startedAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, startedAt])

  const elapsed = startedAt !== null ? Math.max(0, now - startedAt) : null
  const approx = (meter?.estimated ?? 0) > 0

  const items: Array<{ Icon: typeof Coins; text: string; title: string }> = []

  if (elapsed !== null) {
    items.push({
      Icon: Timer,
      text: formatDuration(elapsed),
      title: "Сколько идёт сборка",
    })
  }

  if (meter) {
    items.push({
      Icon: Bot,
      text: `${meter.aiCalls}`,
      title: `Обращений к моделям: ${meter.aiCalls}`,
    })
    items.push({
      Icon: Coins,
      text: `${approx ? "≈" : ""}${formatTokens(meter.totalTokens)}`,
      title: approx
        ? `Токенов: примерно ${meter.totalTokens} — часть вызовов не вернула точный расход`
        : `Токенов: ${meter.totalTokens} (${meter.tokensIn} отправлено, ${meter.tokensOut} получено)`,
    })
  }

  if (items.length === 0) return null

  const row = (
    <>
      {items.map(({ Icon, text, title }, i) => (
        <span key={i} className="inline-flex items-center gap-1.5" title={title}>
          <Icon size={13} strokeWidth={1.75} aria-hidden="true" style={{ color: "#94A3B8" }} />
          <span style={{ color: "#CBD5E1", fontVariantNumeric: "tabular-nums" }}>{text}</span>
        </span>
      ))}
    </>
  )

  /* role="status" + aria-live="polite": расход — это статус, а не оповещение.
     Скринридер сообщит об изменении, не перебивая текущее чтение. Тикающие
     секунды в живую область НЕ попадают (см. aria-hidden ниже) — иначе
     озвучка превратилась бы в отсчёт вслух каждую секунду. */
  const content = (
    <div
      className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${compact ? "" : "mt-2"}`}
      role="status"
      aria-live="polite"
      aria-label={
        meter
          ? `Расход сборки: обращений к моделям ${meter.aiCalls}, токенов ${approx ? "примерно " : ""}${meter.totalTokens}`
          : "Расход сборки пока не измерен"
      }
    >
      {row}
      {approx ? (
        <span style={{ color: "rgb(148 163 184 / 75%)" }} title="Часть вызовов не вернула точный расход">
          примерно
        </span>
      ) : null}
    </div>
  )

  if (compact) return content

  return (
    <div
      className="mt-3 rounded-xl px-3.5 py-2.5"
      style={{ background: "rgb(226 232 240 / 4%)", border: "1px solid rgb(226 232 240 / 12%)" }}
    >
      <div className="flex items-center gap-1.5">
        <Gauge size={13} strokeWidth={1.75} aria-hidden="true" style={{ color: "#7DD3FC" }} />
        <span className="text-[11px] tracking-[0.06em] uppercase" style={{ color: "rgb(148 163 184 / 85%)" }}>
          Расход
        </span>
      </div>
      {content}
    </div>
  )
}

/* ---------------- итоговая карточка (после сборки) ---------------- */

/** Одна цифра итога. */
function Fact({
  Icon,
  label,
  value,
  hint,
}: {
  Icon: typeof Coins
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={12} strokeWidth={1.75} aria-hidden="true" style={{ color: "#94A3B8" }} />
        <span className="text-[11px]" style={{ color: "rgb(148 163 184 / 85%)" }}>
          {label}
        </span>
      </div>
      <p
        className="mt-0.5 text-[15px] font-medium"
        style={{ color: "#F1F5F9", fontVariantNumeric: "tabular-nums" }}
        title={hint}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * Итог сборки: во что обошлась и вышло ли с первого раза.
 *
 * @param meter расход из GET /projects/:id/engineering. null/undefined —
 *              проект сгенерирован до появления счётчика: так и написано,
 *              никаких нулей вместо неизвестного.
 */
export function GenerationMeterCard({ meter }: { meter: GenerationMeter | null | undefined }) {
  /* «Не измерялось» — полноценное состояние, а не пустота. Скрыть карточку
     значило бы оставить человека в догадках, почему у одних проектов чек
     есть, а у других нет. */
  const measured = !!meter && meter.durationMs !== null

  if (!measured) {
    return (
      <div
        className="rounded-xl px-4 py-3"
        style={{ background: "rgb(226 232 240 / 3%)", border: "1px dashed rgb(226 232 240 / 16%)" }}
      >
        <div className="flex items-center gap-2">
          <HelpCircle size={14} strokeWidth={1.75} aria-hidden="true" style={{ color: "#94A3B8" }} />
          <p className="text-[12.5px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
            Расход этой сборки не измерялся — она прошла до появления счётчика.
          </p>
        </div>
      </div>
    )
  }

  const detail = meter.detail
  const unmeasured = detail?.unmeasured ?? 0
  const approx = unmeasured > 0
  const tokensIn = meter.tokensIn ?? 0
  const tokensOut = meter.tokensOut ?? 0
  const totalTokens = tokensIn + tokensOut
  const repairedFiles = detail?.repairedFiles ?? 0
  const firstTry = meter.firstTry

  /* Три состояния вердикта «с первого раза», и ни одно не приукрашено:
     да · нет (с числом починок) · неизвестно. */
  const verdictTone = firstTry === true ? "#86EFAC" : firstTry === false ? "#FBBF24" : "#94A3B8"
  const VerdictIcon = firstTry === true ? CheckCircle2 : firstTry === false ? Wrench : HelpCircle
  const verdictText =
    firstTry === true
      ? "Приложение заработало с первого раза"
      : firstTry === false
        ? repairedFiles > 0
          ? `Понадобился ремонт: платформа сама починила ${repairedFiles} ${pluralFiles(repairedFiles)}`
          : "С первого раза не вышло — приложению понадобилась доработка"
        : "Вышло ли с первого раза — неизвестно"

  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{ background: "rgb(226 232 240 / 4%)", border: "1px solid rgb(226 232 240 / 14%)" }}
    >
      {/* ── Главное: вышло ли с первого раза ── */}
      <div className="flex items-start gap-2">
        <VerdictIcon
          size={15}
          strokeWidth={1.75}
          aria-hidden="true"
          style={{ color: verdictTone, flexShrink: 0, marginTop: 1 }}
        />
        <p className="text-[13px] font-medium" style={{ color: verdictTone }}>
          {verdictText}
        </p>
      </div>

      {/* ── Чек: во что обошлось ── */}
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact
          Icon={Timer}
          label="Заняло"
          value={formatDuration(meter.durationMs ?? 0)}
          hint="Полное время сборки: генерация, проверки, ремонт и запись файлов"
        />
        <Fact
          Icon={Bot}
          label="Обращений к ИИ"
          value={String(meter.aiCalls ?? 0)}
          hint={
            detail?.failedCalls
              ? `Из них неуспешных: ${detail.failedCalls} (они тоже стоили времени)`
              : "Все обращения к моделям, включая проверки и ремонт"
          }
        />
        <Fact
          Icon={Coins}
          label="Токенов"
          value={`${approx ? "≈" : ""}${formatTokens(totalTokens)}`}
          hint={`Отправлено ${tokensIn}, получено ${tokensOut}${
            approx ? ` · ${unmeasured} ${pluralCalls(unmeasured)} не вернули точный расход` : ""
          }`}
        />
        <Fact
          Icon={Wrench}
          label="Раундов ремонта"
          value={String(detail?.repairRounds ?? 0)}
          hint="Сколько раз инженерный контур чинил найденные дефекты"
        />
      </div>

      {/* ── Разбивка по моделям: видно, кто сколько съел ── */}
      {detail?.byProvider && Object.keys(detail.byProvider).length > 0 ? (
        <ul className="mt-3.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11.5px]">
          {Object.entries(detail.byProvider).map(([provider, stat]) => (
            <li key={provider} style={{ color: "rgb(148 163 184 / 85%)" }}>
              {provider}:{" "}
              <span style={{ color: "#CBD5E1", fontVariantNumeric: "tabular-nums" }}>
                {formatTokens(stat.tokens)}
              </span>{" "}
              за {stat.calls} {pluralCalls(stat.calls)}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── Оговорка к точности: ставится только когда она есть ── */}
      {approx ? (
        <p className="mt-3 text-[11.5px]" style={{ color: "rgb(148 163 184 / 75%)" }}>
          {unmeasured} {pluralCalls(unmeasured)} не вернули точный расход — эти токены оценены по объёму
          текста, поэтому итог приблизительный.
        </p>
      ) : null}
    </div>
  )
}

/* ---------------- склонения ----------------
   Числа в этом экране почти всегда идут с существительным, а «1 файлов»
   в интерфейсе, который продаёт честность и аккуратность, недопустимо. */

function pluralFiles(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "файл"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "файла"
  return "файлов"
}

function pluralCalls(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "вызов"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "вызова"
  return "вызовов"
}
