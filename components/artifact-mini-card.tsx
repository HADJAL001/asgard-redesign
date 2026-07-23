"use client"

/* Компактная read-only карточка артефакта — без кнопки продажи/статус-бейджа
   для управления. Используется в публичном профиле (public-profile-view.tsx)
   и на вкладке «Обзор» собственного профиля (profile-view.tsx). */

import { RARITY, ARTIFACT_TYPES, STAT_META, COLORS, type Rarity, type ArtifactType } from "@/lib/economy"
import { fmtTC, fmtUSD } from "@/lib/tc-market"

function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common")
}
function safeType(t: string): ArtifactType {
  return (t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact")
}

export type MiniArtifact = {
  id: number
  name: string
  type: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  status: string
  price: number
  listCurrency: string
}

export function ArtifactMiniCard({ a, tcUsdPrice }: { a: MiniArtifact; tcUsdPrice: number }) {
  const TypeIcon = ARTIFACT_TYPES[safeType(a.type)].Icon
  const rarity = RARITY[safeRarity(a.rarity)]
  const stats = { power: a.power, defense: a.defense, magic: a.magic, speed: a.speed }

  const isTimecoin = a.listCurrency === "timecoin"
  const priceLabel = isTimecoin ? fmtTC(a.price) : `${a.price.toLocaleString("ru-RU")} ${a.listCurrency}`
  const usdEstimate = isTimecoin ? fmtUSD(a.price * tcUsdPrice) : null

  return (
    <article
      className="flex flex-col rounded-xl p-5 transition-all duration-200"
      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = rarity.color
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border
      }}
    >
      <div className="flex items-start justify-between">
        <span
          className="flex size-12 items-center justify-center rounded-xl"
          style={{ border: `1px solid ${rarity.color}` }}
        >
          <TypeIcon size={24} strokeWidth={1.25} style={{ color: rarity.color }} />
        </span>
        {a.status === "listed" && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px]"
            style={{ border: `1px solid ${COLORS.border}`, color: "#00D4FF" }}
          >
            В продаже
          </span>
        )}
        {a.status === "sold" && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px]"
            style={{ border: `1px solid ${COLORS.border}`, color: "#4ADE80" }}
          >
            Продан
          </span>
        )}
      </div>

      <h3 className="mt-4 truncate text-[16px] font-medium">{a.name}</h3>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[safeType(a.type)].label}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: COLORS.label }}>Ур. {a.level}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: rarity.color }}>{rarity.label}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {STAT_META.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]"
            style={{ border: `1px solid ${COLORS.border}` }}
          >
            <span style={{ color: COLORS.label }}>{s.label}</span>
            <span>{stats[s.key]}</span>
          </div>
        ))}
      </div>

      {a.status !== "sold" && (
        <div className="mt-auto flex flex-col pt-5">
          <span className="text-[15px] font-medium" style={{ color: COLORS.accent }}>
            {priceLabel}
          </span>
          {usdEstimate && (
            <span className="text-[11px]" style={{ color: COLORS.label }}>
              ≈ {usdEstimate}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
