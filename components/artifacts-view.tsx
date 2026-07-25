"use client"

/* ================================================================
   ArtifactsView — Мои артефакты OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchArtifacts() (GET /artifacts/mine).
   - Отображает список всех артефактов текущего пользователя.
   - Для каждого артефакта показывает: название, тип, редкость,
     характеристики (power/defense/magic/speed), цену (price +
     listCurrency — своя валюта листинга для каждой редкости) и
     статус (в продаже / у меня / продан).
   - Фильтрация по статусу (все/в продаже/у меня/проданы) и поиск
     по названию — как в исходной моковой версии.
   - Форматирование чисел — через fmtTC()/fmtUSD() из lib/tc-market.ts
     (fmtUSD используется для примерной оценки цены в USD, если
     артефакт листингован в timecoin — через tcPrice.price).
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Store, Archive, CheckCircle2, Boxes, Loader2, Hammer, Sparkles, Swords, X, ScrollText } from "lucide-react"
import { Navbar } from "./navbar"
import { FusionModal } from "./FusionModal"
import { ArtifactCertificate, type CertificateArtifact } from "./artifact-certificate"
import { useOsgardStore, type ForgeLoadout } from "@/lib/store/osgard-store"
import {
  COLORS,
  RARITY,
  ARTIFACT_TYPES,
  STAT_META,
  type ArtifactType,
  type Rarity,
} from "@/lib/economy"
import { fmtTC, fmtUSD } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

type ArtifactStatus = "kept" | "listed" | "sold"
type Filter = "all" | ArtifactStatus

/** Золотой акцент Кузницы — визуально отделяет механику снаряжения от cyan-акцента платформы. */
const FORGE_GOLD = "#D4AF37"
const FORGE_GOLD_SOFT = "rgba(212,175,55,0.08)"

export function ArtifactsView() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const initial = (params.get("filter") as Filter) || "all"

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: t("artifacts.filterAll") },
    { id: "listed", label: t("artifacts.filterListed") },
    { id: "kept", label: t("artifacts.filterKept") },
    { id: "sold", label: t("artifacts.filterSold") },
  ]

  const STATUS_META: Record<ArtifactStatus, { label: string; color: string; Icon: typeof Store }> = {
    listed: { label: t("artifacts.statusListed"), color: "#00D4FF", Icon: Store },
    kept: { label: t("artifacts.statusKept"), color: "#6A6A8A", Icon: Archive },
    sold: { label: t("artifacts.statusSold"), color: "#4ADE80", Icon: CheckCircle2 },
  }

  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.id === initial) ? initial : "all")
  const [fusionOpen, setFusionOpen] = useState(false)
  const [certArtifact, setCertArtifact] = useState<CertificateArtifact | null>(null)
  const [query, setQuery] = useState("")

  const {
    artifacts,
    fetchArtifacts,
    forgeLoadout,
    fetchLoadout,
    equipArtifact,
    unequipArtifact,
    tcPrice,
    loading,
    error,
  } = useOsgardStore()

  useEffect(() => {
    fetchArtifacts({ skipAuthRedirect: true })
    fetchLoadout({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const equippedIds = useMemo(
    () => new Set(forgeLoadout.equipped.map((e) => e.id)),
    [forgeLoadout.equipped],
  )
  const slotsFull = forgeLoadout.equipped.length >= forgeLoadout.maxSlots

  const shown = useMemo(() => {
    return artifacts.filter((a) => {
      const okFilter = filter === "all" || (a.status as ArtifactStatus) === filter
      const okQuery = a.name.toLowerCase().includes(query.toLowerCase())
      return okFilter && okQuery
    })
  }, [artifacts, filter, query])

  const counts = {
    all: artifacts.length,
    listed: artifacts.filter((a) => a.status === "listed").length,
    kept: artifacts.filter((a) => a.status === "kept").length,
    sold: artifacts.filter((a) => a.status === "sold").length,
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}>
      <Navbar />
      <FusionModal open={fusionOpen} onClose={() => setFusionOpen(false)} />
      <ArtifactCertificate artifact={certArtifact} onClose={() => setCertArtifact(null)} />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("artifacts.title")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("artifacts.subtitle")}
            </p>
            <button
              onClick={() => setFusionOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-all"
              style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.3)", color: "#E5D4A0" }}
            >
              🔀 Слить артефакты
            </button>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.label }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("artifacts.searchPlaceholder")}
              className="cal-input pl-9"
            />
          </div>
        </div>

        {/* Снаряжение Кузницы */}
        <ForgeLoadoutPanel loadout={forgeLoadout} onUnequip={(id) => unequipArtifact(id)} t={t} />

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                  color: active ? COLORS.accent : "rgba(255,255,255,0.6)",
                  backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                }}
              >
                {f.label}
                <span className="text-[11px]" style={{ color: active ? COLORS.accent : COLORS.label }}>
                  {counts[f.id]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Loading */}
        {loading && artifacts.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
            <p className="text-[14px]" style={{ color: COLORS.label }}>{t("artifacts.loadingArtifacts")}</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="mt-6 text-[13px]" role="status" style={{ color: COLORS.red }}>
            {error}
          </p>
        )}

        {/* Grid */}
        {!loading && shown.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Boxes size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
            <p className="text-[15px]" style={{ color: COLORS.label }}>{t("artifacts.notFound")}</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a) => (
              <ArtifactCard
                key={a.id}
                a={a}
                tcUsdPrice={tcPrice.price}
                onSell={() => router.push("/my-sales")}
                equipped={equippedIds.has(a.id)}
                slotsFull={slotsFull}
                onEquip={() => equipArtifact(a.id)}
                onUnequip={() => unequipArtifact(a.id)}
                onCertificate={() => setCertArtifact(a)}
                t={t}
                statusMeta={STATUS_META}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

/* ================================================================
   ForgeLoadoutPanel — снаряжение Кузницы
   ----------------------------------------------------------------
   Показывает надетые артефакты (до maxSlots) и совокупный бонус,
   реально применяемый к артефактам, которые родятся со следующим
   проектом. Пустое снаряжение → нулевой бонус (честно, без обмана).
   ================================================================ */
function ForgeLoadoutPanel({
  loadout,
  onUnequip,
  t,
}: {
  loadout: ForgeLoadout
  onUnequip: (id: number) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const { equipped, bonus, maxSlots } = loadout
  const slots = Array.from({ length: maxSlots }, (_, i) => equipped[i] ?? null)
  const hasBonus = bonus.statBonus > 0 || bonus.rarityUpChance > 0
  const rarityPct = Math.round(bonus.rarityUpChance * 100)

  return (
    <section
      className="mt-8 rounded-2xl p-5 md:p-6"
      style={{ border: `1px solid ${FORGE_GOLD}33`, background: `linear-gradient(180deg, ${FORGE_GOLD_SOFT} 0%, rgba(255,255,255,0.01) 100%)` }}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl" style={{ border: `1px solid ${FORGE_GOLD}55`, color: FORGE_GOLD }}>
            <Hammer size={18} strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold leading-tight" style={{ color: FORGE_GOLD }}>
              {t("artifacts.loadoutTitle")}
            </h2>
            <p className="text-[12px]" style={{ color: COLORS.label }}>
              {t("artifacts.loadoutSubtitle", { count: equipped.length, max: maxSlots })}
            </p>
          </div>
        </div>

        {/* Совокупный бонус */}
        <div className="flex items-center gap-2 text-[12px]">
          {hasBonus ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ border: `1px solid ${FORGE_GOLD}55`, color: FORGE_GOLD }}>
                <Swords size={13} strokeWidth={1.75} />
                {t("artifacts.loadoutStatBonus", { value: bonus.statBonus })}
              </span>
              {rarityPct > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ border: `1px solid ${FORGE_GOLD}55`, color: FORGE_GOLD }}>
                  <Sparkles size={13} strokeWidth={1.75} />
                  {t("artifacts.loadoutRarityChance", { value: rarityPct })}
                </span>
              )}
            </>
          ) : (
            <span className="text-[12px]" style={{ color: COLORS.label }}>
              {t("artifacts.loadoutNoBonus")}
            </span>
          )}
        </div>
      </div>

      {/* Слоты */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {slots.map((slot, i) => {
          if (!slot) {
            return (
              <div
                key={`empty-${i}`}
                className="flex items-center justify-center rounded-xl py-4 text-[12px]"
                style={{ border: `1px dashed ${COLORS.border}`, color: COLORS.label }}
              >
                {t("artifacts.loadoutEmptySlot")}
              </div>
            )
          }
          const rarity = RARITY[safeRarity(slot.rarity)]
          const TypeIcon = ARTIFACT_TYPES[safeType(slot.type)].Icon
          return (
            <div
              key={slot.id}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-3"
              style={{ border: `1px solid ${rarity.color}66`, backgroundColor: COLORS.card }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${rarity.color}` }}>
                  <TypeIcon size={18} strokeWidth={1.25} style={{ color: rarity.color }} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{slot.name}</p>
                  <p className="text-[11px]" style={{ color: rarity.color }}>
                    {rarity.label} · {t("artifacts.level", { level: slot.level })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUnequip(slot.id)}
                aria-label={t("artifacts.loadoutUnequip")}
                title={t("artifacts.loadoutUnequip")}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.red
                  e.currentTarget.style.color = COLORS.red
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border
                  e.currentTarget.style.color = COLORS.label
                }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Приведение произвольной строки типа/редкости к безопасному ключу с фолбэком. */
function safeType(t: string): ArtifactType {
  return (t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact")
}
function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common")
}

function ArtifactCard({
  a,
  tcUsdPrice,
  onSell,
  equipped,
  slotsFull,
  onEquip,
  onUnequip,
  onCertificate,
  t,
  statusMeta,
}: {
  a: {
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
  tcUsdPrice: number
  onSell: () => void
  equipped: boolean
  slotsFull: boolean
  onEquip: () => void
  onUnequip: () => void
  onCertificate: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
  statusMeta: Record<ArtifactStatus, { label: string; color: string; Icon: typeof Store }>
}) {
  const TypeIcon = ARTIFACT_TYPES[safeType(a.type)].Icon
  const rarity = RARITY[safeRarity(a.rarity)]
  const status = statusMeta[(a.status as ArtifactStatus) in statusMeta ? (a.status as ArtifactStatus) : "kept"]

  const stats = { power: a.power, defense: a.defense, magic: a.magic, speed: a.speed }

  const isTimecoin = a.listCurrency === "timecoin"
  const priceLabel = isTimecoin ? fmtTC(a.price) : `${a.price.toLocaleString("ru-RU")} ${a.listCurrency}`
  const usdEstimate = isTimecoin ? fmtUSD(a.price * tcUsdPrice) : null

  return (
    <article
      className="flex flex-col rounded-xl p-5 transition-all duration-200"
      style={{
        backgroundColor: COLORS.card,
        border: `1px solid ${equipped ? FORGE_GOLD : COLORS.border}`,
        boxShadow: equipped ? `0 0 0 1px ${FORGE_GOLD}22, 0 8px 28px rgba(212,175,55,0.06)` : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = equipped ? FORGE_GOLD : rarity.color
        e.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = equipped ? FORGE_GOLD : COLORS.border
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div className="flex items-start justify-between">
        <span className="flex size-12 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
          <TypeIcon size={24} strokeWidth={1.25} style={{ color: rarity.color }} />
        </span>
        <div className="flex items-center gap-1.5">
          {equipped && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${FORGE_GOLD}66`, color: FORGE_GOLD }}>
              <Hammer size={11} strokeWidth={1.75} />
              {t("artifacts.loadoutEquippedBadge")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${COLORS.border}`, color: status.color }}>
            <status.Icon size={12} strokeWidth={1.75} />
            {status.label}
          </span>
          {/* Сертификат коллекционера — доступен для любого статуса */}
          <button
            type="button"
            onClick={onCertificate}
            aria-label={t("signature.certificate")}
            title={t("signature.certificate")}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = FORGE_GOLD
              e.currentTarget.style.color = FORGE_GOLD
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border
              e.currentTarget.style.color = COLORS.label
            }}
          >
            <ScrollText size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <h3 className="mt-4 text-[16px] font-medium">{a.name}</h3>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[safeType(a.type)].label}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: COLORS.label }}>{t("artifacts.level", { level: a.level })}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: rarity.color }}>{rarity.label}</span>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {STAT_META.map((s) => (
          <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.label }}>{s.label}</span>
            <span>{stats[s.key]}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-5">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium" style={{ color: COLORS.accent }}>
            {priceLabel}
          </span>
          {usdEstimate && (
            <span className="text-[11px]" style={{ color: COLORS.label }}>
              ≈ {usdEstimate}
            </span>
          )}
        </div>
        {a.status === "kept" && (
          <div className="flex items-center gap-2">
            {/* Экипировка в снаряжение Кузницы */}
            {equipped ? (
              <button
                type="button"
                onClick={onUnequip}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
                style={{ border: `1px solid ${FORGE_GOLD}`, color: FORGE_GOLD, backgroundColor: FORGE_GOLD_SOFT }}
              >
                <Hammer size={14} strokeWidth={1.75} />
                {t("artifacts.loadoutUnequip")}
              </button>
            ) : (
              <button
                type="button"
                onClick={onEquip}
                disabled={slotsFull}
                title={slotsFull ? t("artifacts.loadoutFullHint") : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ border: `1px solid ${FORGE_GOLD}55`, color: FORGE_GOLD }}
                onMouseEnter={(e) => {
                  if (slotsFull) return
                  e.currentTarget.style.backgroundColor = FORGE_GOLD_SOFT
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent"
                }}
              >
                <Hammer size={14} strokeWidth={1.75} />
                {t("artifacts.loadoutEquip")}
              </button>
            )}
            <button
              type="button"
              onClick={onSell}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = COLORS.accent
                e.currentTarget.style.borderColor = COLORS.accent
                e.currentTarget.style.color = COLORS.bg
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
                e.currentTarget.style.borderColor = COLORS.border
                e.currentTarget.style.color = COLORS.text
              }}
            >
              <Store size={14} strokeWidth={1.75} />
              {t("artifacts.sell")}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
