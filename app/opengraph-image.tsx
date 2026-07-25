import { ImageResponse } from "next/og"

/* ================================================================
   opengraph-image — статичная shareable-карточка OSGARD
   ----------------------------------------------------------------
   Генерируется на билде через next/og (satori). Next автоматически
   подставляет её в og:image / twitter:image (см. app/layout.tsx).
   Премиальный тёмно-синий фон + золотой вордмарк с ∞ + намёк на
   гача-механику (тиры редкости) — то, что делает ссылку «вкусной».
   Все контейнеры с >1 ребёнком имеют display:flex (требование satori).
   ================================================================ */

export const alt = "OSGARD NEW WORLD — AI создаёт проект, артефакты рождаются вместе с ним"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const GOLD = "#D4AF37"
const GOLD_SOFT = "#E9C868"

const TIERS = [
  { symbol: "○", color: "#9CA3AF" },
  { symbol: "◇", color: "#34D399" },
  { symbol: "◆", color: "#60A5FA" },
  { symbol: "★", color: "#A78BFA" },
  { symbol: "∞", color: GOLD },
]

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 28%, #14264d 0%, #0A1128 58%, #05070f 100%)",
          color: "#fff",
        }}
      >
        {/* Верхний тонкий лейбл */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          <span>Premium</span>
          <span style={{ color: GOLD }}>·</span>
          <span>AI World</span>
        </div>

        {/* Вордмарк */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 26,
            fontSize: 150,
            fontWeight: 700,
            letterSpacing: 4,
            color: GOLD,
          }}
        >
          OSG
          <span style={{ display: "flex", color: GOLD_SOFT, margin: "0 4px" }}>∞</span>
          RD
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 16,
            marginTop: 4,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          NEW WORLD
        </div>

        {/* Тайтл-обещание продукта */}
        <div
          style={{
            display: "flex",
            maxWidth: 880,
            textAlign: "center",
            marginTop: 40,
            fontSize: 34,
            lineHeight: 1.35,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          AI создаёт проект — а артефакты рождаются вместе с ним
        </div>

        {/* Тиры редкости — намёк на гача-лут */}
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 46 }}>
          {TIERS.map((t) => (
            <div
              key={t.symbol}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 62,
                height: 62,
                borderRadius: 16,
                border: `2px solid ${t.color}`,
                color: t.color,
                fontSize: 30,
                boxShadow: `0 0 22px ${t.color}55`,
              }}
            >
              {t.symbol}
            </div>
          ))}
        </div>

        {/* Домен */}
        <div
          style={{
            display: "flex",
            marginTop: 54,
            fontSize: 24,
            letterSpacing: 4,
            color: GOLD,
          }}
        >
          osgardnewworld.com
        </div>
      </div>
    ),
    { ...size },
  )
}
