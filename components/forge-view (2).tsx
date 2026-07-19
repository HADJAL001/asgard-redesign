"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Dices, Check, X, Store, Archive, Eye, Hammer } from "lucide-react"
import { Navbar } from "./navbar"
import {
  COLORS,
  RARITY,
  ARTIFACT_TYPES,
  STAT_META,
  PROJECTS,
  SELF,
  computePrice,
  formatTokens,
  type ArtifactType,
  type Rarity,
  type Stats,
} from "@/lib/economy"

const TYPE_KEYS = Object.keys(ARTIFACT_TYPES) as ArtifactType[]

function rollStat() {
  return 10 + Math.floor(Math.random() * 90)
}
function rollStats(): Stats {
  return { power: rollStat(), defense: rollStat(), magic: rollStat(), speed: rollStat() }
}
function rollRarity(): Rarity {
  const r = Math.random()
  if (r < 0.6) return "common"
  if (r < 0.9) return "epic"
  return "legendary"
}

export function ForgeView() {
  const router = useRouter()
  const params = useSearchParams()
  const projectId = Number(params.get("project")) || PROJECTS[0].id
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]

  const [type, setType] = useState<ArtifactType>("neural")
  const [name, setName] = useState("")
  const [stats, setStats] = useState<Stats>(() => rollStats())
  const [rarity, setRarity] = useState<Rarity>(() => rollRarity())
  const [created, setCreated] = useState(false)

  const TypeIcon = ARTIFACT_TYPES[type].Icon

  function reroll() {
    setStats(rollStats())
    setRarity(rollRarity())
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg" style={{ border: `1px solid ${COLORS.border}` }}>
            <Hammer size={18} strokeWidth={1.5} style={{ color: COLORS.accent }} />
          </span>
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Кузница</h1>
            <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Проект: {project.name}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
          {/* ---- Left: creation form ---- */}
          <section className="rounded-xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <h2 className="text-[16px] font-medium">Создание артефакта</h2>

            {/* Type */}
            <p className="mb-3 mt-6 text-[13px]" style={{ color: COLORS.label }}>Тип артефакта</p>
            <div className="flex flex-wrap gap-2">
              {TYPE_KEYS.map((k) => {
                const active = type === k
                const Icon = ARTIFACT_TYPES[k].Icon
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setType(k)}
                    className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] transition-colors"
                    style={{
                      border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                      color: active ? COLORS.accent : "rgba(255,255,255,0.7)",
                      backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                    }}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {ARTIFACT_TYPES[k].label}
                  </button>
                )
              })}
            </div>

            {/* Name */}
            <p className="mb-2 mt-6 text-[13px]" style={{ color: COLORS.label }}>Название</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название артефакта"
              className="cal-input"
            />

            {/* Stats */}
            <div className="mb-3 mt-6 flex items-center justify-between">
              <p className="text-[13px]" style={{ color: COLORS.label }}>Характеристики (генерируются автоматически)</p>
              <button
                type="button"
                onClick={reroll}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.accent }}
              >
                <Dices size={14} strokeWidth={1.75} />
                Перегенерировать
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STAT_META.map((s) => (
                <div key={s.key} className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <s.Icon size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
                  <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{s.label}</span>
                  <span className="ml-auto text-[16px] font-medium">{stats[s.key]}</span>
                </div>
              ))}
            </div>

            {/* Rarity */}
            <p className="mb-2 mt-6 text-[13px]" style={{ color: COLORS.label }}>Редкость (выпала случайно)</p>
            <div className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ backgroundColor: COLORS.bg, border: `1px solid ${RARITY[rarity].color}` }}>
              <span className="text-[15px] font-medium" style={{ color: RARITY[rarity].color }}>{RARITY[rarity].label}</span>
              <span className="ml-auto flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="text-[13px]" style={{ color: i < RARITY[rarity].stars ? RARITY[rarity].color : COLORS.border }}>★</span>
                ))}
              </span>
            </div>

            {/* Actions */}
            <div className="mt-7 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCreated(true)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-colors"
                style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <Check size={16} strokeWidth={2} />
                Создать
              </button>
              <button
                type="button"
                onClick={() => router.push("/projects")}
                className="rounded-lg px-6 py-3 text-[14px] transition-colors"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                Отмена
              </button>
            </div>
          </section>

          {/* ---- Right: live preview ---- */}
          <section className="rounded-xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <h2 className="text-[16px] font-medium">Предпросмотр</h2>
            <div className="mt-6 flex flex-col items-center rounded-xl px-6 py-10" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <span className="flex size-24 items-center justify-center rounded-2xl" style={{ border: `1px solid ${RARITY[rarity].color}` }}>
                <TypeIcon size={44} strokeWidth={1.25} style={{ color: RARITY[rarity].color }} />
              </span>
              <p className="mt-5 text-[18px] font-medium">{name || "Безымянный артефакт"}</p>
              <p className="mt-1 text-[13px]" style={{ color: COLORS.label }}>
                {ARTIFACT_TYPES[type].label} · {RARITY[rarity].label}
              </p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
                {STAT_META.map((s) => (
                  <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]" style={{ border: `1px solid ${COLORS.border}` }}>
                    <span style={{ color: COLORS.label }}>{s.label}</span>
                    <span>{stats[s.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      {created && (
        <CreatedModal
          type={type}
          rarity={rarity}
          stats={stats}
          name={name || "Безымянный артефакт"}
          onClose={() => setCreated(false)}
          onKeep={() => router.push("/artifacts?filter=kept")}
          onSell={() => router.push("/my-sales")}
          onCollection={() => router.push("/artifacts")}
        />
      )}
    </div>
  )
}

/* ---------------- "Artifact created" — keep or sell ---------------- */
function CreatedModal({
  type,
  rarity,
  stats,
  name,
  onClose,
  onKeep,
  onSell,
  onCollection,
}: {
  type: ArtifactType
  rarity: Rarity
  stats: Stats
  name: string
  onClose: () => void
  onKeep: () => void
  onSell: () => void
  onCollection: () => void
}) {
  const TypeIcon = ARTIFACT_TYPES[type].Icon
  const suggested = useMemo(
    () => computePrice({ stats, rarity, architectLevel: SELF.level, views24h: 80, supply: 6 }).price,
    [stats, rarity],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-2xl"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[18px] font-semibold">Артефакт создан</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 py-6">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-xl" style={{ border: `1px solid ${RARITY[rarity].color}` }}>
              <TypeIcon size={30} strokeWidth={1.25} style={{ color: RARITY[rarity].color }} />
            </span>
            <div>
              <p className="text-[17px] font-medium">{name}</p>
              <p className="text-[13px]" style={{ color: RARITY[rarity].color }}>{RARITY[rarity].label}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {STAT_META.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${COLORS.border}`, color: "rgba(255,255,255,0.75)" }}>
                <s.Icon size={13} strokeWidth={1.75} style={{ color: COLORS.label }} />
                {s.label}: {stats[s.key]}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.label }}>Рекомендованная цена: </span>
            <span style={{ color: COLORS.accent }}>{formatTokens(suggested)} токенов</span>
          </div>

          <p className="mb-3 mt-6 text-[13px]" style={{ color: COLORS.label }}>Что делать с артефактом?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onKeep}
              className="inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
            >
              <Archive size={16} strokeWidth={1.75} />
              Оставить себе
            </button>
            <button
              type="button"
              onClick={onSell}
              className="inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-colors"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Store size={16} strokeWidth={1.75} />
              Выставить на продажу
            </button>
          </div>
          <button
            type="button"
            onClick={onCollection}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] transition-colors"
            style={{ color: COLORS.label }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
          >
            <Eye size={15} strokeWidth={1.75} />
            Посмотреть в коллекции
          </button>
        </div>
      </div>
    </div>
  )
}
