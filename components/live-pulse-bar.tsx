"use client"

/* ================================================================
   OSGARD · LivePulseBar — амбиентное «присутствие живой вселенной»
   ----------------------------------------------------------------
   Тонкая полоса социального доказательства поверх реальных агрегатов
   GET /feed/pulse (feed.routes.ts): выковано за 24ч, активно сейчас,
   редчайший дроп дня. БЕЗ ФЕЙКА: пустые данные → честное «тихо»,
   а не выдуманные цифры (правило Фазы C).

   Поллинг раз в ~20с (как notifications-store), пауза на скрытой
   вкладке. Смены чисел — one-shot через --ease-premium, без
   бесконечного мигания (уважаем «спокойный» UI из Части 1).

   Два варианта: "app" (тёмная панель дашборда/ленты) и "landing"
   (прозрачная, под золотую эстетику гостевого лендинга).
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Hammer, Flame } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useTranslation } from "@/lib/i18n/use-translation"
import { RARITY, type Rarity } from "@/lib/economy"

const POLL_MS = 20_000

type Rarest = { name: string | null; rarity: string | null; actor: string; createdAt: string }
type Pulse = {
  forged24h: number
  activeNow: number
  events24h: number
  rarest: Rarest | null
  at: string
}

function isKnownRarity(r: string | null): r is Rarity {
  return r === "common" || r === "rare" || r === "epic" || r === "legendary" || r === "mythic"
}

/** Число, которое мягко «перекатывается» при изменении (one-shot, не мигает). */
function PulseNumber({ value, color, reduce }: { value: number; color: string; reduce: boolean }) {
  if (reduce) {
    return (
      <span className="font-cormorant tabular-nums text-[17px] font-semibold" style={{ color }}>
        {value}
      </span>
    )
  }
  return (
    <span className="relative inline-block font-cormorant tabular-nums text-[17px] font-semibold" style={{ color }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function LivePulseBar({ variant = "app" }: { variant?: "app" | "landing" }) {
  const { t } = useTranslation()
  const reduce = useReducedMotion() ?? false
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [ready, setReady] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        const res = await apiClient.get<{ success: boolean; pulse: Pulse }>("/feed/pulse", { skipAuthRedirect: true })
        if (alive.current && res?.pulse) setPulse(res.pulse)
      } catch {
        /* тихо — фоновый амбиент, ошибку не показываем */
      } finally {
        if (alive.current) setReady(true)
      }
    }
    void load()
    const id = window.setInterval(load, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      alive.current = false
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  // До первого ответа ничего не занимаем местом (не мигаем скелетоном на лендинге).
  if (!ready || !pulse) return null

  const isLanding = variant === "landing"
  const quiet = pulse.forged24h === 0 && pulse.activeNow === 0 && !pulse.rarest

  const wrapStyle: React.CSSProperties = isLanding
    ? {
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(212,175,55,0.22)",
        boxShadow: "0 8px 32px rgba(10,17,40,0.28)",
      }
    : {
        background: "#14141E",
        border: "1px solid #2A2A3E",
      }

  const label = isLanding ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.45)"
  const gold = "var(--color-gold)"

  const rarest = pulse.rarest
  const rMeta = rarest && isKnownRarity(rarest.rarity) ? RARITY[rarest.rarity] : null

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-4 py-3 text-[13px]"
      style={wrapStyle}
      role="status"
      aria-live="polite"
    >
      {quiet ? (
        <span className="flex items-center gap-2" style={{ color: label }}>
          <Hammer size={14} strokeWidth={1.75} style={{ color: gold }} aria-hidden="true" />
          {t("pulse.quiet")}
        </span>
      ) : (
        <>
          <span className="flex items-center gap-2">
            <Hammer size={14} strokeWidth={1.75} style={{ color: gold }} aria-hidden="true" />
            <PulseNumber value={pulse.forged24h} color="#FFFFFF" reduce={reduce} />
            <span style={{ color: label }}>{t("pulse.forged")}</span>
          </span>

          <span className="flex items-center gap-2">
            <Flame size={14} strokeWidth={1.75} style={{ color: "#F97316" }} aria-hidden="true" />
            <PulseNumber value={pulse.activeNow} color="#FFFFFF" reduce={reduce} />
            <span style={{ color: label }}>{t("pulse.active")}</span>
          </span>

          {rarest && rMeta && (
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex size-5 items-center justify-center rounded-full text-[12px]"
                style={{
                  color: rMeta.color,
                  border: `1px solid ${rMeta.color}66`,
                  boxShadow: rarest.rarity === "mythic" || rarest.rarity === "legendary" ? `0 0 10px ${rMeta.color}55` : "none",
                }}
              >
                {rMeta.symbol}
              </span>
              <span style={{ color: label }}>{t("pulse.rarest")}</span>
              <span className="font-medium" style={{ color: rMeta.color }}>
                {rarest.name || rMeta.label}
              </span>
            </span>
          )}
        </>
      )}
    </div>
  )
}
