"use client"

/* ================================================================
   OSGARD · SectionHelp — справочник раздела
   ----------------------------------------------------------------
   Плавающая кнопка «?» в каждом разделе. Открывает премиальную
   панель: что это за раздел + какие действия нужны под конкретные
   цели. Плюс «Пошаговый режим» — гид со стрелками, подсвечивающий
   реальные элементы страницы (по data-tour) и объясняющий каждый шаг.
   Переиспользуется во всех разделах: передай what/goals/tour.
   ================================================================ */

import { useEffect, useState, useCallback } from "react"
import { HelpCircle, X, Play, ArrowRight, ArrowLeft, Target, Check } from "lucide-react"

const GOLD = "#E6C868"

export interface HelpGoal {
  goal: string
  steps: string[]
}
export interface TourStep {
  /** значение data-tour у целевого элемента (необязательно — тогда шаг по центру) */
  target?: string
  title: string
  text: string
}
export interface SectionHelpProps {
  title: string
  what: string
  goals?: HelpGoal[]
  tour?: TourStep[]
}

type Rect = { top: number; left: number; width: number; height: number }

function useTargetRect(target: string | undefined, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)
  const measure = useCallback(() => {
    if (!target) return setRect(null)
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [target])
  useEffect(() => {
    if (!active) return
    // Первый замер — через rAF, чтобы не вызывать setState синхронно в теле эффекта.
    const raf = requestAnimationFrame(() => measure())
    const on = () => measure()
    window.addEventListener("resize", on)
    window.addEventListener("scroll", on, true)
    const id = setInterval(measure, 400) // отслеживаем сдвиги при скролле/анимациях
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", on)
      window.removeEventListener("scroll", on, true)
      clearInterval(id)
    }
  }, [active, measure])
  return rect
}

export function SectionHelp({ title, what, goals = [], tour = [] }: SectionHelpProps) {
  const [open, setOpen] = useState(false)
  const [tourIdx, setTourIdx] = useState<number | null>(null)
  const inTour = tourIdx !== null
  const step = inTour ? tour[tourIdx!] : null
  const rect = useTargetRect(step?.target, inTour)

  function startTour() {
    if (tour.length === 0) return
    setOpen(false)
    setTourIdx(0)
  }
  function endTour() {
    setTourIdx(null)
  }

  return (
    <>
      {/* Плавающая кнопка «?» */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Справка: ${title}`}
        className="fixed bottom-6 left-6 z-40 flex size-12 items-center justify-center rounded-full transition-transform hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #1b2440, #0b1020)",
          border: `1px solid ${GOLD}88`,
          boxShadow: `0 0 22px 2px ${GOLD}44`,
          color: GOLD,
        }}
      >
        <HelpCircle size={24} strokeWidth={1.9} />
      </button>

      {/* Панель обзора */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-start p-4 sm:items-center sm:p-8" style={{ background: "rgba(3,5,12,0.72)" }} onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl"
            style={{ background: "rgba(15,18,30,0.96)", border: `1px solid ${GOLD}44`, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <HelpCircle size={18} style={{ color: GOLD }} />
              <h2 className="flex-1 text-[16px] font-semibold text-white">{title}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[14px] leading-relaxed text-white/80">{what}</p>

              {goals.length > 0 && (
                <div className="mt-5 space-y-4">
                  <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: GOLD }}>Как достичь цели</p>
                  {goals.map((g) => (
                    <div key={g.goal} className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="flex items-center gap-1.5 text-[13px] font-medium text-white">
                        <Target size={13} style={{ color: GOLD }} /> {g.goal}
                      </p>
                      <ol className="mt-2 space-y-1.5">
                        {g.steps.map((s, i) => (
                          <li key={i} className="flex gap-2 text-[12.5px] text-white/65">
                            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: `${GOLD}22`, color: GOLD }}>{i + 1}</span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {tour.length > 0 && (
              <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <button
                  type="button"
                  onClick={startTour}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-transform hover:scale-[1.02]"
                  style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}
                >
                  <Play size={16} /> Пошаговый режим со стрелками
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Пошаговый тур со стрелками */}
      {inTour && step && (
        <div className="fixed inset-0 z-[60]" style={{ background: "rgba(3,5,12,0.55)" }}>
          {/* подсветка целевого элемента */}
          {rect && (
            <div
              className="pointer-events-none absolute rounded-lg"
              style={{
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
                border: `2px solid ${GOLD}`,
                boxShadow: `0 0 0 4000px rgba(3,5,12,0.55), 0 0 22px 3px ${GOLD}88`,
                transition: "all 0.25s ease",
              }}
            />
          )}
          {/* стрелка-указатель на элемент */}
          {rect && (
            <div
              className="pointer-events-none absolute text-[30px]"
              style={{ top: rect.top + rect.height + 6, left: rect.left + rect.width / 2 - 12, color: GOLD, filter: `drop-shadow(0 0 8px ${GOLD})`, animation: "osgard-aura-pulse 1.4s ease-in-out infinite" }}
              aria-hidden="true"
            >
              ↑
            </div>
          )}

          {/* карточка шага */}
          <div
            className="absolute w-[min(92vw,360px)] rounded-2xl p-5"
            style={{
              background: "rgba(15,18,30,0.98)",
              border: `1px solid ${GOLD}66`,
              boxShadow: "0 24px 70px rgba(0,0,0,0.7)",
              ...(rect
                ? { top: Math.min(rect.top + rect.height + 44, window.innerHeight - 220), left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)) }
                : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }),
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold" style={{ color: GOLD }}>Шаг {tourIdx! + 1} из {tour.length}</span>
              <button type="button" onClick={endTour} aria-label="Завершить" className="text-white/50 hover:text-white"><X size={16} /></button>
            </div>
            <h3 className="mt-2 text-[16px] font-semibold text-white">{step.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/70">{step.text}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setTourIdx((i) => Math.max(0, (i ?? 0) - 1))}
                disabled={tourIdx === 0}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors disabled:opacity-30"
                style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
              >
                <ArrowLeft size={15} /> Назад
              </button>
              {tourIdx! < tour.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setTourIdx((i) => Math.min(tour.length - 1, (i ?? 0) + 1))}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold"
                  style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}
                >
                  Дальше <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={endTour}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold"
                  style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}
                >
                  Готово <Check size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
