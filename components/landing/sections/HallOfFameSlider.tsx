"use client"

/* ================================================================
   OSGARD · HallOfFameSlider — Зал Славы на гостевом лендинге
   ----------------------------------------------------------------
   Первый реальный потребитель GET /hall-of-fame (топ-100 крупнейших
   продаж артефактов). НЕ путать со страницей /hall-of-fame, которая
   показывает лидерборд пользователей — это разные экраны.

   Пока НЕ монтируется в eternity-landing.tsx (тот в работе у
   параллельной сессии — реконнект hero-формы). Готов к монтированию
   как <HallOfFameSlider /> после ✅ Фазы 3.

   Скелетон фиксированной высоты — без CLS при загрузке.
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Trophy, ArrowRight } from "lucide-react"
import { ReadonlyGate } from "@/lib/readonly-mode"

/* Цвета редкости — 1:1 с DemoProjectModal.tsx (RARITY_META), чтобы карточки
   Зала Славы и демо-артефактов выглядели из одной вселенной. */
const RARITY_COLOR: Record<string, string> = {
  common: "#9CA3AF",
  uncommon: "#34D399",
  rare: "#60A5FA",
  epic: "#A78BFA",
  legendary: "#FBBF24",
}

type HofItem = {
  id: number
  artifactId: number
  artifactName: string
  type: string
  rarity: string
  architect: string
  price: number
  achievedAt: number
}

const CARD_H = 168

function formatPrice(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n)
}

export function HallOfFameSlider() {
  const [items, setItems] = useState<HofItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/hall-of-fame?limit=100")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data?.hallOfFame) ? data.hallOfFame : [])
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section
      aria-label="Зал Славы"
      style={{ padding: "64px 24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Trophy size={22} color="#FBBF24" aria-hidden="true" />
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Зал Славы</h2>
      </div>
      <p style={{ opacity: 0.6, margin: "0 0 24px", fontSize: 15 }}>
        Крупнейшие продажи артефактов — лучшие архитекторы вселенной.
      </p>

      {/* Полоса карточек: фиксированная высота контейнера = скелетон и контент
          занимают одинаковое место, без сдвига макета. */}
      <div
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          paddingBottom: 12,
          minHeight: CARD_H,
          scrollSnapType: "x mandatory",
        }}
      >
        {items === null && !error &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                flex: "0 0 240px",
                height: CARD_H,
                borderRadius: 14,
                background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%)",
                backgroundSize: "400% 100%",
                animation: "hofShimmer 1.4s ease infinite",
              }}
            />
          ))}

        {error && (
          <div style={{ opacity: 0.6, fontSize: 14, alignSelf: "center" }}>
            Не удалось загрузить Зал Славы. Попробуйте обновить страницу.
          </div>
        )}

        {items !== null && items.length === 0 && !error && (
          <div style={{ opacity: 0.6, fontSize: 14, alignSelf: "center" }}>
            Пока пусто — стань первым, кто попадёт в Зал Славы.
          </div>
        )}

        {items?.map((it) => {
          const color = RARITY_COLOR[it.rarity] ?? RARITY_COLOR.common
          return (
            <article
              key={it.id}
              style={{
                flex: "0 0 240px",
                height: CARD_H,
                borderRadius: 14,
                padding: 16,
                background: "rgba(10,10,15,0.6)",
                border: `1px solid ${color}55`,
                boxShadow: `0 0 24px ${color}18`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                scrollSnapAlign: "start",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 600,
                    color,
                    border: `1px solid ${color}66`,
                    borderRadius: 999,
                    padding: "2px 8px",
                    marginBottom: 10,
                    textTransform: "capitalize",
                  }}
                >
                  {it.rarity}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>{it.artifactName}</div>
                <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{it.type}</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{formatPrice(it.price)}</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  Архитектор: {it.architect}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        <ReadonlyGate action="Зал Славы">
          <Link
            href="/hall-of-fame"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 600,
              color: "#00D4FF",
              textDecoration: "none",
            }}
          >
            Посмотреть все
            <ArrowRight size={15} />
          </Link>
        </ReadonlyGate>
      </div>

      <style>{`@keyframes hofShimmer { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }`}</style>
    </section>
  )
}

export default HallOfFameSlider
