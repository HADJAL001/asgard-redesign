import { ImageResponse } from "next/og"

/* ================================================================
   opengraph-image для страницы артефакта — виральная share-карточка.
   ----------------------------------------------------------------
   Тянет публичный вид артефакта (GET /share/artifacts/:id, без auth)
   и рендерит «смотри, что я выковал»: имя, редкость (цвет тира),
   4 стата, мастер. Next автоматически подставляет её в og:image /
   twitter:image для /artifact/[id]. Все контейнеры с >1 ребёнком —
   display:flex (требование satori).
   ================================================================ */

export const alt = "Артефакт OSGARD"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const GOLD = "#D4AF37"

// Цвет по редкости (регистронезависимо), с золотым фолбэком.
const RARITY_COLORS: Record<string, string> = {
  common: "#9CA3AF",
  обычный: "#9CA3AF",
  uncommon: "#34D399",
  необычный: "#34D399",
  rare: "#60A5FA",
  редкий: "#60A5FA",
  epic: "#A78BFA",
  эпический: "#A78BFA",
  legendary: "#F59E0B",
  легендарный: "#F59E0B",
  mythic: "#F43F5E",
  мифический: "#F43F5E",
}

function rarityColor(rarity: string): string {
  return RARITY_COLORS[(rarity || "").toLowerCase().trim()] || GOLD
}

type PublicArtifact = {
  name: string
  type: string
  rarity: string
  power: number
  defense: number
  magic: number
  speed: number
  owner: string
}

async function fetchArtifact(id: string): Promise<PublicArtifact | null> {
  const base = (process.env.BACKEND_URL || "").replace(/\/$/, "")
  if (!base) return null
  try {
    const res = await fetch(`${base}/share/artifacts/${id}`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    return (await res.json()) as PublicArtifact
  } catch {
    return null
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await fetchArtifact(id)
  const color = a ? rarityColor(a.rarity) : GOLD

  const stats: Array<[string, number]> = a
    ? [
        ["СИЛА", a.power],
        ["ЗАЩИТА", a.defense],
        ["МАГИЯ", a.magic],
        ["СКОРОСТЬ", a.speed],
      ]
    : []

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
          padding: 64,
          background: "radial-gradient(circle at 50% 26%, #14264d 0%, #0A1128 58%, #05070f 100%)",
          color: "#fff",
        }}
      >
        {a ? (
          <>
            {/* Редкость + тип */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "10px 26px",
                borderRadius: 999,
                border: `2px solid ${color}`,
                color,
                fontSize: 26,
                letterSpacing: 4,
                textTransform: "uppercase",
                boxShadow: `0 0 30px ${color}55`,
              }}
            >
              <span style={{ display: "flex" }}>{a.rarity}</span>
              <span style={{ display: "flex", color: "rgba(255,255,255,0.4)" }}>·</span>
              <span style={{ display: "flex", color: "rgba(255,255,255,0.75)" }}>{a.type}</span>
            </div>

            {/* Имя артефакта */}
            <div
              style={{
                display: "flex",
                textAlign: "center",
                maxWidth: 1000,
                marginTop: 34,
                fontSize: a.name.length > 22 ? 82 : 104,
                fontWeight: 700,
                lineHeight: 1.05,
                color: "#fff",
                textShadow: `0 0 40px ${color}66`,
              }}
            >
              {a.name}
            </div>

            {/* 4 стата */}
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 48 }}>
              {stats.map(([label, val]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 190,
                    padding: "18px 0",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <span style={{ display: "flex", fontSize: 52, fontWeight: 700, color }}>{val}</span>
                  <span
                    style={{
                      display: "flex",
                      marginTop: 4,
                      fontSize: 20,
                      letterSpacing: 3,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Мастер */}
            <div
              style={{
                display: "flex",
                marginTop: 42,
                fontSize: 28,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              выковал <span style={{ display: "flex", color: GOLD, marginLeft: 10 }}>{a.owner}</span>
            </div>
          </>
        ) : (
          // Фолбэк, если артефакт не найден/бэкенд недоступен — общий бренд.
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: GOLD }}>
            OSG<span style={{ display: "flex", margin: "0 4px" }}>∞</span>RD
          </div>
        )}

        {/* Низ: бренд + CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 54,
            fontSize: 24,
            letterSpacing: 3,
            color: GOLD,
          }}
        >
          <span style={{ display: "flex", fontWeight: 700 }}>
            OSG<span style={{ display: "flex", margin: "0 2px" }}>∞</span>RD
          </span>
          <span style={{ display: "flex", color: "rgba(255,255,255,0.4)" }}>·</span>
          <span style={{ display: "flex", color: "rgba(255,255,255,0.6)" }}>
            выкуй свой на osgardnewworld.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
