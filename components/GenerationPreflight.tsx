"use client"

/* ================================================================
   GenerationPreflight — что платформа видит в заявке ДО кнопки
   ----------------------------------------------------------------
   Доска волны 7, п.4: «перед стартом платформа отвечает на три вопроса
   и ПОКАЗЫВАЕТ ОТВЕТ ЧЕЛОВЕКУ». Механизм без витрины закрывал бы пункт
   только на словах: платформа знала бы, а человек — нет.

     (а) что за продукт просят — класс, а не тема из словаря;
     (б) на что это похоже из прошлых генераций и ЧЕМ ТЕ КОНЧИЛИСЬ;
     (в) что в заявке не определено и чем это грозит.

   Четыре правила показа, без которых взгляд наперёд стал бы вредным:

   1. НИКАКОГО УПРЁКА ДО ТОГО, КАК ЧЕЛОВЕК НАПИСАЛ. Пустая идея — это не
      ошибка, а начало работы. Пока заявки нет, блок показывает
      приглашение, а не список претензий: платформа, встречающая пустое
      поле выговором, учит закрывать окно, а не описывать замысел.
   2. «ФАКТОВ НЕТ» ГОВОРИТСЯ СЛОВАМИ. Ниже порога `MIN_FACTS` сервер
      отдаёт `null` вместо доли — здесь это превращается в прямую
      фразу, а не в «0%». Ноль и «не знаем» — разные утверждения.
   3. ЧУЖОЕ НЕ НАЗЫВАЕТСЯ. Названия показываются только у собственных
      проектов человека (сервер и не присылает других). Чужой замысел
      рядом с «похоже на ваш» был бы утечкой, а не пользой.
   4. ПРОБЕЛ БЕЗ СЛЕДСТВИЯ — ПРИДИРКА. Каждый пробел показывается
      вместе с тем, чем он грозит, и с фактом из корпуса, если факт
      есть. «Вы не указали X» без «поэтому будет Y» человек
      справедливо пролистает.

   Данные приходят пропсами — компонент чистый, ту же форму ответа
   рисует своей вёрсткой мобильный клиент. Загрузка — в хуке
   useGenerationPreflight ниже.

   НИ ОДНОГО ОБРАЩЕНИЯ К МОДЕЛИ за всем этим не стоит: класс и пробелы —
   чистые функции, похожесть и исходы — SQL. Запрет доски («не
   превращать это в лишний AI-вызов на каждую генерацию») выполняется
   тем, что вызывать нечего.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, Layers, History, AlertTriangle, CheckCircle2, Rocket, RefreshCw } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { apiClient } from "@/lib/api-client"
import { useTranslation } from "@/lib/i18n/use-translation"

export type PastOutcome = { verdict: string | null; deployed: boolean; refinements: number }

export type SimilarSummary = {
  cls: string
  classLabel: string
  total: number
  passed: number
  repaired: number
  broken: number
  unverified: number
  deployed: number
  refined: number
  /** `null` — похожих генераций меньше порога фактов: доля была бы выдумкой. */
  deployedShare: number | null
  brokenShare: number | null
  refinedShare: number | null
  ownExamples: Array<{ id: number; name: string; outcome: PastOutcome }>
}

export type BriefGap = {
  kind: string
  what: string
  risk: string
  /** Исходы прошлых генераций С ТЕМ ЖЕ пробелом. `null` — фактов недостаточно. */
  fact: { sameGap: number; refined: number; broken: number; deployed: number } | null
}

export type PreflightResponse = {
  cls: string
  classLabel: string
  capabilities: string[]
  evidence: string[]
  similar: SimilarSummary
  gaps: BriefGap[]
  /** `false` — корпус этого класса пуст: честная пустота, а не ноль процентов. */
  measured: boolean
}

/**
 * Загружает взгляд платформы на заявку. Пересчитывает с задержкой: человек печатает
 * описание, и запрос на каждый символ превратил бы подсказку в нагрузку (сервер читает
 * историю проектов).
 *
 * Ошибка загрузки НЕ показывается как проблема генерации: взгляд наперёд — помощь перед
 * запуском, его отсутствие не имеет права мешать запускать.
 */
export function useGenerationPreflight(params: { name?: string; hint?: string; enabled?: boolean }) {
  const { name, hint, enabled = true } = params
  const [data, setData] = useState<PreflightResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await apiClient.post<{ preflight: PreflightResponse }>("/projects/preflight", { name, hint })
      /* Ответ на устаревший запрос игнорируем: медленный первый запрос иначе перезапишет
         разбор, посчитанный по более свежему описанию. */
      if (id === requestId.current) setData(res.preflight ?? null)
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

  return { preflight: data, loading, reload: load }
}

type Props = {
  preflight: PreflightResponse | null
  /** Написал ли человек хоть что-то. Пустая заявка — начало работы, а не повод для упрёка. */
  hasBrief: boolean
  loading?: boolean
}

export function GenerationPreflight({ preflight, hasBrief, loading = false }: Props) {
  const { t } = useTranslation()

  if (!preflight) {
    return loading ? (
      <p className="mt-4 text-[12px]" style={{ color: COLORS.label }}>
        {t("generationPreflight.loading")}
      </p>
    ) : null
  }

  const { similar, gaps } = preflight
  const known = preflight.cls !== "unknown"

  /* Пока заявки нет, показывается одна строка-приглашение: список пробелов на пустом поле
     верен по сути («ничего не определено») и бесполезен по делу. */
  if (!hasBrief) {
    return (
      <div className="mt-4 rounded-lg p-3" style={{ border: `1px solid ${COLORS.border}` }}>
        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.label }}>
          <Eye size={13} strokeWidth={1.75} />
          {t("generationPreflight.emptyInvite")}
        </span>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg p-3" style={{ border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: COLORS.text }}>
          <Eye size={13} strokeWidth={1.75} />
          {t("generationPreflight.title")}
        </span>
      </div>

      {/* --- (а) что за продукт: класс, а не тема --- */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1" style={{ color: COLORS.label }}>
          <Layers size={12} strokeWidth={1.75} />
          {t("generationPreflight.productLabel")}
        </span>
        <span className="font-medium" style={{ color: known ? COLORS.accent : COLORS.amber }}>
          {known ? similar.classLabel : t("generationPreflight.productUnknown")}
        </span>
        {/* Улики: по каким именно словам платформа так решила. Ответ, который нельзя
            проверить, человеку приходится принимать на веру — а он не обязан. */}
        {known && preflight.evidence.length > 0 && (
          <span style={{ color: COLORS.label }}>
            {t("generationPreflight.evidence", { words: preflight.evidence.slice(0, 6).join(", ") })}
          </span>
        )}
      </div>

      {/* --- (б) на что похоже и чем те кончились --- */}
      <div className="mt-2 text-[12px]">
        <span className="inline-flex items-center gap-1" style={{ color: COLORS.label }}>
          <History size={12} strokeWidth={1.75} />
          {!known || !preflight.measured
            ? t("generationPreflight.similarNone")
            : t("generationPreflight.similarCount", { count: similar.total })}
        </span>

        {known && preflight.measured && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: COLORS.text }}>
            <span className="inline-flex items-center gap-1">
              <Rocket size={11} strokeWidth={1.75} style={{ color: COLORS.green }} />
              {t("generationPreflight.outcomeDeployed", { count: similar.deployed, total: similar.total })}
            </span>
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={11} strokeWidth={1.75} style={{ color: COLORS.amber }} />
              {t("generationPreflight.outcomeRefined", { count: similar.refined, total: similar.total })}
            </span>
            {similar.broken > 0 && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle size={11} strokeWidth={1.75} style={{ color: COLORS.amber }} />
                {t("generationPreflight.outcomeBroken", { count: similar.broken, total: similar.total })}
              </span>
            )}
            {/* Порог фактов не пройден — платформа обязана сказать это словами, а не
                показать «100% переделывают» по одному случаю. */}
            {similar.refinedShare === null && (
              <span style={{ color: COLORS.label }}>
                {t("generationPreflight.fewFacts", { count: similar.total })}
              </span>
            )}
          </div>
        )}

        {/* Именованные примеры — только собственные проекты человека. */}
        {similar.ownExamples.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {similar.ownExamples.map((example) => (
              <li key={example.id} className="flex flex-wrap items-baseline gap-x-2" style={{ color: COLORS.label }}>
                <span style={{ color: COLORS.text }}>{example.name}</span>
                <span>
                  {example.outcome.deployed
                    ? t("generationPreflight.ownDeployed")
                    : t("generationPreflight.ownNotDeployed")}
                  {example.outcome.refinements > 0 &&
                    ` · ${t("generationPreflight.ownRefined", { count: example.outcome.refinements })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- (в) что не определено и чем грозит --- */}
      {gaps.length === 0 ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[12px]" style={{ color: COLORS.green }}>
          <CheckCircle2 size={12} strokeWidth={1.75} />
          {t("generationPreflight.allClear")}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {gaps.map((gap) => (
            <li key={gap.kind} className="text-[12px]">
              <span className="inline-flex items-baseline gap-1.5" style={{ color: COLORS.text }}>
                <AlertTriangle size={12} strokeWidth={1.75} style={{ color: COLORS.amber, flexShrink: 0 }} />
                {gap.what}
              </span>
              {/* Следствие обязательно: пробел без «поэтому будет вот что» — придирка. */}
              <div className="pl-[18px]" style={{ color: COLORS.label }}>
                {gap.risk}
              </div>
              <div className="pl-[18px]" style={{ color: COLORS.label }}>
                {gap.fact
                  ? t("generationPreflight.gapFact", {
                      count: gap.fact.sameGap,
                      refined: gap.fact.refined,
                      broken: gap.fact.broken,
                    })
                  : t("generationPreflight.gapNoFact")}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>
        {t("generationPreflight.disclaimer")}
      </p>
    </div>
  )
}
