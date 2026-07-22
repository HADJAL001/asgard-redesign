"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { useAuth } from "@/lib/auth-store"
import {
  ARTIFACT_TYPES,
  RARITY,
  HOF_TIERS,
  formatTokens,
  hofTier,
  type ArtifactType,
  type Rarity,
} from "@/lib/economy"
import {
  ArrowLeft,
  Sparkles,
  Shield,
  Bolt,
  Eye,
  Layers,
  Infinity as InfinityIcon,
  Zap,
  Package,
  GitBranch,
  Crown,
  type LucideIcon,
} from "lucide-react"

const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const CYAN = "#00D4FF"

/* Премиум-усиление (см. backend/artifacts.routes.ts POST /artifacts/:id/premium-upgrade). */
const PREMIUM_MAX_LEVEL = 10
const PREMIUM_UPGRADE_COST_TC_PER_LEVEL = 20

function premiumUpgradeCost(level: number): number {
  return level * PREMIUM_UPGRADE_COST_TC_PER_LEVEL
}

export function ArtifactDetailView({ id }: { id: number }) {
  const { user } = useAuth()
  const { wallet, artifacts, projects, fetchArtifacts, fetchProjects, premiumUpgradeArtifact, loading } =
    useOsgardStore()
  const [toast, setToast] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    fetchArtifacts({ skipAuthRedirect: true })
    fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const base = useMemo(() => artifacts.find((a) => a.id === id), [artifacts, id])
  const project = useMemo(
    () => (base?.projectId ? projects.find((p) => p.id === base.projectId) : undefined),
    [projects, base],
  )

  if (!base) {
    return (
      <div
        className="min-h-screen font-sans"
        style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: "#FFFFFF" }}
      >
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <Link
            href="/artifacts"
            className="inline-flex items-center gap-2 text-[14px] transition-colors"
            style={{ color: LABEL }}
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Все артефакты
          </Link>
          <p className="mt-6 text-[14px]" style={{ color: LABEL }}>
            {loading ? "Загрузка…" : "Артефакт не найден"}
          </p>
        </main>
      </div>
    )
  }

  const type = (base.type in ARTIFACT_TYPES ? base.type : "artifact") as ArtifactType
  const rarity = (base.rarity in RARITY ? base.rarity : "common") as Rarity
  const tier = hofTier(base.price)
  const upCost = premiumUpgradeCost(base.level)
  const canUpgrade = base.level < PREMIUM_MAX_LEVEL && wallet.timecoin >= upCost
  const birthDate = new Date(base.createdAt).toLocaleDateString("ru-RU")

  async function upgrade() {
    if (!canUpgrade || upgrading) return
    setUpgrading(true)
    try {
      const res = await premiumUpgradeArtifact(base!.id)
      if (res.success) {
        setToast(res.critical ? `КРИТ! Уровень +${res.levelGain}` : `Уровень +${res.levelGain}`)
      } else {
        setToast(res.error || "Не удалось выполнить усиление")
      }
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: "#FFFFFF" }}
    >
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/artifacts"
          className="inline-flex items-center gap-2 text-[14px] transition-colors"
          style={{ color: LABEL }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Все артефакты
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          {/* Left — hero card */}
          <div className="flex flex-col gap-4">
            <div
              className="flex flex-col items-center rounded-2xl p-8"
              style={{
                backgroundColor: CARD,
                border: `2px solid ${RARITY[rarity].color}`,
                boxShadow: rarity === "mythic" ? `0 0 48px ${RARITY[rarity].color}44` : "none",
              }}
            >
              <div
                className="flex size-28 items-center justify-center rounded-2xl text-[52px]"
                style={{ border: `2px solid ${RARITY[rarity].color}`, color: RARITY[rarity].color }}
              >
                {RARITY[rarity].symbol}
              </div>
              <h1 className="mt-5 text-center text-[22px] font-medium text-balance">{base.name}</h1>
              <span
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]"
                style={{ border: `1px solid ${RARITY[rarity].color}`, color: RARITY[rarity].color }}
              >
                {RARITY[rarity].symbol} {RARITY[rarity].label}
              </span>
              <p className="mt-3 text-[13px]" style={{ color: LABEL }}>
                {ARTIFACT_TYPES[type].label} · Ур. {base.level}
              </p>

              {tier && (
                <div
                  className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]"
                  style={{ border: `1px solid ${HOF_TIERS[tier].color}`, color: HOF_TIERS[tier].color }}
                >
                  <Crown size={13} strokeWidth={1.75} aria-hidden="true" />
                  Зал славы · {HOF_TIERS[tier].label}
                </div>
              )}
            </div>

            {/* Price + premium upgrade */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-[12px]" style={{ color: LABEL }}>
                Оценочная стоимость
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[26px] font-medium" style={{ color: "#F1C40F" }}>
                <InfinityIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                {formatTokens(base.price)}
              </p>
              {base.level < PREMIUM_MAX_LEVEL ? (
                <button
                  type="button"
                  onClick={upgrade}
                  disabled={!canUpgrade || upgrading}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-medium transition-opacity"
                  style={{
                    backgroundColor: canUpgrade ? CYAN : "#1A1A24",
                    color: canUpgrade ? "#0A0A0F" : "rgba(255,255,255,0.3)",
                    cursor: canUpgrade && !upgrading ? "pointer" : "not-allowed",
                  }}
                >
                  <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" />⭐ Усилить за {formatTokens(upCost)} ∞
                </button>
              ) : (
                <p className="mt-4 text-center text-[13px]" style={{ color: RARITY.mythic.color }}>
                  Достигнут максимальный премиум-уровень
                </p>
              )}
            </div>
          </div>

          {/* Right — stats + info */}
          <div className="flex flex-col gap-6">
            {/* Stats */}
            <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <h2 className="text-[15px] font-medium">Характеристики</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Stat Icon={Zap} label="Сила" value={base.power} />
                <Stat Icon={Shield} label="Защита" value={base.defense} />
                <Stat Icon={Sparkles} label="Магия" value={base.magic} />
                <Stat Icon={Bolt} label="Скорость" value={base.speed} />
                <Stat Icon={Eye} label="Просм. 24ч" value={formatTokens(base.views24h)} />
                <Stat Icon={Layers} label="Тираж" value={base.supply} />
              </div>
              <div className="mt-5 flex items-center gap-3 border-t pt-4" style={{ borderColor: BORDER }}>
                <Package size={16} strokeWidth={1.5} style={{ color: LABEL }} aria-hidden="true" />
                <span className="text-[13px]" style={{ color: LABEL }}>
                  Создан в проекте
                </span>
                {project ? (
                  <Link href="/projects" className="text-[13px] font-medium" style={{ color: CYAN }}>
                    {project.name}
                  </Link>
                ) : (
                  <span className="text-[13px]">—</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Crown size={16} strokeWidth={1.5} style={{ color: LABEL }} aria-hidden="true" />
                <span className="text-[13px]" style={{ color: LABEL }}>
                  Архитектор
                </span>
                <span className="text-[13px] font-medium">
                  {user?.displayName || user?.username || "—"} · Ур. {user?.level ?? "—"}
                </span>
              </div>
            </section>

            {/* Genealogy */}
            <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-2">
                <GitBranch size={16} strokeWidth={1.75} style={{ color: CYAN }} aria-hidden="true" />
                <h2 className="text-[15px] font-medium">Генеалогия</h2>
              </div>
              <ol className="mt-5 flex flex-col gap-0">
                <li className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 size-3 rounded-full" style={{ backgroundColor: "#4ADE80" }} aria-hidden="true" />
                  </div>
                  <div className="pb-5">
                    <p className="text-[14px] font-medium">Рождение</p>
                    <p className="mt-0.5 text-[12px]" style={{ color: LABEL }}>
                      {project ? `Проект «${project.name}»` : "Без проекта"} · {birthDate}
                    </p>
                  </div>
                </li>
              </ol>
            </section>
          </div>
        </div>
      </main>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-[13px]"
          style={{ backgroundColor: CARD, border: `1px solid ${CYAN}`, color: "#FFFFFF" }}
          onAnimationEnd={() => setToast(null)}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div>
      <Icon size={16} strokeWidth={1.5} style={{ color: LABEL }} aria-hidden="true" />
      <p className="mt-2 text-[18px] font-medium">{value}</p>
      <p className="text-[12px]" style={{ color: LABEL }}>
        {label}
      </p>
    </div>
  )
}
