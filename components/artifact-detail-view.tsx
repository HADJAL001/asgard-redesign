"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Navbar } from "./navbar"
import { useOsgard } from "@/lib/store/osgard-store"
import {
  ARTIFACTS,
  ARTIFACT_TYPES,
  RARITY,
  PROJECTS,
  UPGRADE_COST,
  nextRarity,
  lineageFor,
  formatTokens,
  hofTier,
  HOF_TIERS,
  type Rarity,
  type LineageStep,
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

export function ArtifactDetailView({ id }: { id: number }) {
  const { wallet, spendTC } = useOsgard()
  const base = useMemo(() => ARTIFACTS.find((a) => a.id === id) ?? ARTIFACTS[0], [id])
  const [rarity, setRarity] = useState<Rarity>(base.rarity)
  const [toast, setToast] = useState<string | null>(null)

  const project = PROJECTS.find((p) => p.id === base.projectId)
  const lineage = useMemo(() => lineageFor({ ...base, rarity }), [base, rarity])
  const next = nextRarity(rarity)
  const upCost = next ? (UPGRADE_COST[rarity] ?? 0) : 0
  const canEvolve = next !== null && wallet.timecoin >= upCost
  const tier = hofTier(base.price)

  function evolve() {
    if (!next || !canEvolve) return
    if (!spendTC(upCost)) {
      setToast("Недостаточно TimeCoin")
      return
    }
    setRarity(next)
    setToast(`Эволюция до «${RARITY[next].label}» завершена`)
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
                {ARTIFACT_TYPES[base.type].label} · Ур. {base.level}
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

            {/* Price + evolve */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-[12px]" style={{ color: LABEL }}>
                Оценочная стоимость
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[26px] font-medium" style={{ color: "#F1C40F" }}>
                <InfinityIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                {formatTokens(base.price)}
              </p>
              {next ? (
                <button
                  type="button"
                  onClick={evolve}
                  disabled={!canEvolve}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-medium transition-opacity"
                  style={{
                    backgroundColor: canEvolve ? CYAN : "#1A1A24",
                    color: canEvolve ? "#0A0A0F" : "rgba(255,255,255,0.3)",
                    cursor: canEvolve ? "pointer" : "not-allowed",
                  }}
                >
                  <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" />
                  Эволюция до «{RARITY[next].label}» · {formatTokens(upCost)} ∞
                </button>
              ) : (
                <p className="mt-4 text-center text-[13px]" style={{ color: RARITY.mythic.color }}>
                  Достигнут максимальный уровень редкости
                </p>
              )}
            </div>
          </div>

          {/* Right — stats + genealogy */}
          <div className="flex flex-col gap-6">
            {/* Stats */}
            <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <h2 className="text-[15px] font-medium">Характеристики</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Stat Icon={Zap} label="Сила" value={base.stats.power} />
                <Stat Icon={Shield} label="Защита" value={base.stats.defense} />
                <Stat Icon={Sparkles} label="Магия" value={base.stats.magic} />
                <Stat Icon={Bolt} label="Скорость" value={base.stats.speed} />
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
                  {base.architect} · Ур. {base.architectLevel}
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
                {lineage.map((step, i) => (
                  <LineageRow key={i} step={step} last={i === lineage.length - 1} />
                ))}
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

function LineageRow({ step, last }: { step: LineageStep; last: boolean }) {
  let dotColor = CYAN
  let title = ""
  let detail = ""

  if (step.kind === "birth") {
    dotColor = "#4ADE80"
    title = "Рождение"
    detail = `Проект «${step.project}» · ${step.date}`
  } else if (step.kind === "evolve") {
    dotColor = RARITY[step.to].color
    title = `Эволюция: ${RARITY[step.from].label} → ${RARITY[step.to].label}`
    detail = `${formatTokens(step.cost)} ∞ · ${step.date}`
  } else {
    dotColor = "#9B59B6"
    title = "Синтез"
    detail = `${step.parents.join(" + ")} · ${step.date}`
  }

  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className="mt-1 size-3 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />
        {!last && <span className="w-px flex-1" style={{ backgroundColor: BORDER, minHeight: 28 }} aria-hidden="true" />}
      </div>
      <div className="pb-5">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="mt-0.5 text-[12px]" style={{ color: LABEL }}>
          {detail}
        </p>
      </div>
    </li>
  )
}
