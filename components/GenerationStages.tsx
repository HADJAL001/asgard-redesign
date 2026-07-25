"use client"

/* ================================================================
   GenerationStages — премиальный поэтапный «ритуал» генерации
   ----------------------------------------------------------------
   Честное отображение реальных серверных шагов создания проекта
   (detectTheme → подбор/адаптация шаблона или AI-генерация →
   запись файлов → рождение стартовых артефактов → валидация).
   Пока идёт фоновая генерация (polling статуса 'generating'→'ready'),
   показывает каскад этапов вместо плоского спиннера. Этапы
   продвигаются по таймеру, НО замирают на последнем, пока сервер
   реально не подтвердит готовность (проп done) — никакой фальши,
   прогресс не «перепрыгивает» завершение.
   ================================================================ */

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Check, Loader2, Sparkles, Compass, Boxes, Hammer, ShieldCheck, type LucideIcon } from "lucide-react"
import { COLORS } from "@/lib/economy"

type Stage = { id: string; label: string; Icon: LucideIcon }

const STAGES: Stage[] = [
  { id: "theme", label: "Анализирую замысел", Icon: Compass },
  { id: "arch", label: "Проектирую архитектуру", Icon: Boxes },
  { id: "code", label: "Пишу код приложения", Icon: Sparkles },
  { id: "forge", label: "Кую стартовые артефакты", Icon: Hammer },
  { id: "polish", label: "Полирую детали", Icon: ShieldCheck },
]

/** Пока не готово — держим предпоследний этап, чтобы последний загорелся
 *  только по реальному сигналу done (сервер подтвердил status='ready'). */
const HOLD_INDEX = STAGES.length - 1

export function GenerationStages({ done, stepMs = 2200 }: { done: boolean; stepMs?: number }) {
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (done || reduce) return
    const timer = setInterval(() => {
      setActive((i) => (i >= HOLD_INDEX ? HOLD_INDEX : i + 1))
    }, stepMs)
    return () => clearInterval(timer)
  }, [done, reduce, stepMs])

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      {STAGES.map((stage, i) => {
        const isDone = done || i < active
        const isActive = !done && i === active
        const StageIcon = stage.Icon
        const color = isDone ? COLORS.green : isActive ? COLORS.accent : COLORS.label
        return (
          <motion.div
            key={stage.id}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: isDone || isActive ? 1 : 0.4, x: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5"
            style={{
              backgroundColor: isActive ? "rgba(212,175,55,0.06)" : "transparent",
            }}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full"
              style={{ border: `1px solid ${color}`, color }}
            >
              {isDone ? (
                <Check size={13} strokeWidth={2.25} />
              ) : isActive ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <StageIcon size={12} strokeWidth={1.75} />
              )}
            </span>
            <span
              className="text-[13px] font-medium transition-colors"
              style={{ color: isDone || isActive ? COLORS.text : COLORS.label }}
            >
              {stage.label}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
