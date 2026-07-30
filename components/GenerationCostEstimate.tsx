"use client"

/* ================================================================
   GenerationCostEstimate — смета генерации ДО нажатия кнопки
   ----------------------------------------------------------------
   Платформа умела честно называть расход ПОСЛЕ генерации (счётчик 095) —
   то есть когда квота уже потрачена. Здесь она называет его ЗАРАНЕЕ, по
   собственной истории: сколько обращений к моделям, сколько токенов,
   сколько ждать и как часто такие генерации собирались с первого раза.

   Три правила показа, без которых смета стала бы украшением:

   1. ВЕДЁТ КОРИДОР, ЧИСЛО — ОРИЕНТИР. Крупным показан интервал, а медиана
      стоит подписью «ориентир» под ним. Сначала было наоборот — «~470 тыс.»
      крупно, коридор мелко, — и живая проверка на настоящих генерациях
      объяснила, почему так нельзя: медиана попадала в ±10% факта один раз
      из шести, отклонения доходили до +86%. Причина не в статистике:
      расход задаёт сложность самой идеи (разброс между идеями двукратный),
      а смета считается по профилю «глубина + путь» и на идею не смотрит.
      Крупное число в таком месте — это обещание, которое платформа не может
      сдержать, и человек справедливо сочтёт его обманом. Интервал —
      обещание, которое сдержать можно.
   2. ОСНОВАНИЕ ВИДНО. «По 12 таким же генерациям» и «похожих ещё не
      было» — разные утверждения, и человек должен различать их до
      запуска, а не удивляться после.
   3. НЕТ ДАННЫХ — НЕТ ЧИСЕЛ. Пустая история показывается словами, а не
      нулями: ноль токенов и «не знаем» — не одно и то же.

   Компонент чистый (данные приходят пропсами) — его же использует
   мобильный клиент через свою вёрстку. Загрузка сметы вынесена в хук
   useGenerationEstimate.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react"
import { Calculator, Coins, Clock, Cpu, Sparkles, ShieldCheck } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { apiClient } from "@/lib/api-client"
import { useTranslation } from "@/lib/i18n/use-translation"

export type EstimateSpread = { median: number; low: number; high: number }

export type DepthEstimate = {
  depth: "quick" | "standard" | "deep"
  path: "template" | "ai"
  credits: number
  countsAgainstQuota: boolean
  basis: "profile" | "depth" | "platform" | "none"
  samples: number
  aiCalls: EstimateSpread | null
  tokens: EstimateSpread | null
  durationMs: EstimateSpread | null
  firstTryRate: number | null
  unmeasuredShare: number
}

export type GenerationEstimateResponse = {
  plan: string
  quota: { dailyLimit: number | null; used: number; remaining: number | null }
  templateTheme: string | null
  estimates: Record<"quick" | "standard" | "deep", DepthEstimate>
  makegood:
    | { available: false }
    | {
        available: true
        depth: string
        credits: number
        projectId: number
        reason: string
        reasonText: string
      }
  disclaimer: string
}

/** «470 тыс.» вместо «470000»: смета читается глазом, а не считывается посимвольно. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} млн`
  if (value >= 1_000) return `${Math.round(value / 1_000)} тыс.`
  return String(value)
}

/** Длительность словами: «2 мин 30 с». Миллисекунды человеку не нужны. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds} с`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} мин` : `${minutes} мин ${seconds} с`
}

/**
 * Границы времени для тесной строки: «2–4 мин» вместо «1 мин 40 с – 3 мин 20 с».
 * Низ округляется вниз, верх вверх — округление расширяет коридор, а не сужает:
 * ошибка в сторону «может занять дольше» человека не подводит, обратная — подводит.
 */
export function formatDurationRange(lowMs: number, highMs: number): string {
  const lowSec = Math.max(0, Math.floor(lowMs / 1000))
  const highSec = Math.max(0, Math.ceil(highMs / 1000))
  if (highSec < 60) return `${lowSec}–${highSec} с`
  const lowMin = Math.floor(lowSec / 60)
  const highMin = Math.max(1, Math.ceil(highSec / 60))
  return lowMin === highMin ? `~${highMin} мин` : `${lowMin}–${highMin} мин`
}

/**
 * Короткая строка расхода для карточки глубины: «300–620 тыс. · 2–4 мин».
 * Именно коридор, а не медиана с тильдой: на карточке выбора глубины «~470 тыс.»
 * читалось бы как цена варианта, а платформа этого числа не гарантирует.
 * null, если истории нет — карточка тогда молчит, а не показывает нули.
 */
export function depthCostBadge(estimate: DepthEstimate | undefined): string | null {
  if (!estimate || estimate.basis === "none" || !estimate.tokens || !estimate.durationMs) return null
  const tokens =
    estimate.tokens.low === estimate.tokens.high
      ? `~${formatTokens(estimate.tokens.median)}`
      : `${formatTokens(estimate.tokens.low)}–${formatTokens(estimate.tokens.high)}`
  return `${tokens} · ${formatDurationRange(estimate.durationMs.low, estimate.durationMs.high)}`
}

/**
 * Загружает смету по замыслу. Пересчитывает при изменении идеи с задержкой:
 * человек печатает описание, и запрос на каждый символ превратил бы подсказку
 * в нагрузку (на сервере смета читает историю и корпус шаблонов).
 *
 * Ошибка загрузки НЕ показывается как проблема генерации: смета — помощь перед
 * запуском, её отсутствие не должно мешать запускать.
 */
export function useGenerationEstimate(params: { name?: string; hint?: string; enabled?: boolean }) {
  const { name, hint, enabled = true } = params
  const [data, setData] = useState<GenerationEstimateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await apiClient.post<GenerationEstimateResponse>("/projects/generation-estimate", {
        name,
        hint,
      })
      /* Ответ на устаревший запрос игнорируем: иначе медленный первый запрос перезапишет
         смету, посчитанную по более свежему описанию. */
      if (id === requestId.current) setData(res)
    } catch {
      if (id === requestId.current) setData(null)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [name, hint])

  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => void load(), 400)
    return () => clearTimeout(timer)
  }, [enabled, load])

  return { estimate: data, loading, reload: load }
}

/** Человекочитаемое основание сметы — почему этим числам можно верить (или нельзя). */
function basisText(estimate: DepthEstimate, t: (key: string, vars?: Record<string, any>) => string): string {
  switch (estimate.basis) {
    case "profile":
      return t("generationEstimate.basisProfile", { count: estimate.samples })
    case "depth":
      return t("generationEstimate.basisDepth", { count: estimate.samples })
    case "platform":
      return t("generationEstimate.basisPlatform", { count: estimate.samples })
    default:
      return t("generationEstimate.basisNone")
  }
}

type Props = {
  estimate: GenerationEstimateResponse | null
  depthId: "quick" | "standard" | "deep"
  loading?: boolean
}

export function GenerationCostEstimate({ estimate, depthId, loading = false }: Props) {
  const { t } = useTranslation()

  if (!estimate) {
    return loading ? (
      <p className="mt-4 text-[12px]" style={{ color: COLORS.label }}>
        {t("generationEstimate.loading")}
      </p>
    ) : null
  }

  const current = estimate.estimates?.[depthId]
  if (!current) return null

  const hasNumbers = current.basis !== "none" && current.tokens && current.aiCalls && current.durationMs
  const makegood = estimate.makegood

  return (
    <div className="mt-4 rounded-lg p-3" style={{ border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: COLORS.text }}>
          <Calculator size={13} strokeWidth={1.75} />
          {t("generationEstimate.title")}
        </span>
        <span className="text-[11px]" style={{ color: COLORS.label }}>
          {basisText(current, t)}
        </span>
      </div>

      {/* Твёрдая часть цены известна точно и показывается всегда — в отличие от расхода. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: COLORS.text }}>
        <span className="inline-flex items-center gap-1">
          <Coins size={12} strokeWidth={1.75} style={{ color: current.credits > 0 ? COLORS.amber : COLORS.green }} />
          {current.credits > 0
            ? t("generationEstimate.credits", { cost: current.credits })
            : t("generationEstimate.creditsFree")}
        </span>
        {current.countsAgainstQuota && (
          <span style={{ color: COLORS.label }}>
            {estimate.quota.remaining === null
              ? t("generationEstimate.quotaUnlimited")
              : t("generationEstimate.quotaLeft", { left: estimate.quota.remaining })}
          </span>
        )}
      </div>

      {hasNumbers ? (
        <>
          {/* Крупное — интервал; медиана уходит в подпись «ориентир». Порядок здесь
              не оформление: он определяет, что человек примет за обещание. */}
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <EstimateRow
              icon={<Cpu size={12} strokeWidth={1.75} />}
              label={t("generationEstimate.aiCalls")}
              corridor={rangeText(current.aiCalls!, String, t)}
              hint={t("generationEstimate.hint", { value: current.aiCalls!.median })}
            />
            <EstimateRow
              icon={<Sparkles size={12} strokeWidth={1.75} />}
              label={t("generationEstimate.tokens")}
              corridor={rangeText(current.tokens!, formatTokens, t)}
              hint={t("generationEstimate.hint", { value: formatTokens(current.tokens!.median) })}
            />
            <EstimateRow
              icon={<Clock size={12} strokeWidth={1.75} />}
              label={t("generationEstimate.duration")}
              corridor={rangeText(current.durationMs!, formatDuration, t)}
              hint={t("generationEstimate.hint", { value: formatDuration(current.durationMs!.median) })}
            />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>
            {t("generationEstimate.corridorMeaning")}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>
          {t("generationEstimate.noHistory")}
        </p>
      )}

      {/* Ожидание качества — вторая половина честного ответа на «во что это обойдётся»:
          дешёвая генерация, которую придётся чинить, обходится дороже. */}
      {current.firstTryRate !== null && (
        <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>
          {t("generationEstimate.firstTry", { percent: Math.round(current.firstTryRate * 100) })}
        </p>
      )}

      {current.path === "template" && estimate.templateTheme && (
        <p className="mt-1.5 text-[12px]" style={{ color: COLORS.green }}>
          {t("generationEstimate.templateFound", { theme: estimate.templateTheme })}
        </p>
      )}

      {current.unmeasuredShare > 0.1 && (
        <p className="mt-1.5 text-[11px]" style={{ color: COLORS.label }}>
          {t("generationEstimate.unmeasured", { percent: Math.round(current.unmeasuredShare * 100) })}
        </p>
      )}

      {makegood.available && (
        <p
          className="mt-2 inline-flex items-start gap-1.5 rounded-md p-2 text-[12px]"
          style={{ backgroundColor: "rgba(16,185,129,0.08)", color: COLORS.green }}
        >
          <ShieldCheck size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{t("generationEstimate.makegood", { reason: makegood.reasonText })}</span>
        </p>
      )}

      <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>
        {t("generationEstimate.disclaimer")}
      </p>
    </div>
  )
}

/**
 * Границы одной величины словами. Когда история однородна и границы совпали, интервал
 * схлопывается в одно число — рисовать «470–470 тыс.» значило бы изображать разброс
 * там, где его не наблюдали.
 */
function rangeText(
  spread: EstimateSpread,
  format: (value: number) => string,
  t: (key: string, vars?: Record<string, any>) => string,
): string {
  if (spread.low === spread.high) return format(spread.median)
  return t("generationEstimate.range", { low: format(spread.low), high: format(spread.high) })
}

function EstimateRow({
  icon,
  label,
  corridor,
  hint,
}: {
  icon: React.ReactNode
  label: string
  corridor: string
  hint: string
}) {
  return (
    <div>
      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: COLORS.label }}>
        {icon}
        {label}
      </span>
      {/* Интервал крупнее ориентира — иначе взгляд снова прочтёт число как цену. */}
      <div className="text-[13px] font-medium" style={{ color: COLORS.text }}>
        {corridor}
      </div>
      <div className="text-[11px]" style={{ color: COLORS.label }}>
        {hint}
      </div>
    </div>
  )
}
