"use client"

/* ================================================================
   MarketplaceView — Маркетплейс OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchListings() (GET /marketplace/listings).
   - Отображает список всех артефактов, выставленных на продажу другими
     пользователями (лоты со статусом active).
   - Для каждого лота показывает: название, тип, редкость, характеристики
     (power/defense/magic/speed), цену (price + currency) и имя продавца
     (sellerDisplayName || sellerUsername).
   - Кнопка "Купить" вызывает buyListing(id) → POST /marketplace/:id/buy,
     после успешной покупки лот пропадает из списка, а кошелёк
     обновляется в сторе.
   - Фильтры: по типу артефакта, по редкости и по диапазону цены (от/до).
   - Форматирование чисел — через fmtTC()/fmtUSD() из lib/tc-market.ts
     (fmtTC для валюты timecoin, fmtUSD для cash_usd, для остальных —
     обычное локализованное число).
   ================================================================ */

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Store, Boxes, TrendingUp, Coins, Loader2, Check, X } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore, type MarketListing } from "@/lib/store/osgard-store"
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

/** Приведение произвольной строки типа/редкости к безопасному ключу с фолбэком. */
function safeType(t: string): ArtifactType {
  return (t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact")
}
function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common")
}

/** Форматирование цены лота в зависимости от валюты. */
function formatPrice(price: number, currency: string): string {
  if (currency === "timecoin") return fmtTC(price)
  if (currency === "cash_usd") return fmtUSD(price)
  return `${price.toLocaleString("ru-RU")} ${currency}`
}

export function MarketplaceView() {
  const { t } = useTranslation()
  const router = useRouter()

  const { marketplaceListings, fetchListings, buyListing, loading, error } = useOsgardStore()

  useEffect(() => {
    fetchListings({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "all">("all")
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all")
  const [priceMin, setPriceMin] = useState("")
  const [priceMax, setPriceMax] = useState("")
  const [buying, setBuying] = useState<MarketListing | null>(null)

  const shown = useMemo(() => {
    const min = priceMin ? Number(priceMin) : null
    const max = priceMax ? Number(priceMax) : null
    return marketplaceListings.filter((l) => {
      const okType = typeFilter === "all" || l.artifactType === typeFilter
      const okRarity = rarityFilter === "all" || l.rarity === rarityFilter
      const okQuery =
        l.artifactName.toLowerCase().includes(query.toLowerCase()) ||
        (l.sellerDisplayName ?? l.sellerUsername).toLowerCase().includes(query.toLowerCase())
      const okMin = min === null || l.price >= min
      const okMax = max === null || l.price <= max
      return okType && okRarity && okQuery && okMin && okMax
    })
  }, [marketplaceListings, query, typeFilter, rarityFilter, priceMin, priceMax])

  const volume = marketplaceListings.reduce((s, l) => s + l.price, 0)

  const handleBuy = useCallback((l: MarketListing) => setBuying(l), [])

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #160B24 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("marketplace.title")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("marketplace.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/my-sales")}
            className="inline-flex items-center gap-2 self-start rounded-lg px-4 py-2.5 text-[14px] transition-colors sm:self-auto"
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
            <Store size={16} strokeWidth={1.75} />
            {t("marketplace.mySales")}
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[
            { n: marketplaceListings.length, l: t("marketplace.listingsCount"), Icon: Boxes },
            { n: shown.length, l: t("marketplace.foundByFilters"), Icon: TrendingUp },
            { n: volume.toLocaleString("ru-RU"), l: t("marketplace.totalVolume"), Icon: Coins },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <p className="mt-2 text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.label }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("marketplace.searchPlaceholder")}
                className="cal-input pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder={t("marketplace.priceFrom")}
                className="cal-input w-32"
              />
              <span style={{ color: COLORS.label }}>—</span>
              <input
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder={t("marketplace.priceTo")}
                className="cal-input w-32"
              />
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: COLORS.label }}>{t("marketplace.type")}:</span>
            <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>{t("marketplace.all")}</Chip>
            {(Object.keys(ARTIFACT_TYPES) as ArtifactType[]).map((tk) => (
              <Chip key={tk} active={typeFilter === tk} onClick={() => setTypeFilter(tk)}>{ARTIFACT_TYPES[tk].label}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: COLORS.label }}>{t("marketplace.rarity")}:</span>
            <Chip active={rarityFilter === "all"} onClick={() => setRarityFilter("all")}>{t("marketplace.all")}</Chip>
            {(Object.keys(RARITY) as Rarity[]).map((r) => (
              <Chip key={r} active={rarityFilter === r} onClick={() => setRarityFilter(r)} color={RARITY[r].color}>{RARITY[r].label}</Chip>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && marketplaceListings.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
            <p className="text-[14px]" style={{ color: COLORS.label }}>{t("marketplace.loadingListings")}</p>
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
            <p className="text-[15px]" style={{ color: COLORS.label }}>{t("marketplace.notFound")}</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => (
              <MarketCard key={l.id} l={l} onBuy={handleBuy} t={t} />
            ))}
          </div>
        )}
      </main>

      {buying && (
        <BuyModal
          l={buying}
          onClose={() => setBuying(null)}
          onBuy={buyListing}
          t={t}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12px] transition-colors"
      style={{
        border: `1px solid ${active ? color ?? COLORS.accent : COLORS.border}`,
        color: active ? color ?? COLORS.accent : "rgba(255,255,255,0.55)",
      }}
    >
      {children}
    </button>
  )
}

const MarketCard = memo(function MarketCard({
  l,
  onBuy,
  t,
}: {
  l: MarketListing
  onBuy: (l: MarketListing) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const TypeIcon = ARTIFACT_TYPES[safeType(l.artifactType)].Icon
  const rarity = RARITY[safeRarity(l.rarity)]
  const stats = { power: l.power, defense: l.defense, magic: l.magic, speed: l.speed }
  const sellerName = l.sellerDisplayName || l.sellerUsername

  return (
    <article
      className="flex flex-col rounded-xl p-5 transition-all duration-200"
      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = rarity.color
        e.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div className="flex items-start justify-between">
        <span className="flex size-12 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
          <TypeIcon size={24} strokeWidth={1.25} style={{ color: rarity.color }} />
        </span>
        <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${rarity.color}`, color: rarity.color }}>
          {rarity.label}
        </span>
      </div>

      <h3 className="mt-4 text-[16px] font-medium">{l.artifactName}</h3>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[safeType(l.artifactType)].label}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: COLORS.label }}>{t("marketplace.level", { level: l.level })}</span>
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

      <div className="mt-4 flex items-center gap-2 text-[12px]" style={{ color: COLORS.label }}>
        <span className="flex size-6 items-center justify-center rounded-full text-[11px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.accent }}>
          {sellerName.charAt(0).toUpperCase()}
        </span>
        {sellerName}
      </div>

      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="text-[17px] font-medium" style={{ color: COLORS.accent }}>
          {formatPrice(l.price, l.currency)}
        </span>
        <button
          type="button"
          onClick={() => onBuy(l)}
          className="rounded-lg px-5 py-2 text-[14px] font-medium transition-colors"
          style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          {t("marketplace.buy")}
        </button>
      </div>
    </article>
  )
})

/* ---------------- Buy modal ---------------- */
function BuyModal({
  l,
  onClose,
  onBuy,
  t,
}: {
  l: MarketListing
  onClose: () => void
  onBuy: (listingId: number) => Promise<{ success: boolean; error?: string }>
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const TypeIcon = ARTIFACT_TYPES[safeType(l.artifactType)].Icon
  const rarity = RARITY[safeRarity(l.rarity)]
  const sellerName = l.sellerDisplayName || l.sellerUsername

  async function confirm() {
    setPending(true)
    setError(null)
    const res = await onBuy(l.id)
    setPending(false)
    if (res.success) {
      setDone(true)
    } else {
      setError(res.error || t("marketplace.buyFailed"))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-2xl"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[18px] font-semibold">{done ? t("marketplace.purchaseComplete") : t("marketplace.purchaseTitle")}</h2>
          <button type="button" aria-label={t("marketplace.close")} onClick={onClose} style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 py-6">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
              <TypeIcon size={30} strokeWidth={1.25} style={{ color: rarity.color }} />
            </span>
            <div>
              <p className="text-[17px] font-medium">{l.artifactName}</p>
              <p className="text-[13px]" style={{ color: rarity.color }}>{rarity.label} · {t("marketplace.level", { level: l.level })}</p>
              <p className="mt-0.5 text-[12px]" style={{ color: COLORS.label }}>{t("marketplace.seller")}: {sellerName}</p>
            </div>
          </div>

          {done ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl px-6 py-8 text-center" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <span className="flex size-12 items-center justify-center rounded-full" style={{ border: `1px solid ${COLORS.green}` }}>
                <Check size={22} strokeWidth={2} style={{ color: COLORS.green }} />
              </span>
              <p className="text-[15px]">{t("marketplace.addedToCollection")}</p>
              <p className="text-[13px]" style={{ color: COLORS.label }}>
                {t("marketplace.charged", { amount: formatPrice(l.price, l.currency) })}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <span className="text-[13px]" style={{ color: COLORS.label }}>{t("marketplace.price")}</span>
                <span className="text-[16px] font-medium" style={{ color: COLORS.accent }}>{formatPrice(l.price, l.currency)}</span>
              </div>

              {error && (
                <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" role="alert" style={{ backgroundColor: "rgba(231,76,60,0.1)", color: COLORS.red }}>
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={onClose} className="flex-1 rounded-lg py-3 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>{t("marketplace.cancel")}</button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  {pending && <Loader2 size={15} className="animate-spin" />}
                  {t("marketplace.buyFor", { price: formatPrice(l.price, l.currency) })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
