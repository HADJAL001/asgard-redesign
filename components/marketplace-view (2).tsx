"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Store, Boxes, TrendingUp, Coins, Clock, X, Check, ChevronDown } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "./osgard-store"
import {
  COLORS,
  RARITY,
  ARTIFACT_TYPES,
  STAT_META,
  ARTIFACTS,
  CURRENCIES,
  CURRENCY_ORDER,
  computePrice,
  formatTokens,
  formatCurrencyAmount,
  creditsTo,
  type ArtifactType,
  type Rarity,
  type Artifact,
  type CurrencyId,
} from "@/lib/economy"

type SortKey = "price-desc" | "price-asc" | "level-desc" | "rarity-desc"

const SORTS: { id: SortKey; label: string }[] = [
  { id: "price-desc", label: "Цена: по убыванию" },
  { id: "price-asc", label: "Цена: по возрастанию" },
  { id: "level-desc", label: "Уровень: по убыванию" },
  { id: "rarity-desc", label: "Редкость: по убыванию" },
]

const RARITY_ORDER: Record<Rarity, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 }

function useHourlyCountdown() {
  const [left, setLeft] = useState(3600)
  useEffect(() => {
    const now = new Date()
    const secsIntoHour = now.getMinutes() * 60 + now.getSeconds()
    setLeft(3600 - secsIntoHour)
    const t = setInterval(() => setLeft((v) => (v <= 1 ? 3600 : v - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  const m = String(Math.floor(left / 60)).padStart(2, "0")
  const s = String(left % 60).padStart(2, "0")
  return `${m}:${s}`
}

export function MarketplaceView() {
  const router = useRouter()
  const countdown = useHourlyCountdown()

  const listed = useMemo(() => ARTIFACTS.filter((a) => a.status === "listed"), [])

  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "all">("all")
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all")
  const [sort, setSort] = useState<SortKey>("price-desc")
  const [sortOpen, setSortOpen] = useState(false)
  const [buying, setBuying] = useState<Artifact | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyId>("credits")

  const shown = useMemo(() => {
    const arr = listed.filter((a) => {
      const okType = typeFilter === "all" || a.type === typeFilter
      const okRarity = rarityFilter === "all" || a.rarity === rarityFilter
      const okQuery =
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.architect.toLowerCase().includes(query.toLowerCase())
      return okType && okRarity && okQuery
    })
    arr.sort((a, b) => {
      switch (sort) {
        case "price-asc": return a.price - b.price
        case "level-desc": return b.level - a.level
        case "rarity-desc": return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]
        default: return b.price - a.price
      }
    })
    return arr
  }, [listed, query, typeFilter, rarityFilter, sort])

  const volume = listed.reduce((s, a) => s + a.price, 0)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #160B24 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Маркетплейс</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Покупка и продажа цифровых артефактов
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
            Мои продажи
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: ARTIFACTS.length, l: "Артефактов", Icon: Boxes },
            { n: listed.length, l: "В продаже", Icon: Store },
            { n: 89, l: "Продано", Icon: TrendingUp },
            { n: formatTokens(volume), l: "Объём, токенов", Icon: Coins },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <p className="mt-2 text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Dynamic price banner */}
        <div className="mt-6 flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px]" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <Clock size={15} strokeWidth={1.75} style={{ color: COLORS.accent }} />
          <span style={{ color: "rgba(255,255,255,0.7)" }}>Цены динамические — следующее обновление через</span>
          <span style={{ color: COLORS.accent }}>{countdown}</span>
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.label }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию или архитектору"
                className="cal-input pl-9"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((v) => !v)}
                className="inline-flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-[13px] sm:w-56"
                style={{ border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.card, color: "rgba(255,255,255,0.8)" }}
              >
                {SORTS.find((s) => s.id === sort)?.label}
                <ChevronDown size={15} strokeWidth={1.75} style={{ color: COLORS.label }} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-12 z-20 w-full min-w-56 overflow-hidden rounded-lg py-1 text-[13px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  {SORTS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSort(s.id); setSortOpen(false) }}
                      className="block w-full px-4 py-2 text-left transition-colors hover:bg-[#14141E]"
                      style={{ color: sort === s.id ? COLORS.accent : "rgba(255,255,255,0.7)" }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: COLORS.label }}>Тип:</span>
            <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Все</Chip>
            {(Object.keys(ARTIFACT_TYPES) as ArtifactType[]).map((t) => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{ARTIFACT_TYPES[t].label}</Chip>
            ))}
            <span className="ml-3 text-[12px]" style={{ color: COLORS.label }}>Редкость:</span>
            <Chip active={rarityFilter === "all"} onClick={() => setRarityFilter("all")}>Все</Chip>
            {(Object.keys(RARITY) as Rarity[]).map((r) => (
              <Chip key={r} active={rarityFilter === r} onClick={() => setRarityFilter(r)} color={RARITY[r].color}>{RARITY[r].label}</Chip>
            ))}
          </div>

          {/* Display currency */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: COLORS.label }}>Показывать цену в:</span>
            {CURRENCY_ORDER.map((id) => {
              const c = CURRENCIES[id]
              const CIcon = c.Icon
              const active = displayCurrency === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDisplayCurrency(id)}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{ backgroundColor: active ? c.color : "transparent", color: active ? "#0A0A0F" : c.color, border: `1px solid ${active ? c.color : COLORS.border}` }}
                >
                  <CIcon size={13} strokeWidth={2} aria-hidden="true" />
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Grid */}
        {shown.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Boxes size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
            <p className="text-[15px]" style={{ color: COLORS.label }}>Ничего не найдено</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a) => (
              <MarketCard key={a.id} a={a} displayCurrency={displayCurrency} onBuy={() => setBuying(a)} />
            ))}
          </div>
        )}
      </main>

      {buying && <BuyModal a={buying} onClose={() => setBuying(null)} />}
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

function MarketCard({ a, displayCurrency, onBuy }: { a: Artifact; displayCurrency: CurrencyId; onBuy: () => void }) {
  const TypeIcon = ARTIFACT_TYPES[a.type].Icon
  const rarity = RARITY[a.rarity]
  const listCur = CURRENCIES[a.listCurrency]
  const dispCur = CURRENCIES[displayCurrency]

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

      <h3 className="mt-4 text-[16px] font-medium">{a.name}</h3>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[a.type].label}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: COLORS.label }}>Ур. {a.level}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {STAT_META.map((s) => (
          <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.label }}>{s.label}</span>
            <span>{a.stats[s.key]}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px]" style={{ color: COLORS.label }}>
        <span className="flex size-6 items-center justify-center rounded-full text-[11px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.accent }}>
          {a.architect.charAt(0)}
        </span>
        {a.architect} · Lvl.{a.architectLevel}
      </div>

      {/* Listing currency badge */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px]">
        <span style={{ color: COLORS.label }}>Листинг:</span>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ border: `1px solid ${listCur.color}`, color: listCur.color }}>
          <listCur.Icon size={11} strokeWidth={2} aria-hidden="true" />
          {formatCurrencyAmount(a.listCurrency, creditsTo(a.price, a.listCurrency))} {listCur.symbol}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="flex items-center gap-1.5 text-[17px] font-medium" style={{ color: dispCur.color }}>
          <dispCur.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          {formatCurrencyAmount(displayCurrency, creditsTo(a.price, displayCurrency))}
          <span className="text-[12px]" style={{ color: COLORS.label }}>{dispCur.symbol}</span>
        </span>
        <button
          type="button"
          onClick={onBuy}
          className="rounded-lg px-5 py-2 text-[14px] font-medium transition-colors"
          style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Купить
        </button>
      </div>
    </article>
  )
}

/* ---------------- Buy modal with multi-currency payment ---------------- */
function BuyModal({ a, onClose }: { a: Artifact; onClose: () => void }) {
  const { wallet, spend } = useOsgard()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payCurrency, setPayCurrency] = useState<CurrencyId>(a.listCurrency)
  const TypeIcon = ARTIFACT_TYPES[a.type].Icon
  const rarity = RARITY[a.rarity]

  const payCur = CURRENCIES[payCurrency]
  const cost = creditsTo(a.price, payCurrency)
  const enough = wallet[payCurrency] >= cost
  const sellerNet = cost * 0.95 // seller receives price minus 5% commission

  function confirm() {
    if (!enough) {
      setError(`Недостаточно ${payCur.label.toLowerCase()}`)
      return
    }
    if (spend(payCurrency, cost)) {
      setDone(true)
    } else {
      setError("Ошибка списания средств")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-2xl"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[18px] font-semibold">{done ? "Покупка завершена" : "Покупка артефакта"}</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 py-6">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
              <TypeIcon size={30} strokeWidth={1.25} style={{ color: rarity.color }} />
            </span>
            <div>
              <p className="text-[17px] font-medium">{a.name}</p>
              <p className="text-[13px]" style={{ color: rarity.color }}>{rarity.label} · Ур. {a.level}</p>
              <p className="mt-0.5 text-[12px]" style={{ color: COLORS.label }}>Архитектор: {a.architect}</p>
            </div>
          </div>

          {done ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl px-6 py-8 text-center" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <span className="flex size-12 items-center justify-center rounded-full" style={{ border: `1px solid ${COLORS.green}` }}>
                <Check size={22} strokeWidth={2} style={{ color: COLORS.green }} />
              </span>
              <p className="text-[15px]">Артефакт добавлен в вашу коллекцию</p>
              <p className="text-[13px]" style={{ color: COLORS.label }}>
                Списано {formatCurrencyAmount(payCurrency, cost)} {payCur.symbol}
              </p>
            </div>
          ) : (
            <>
              {/* Price in all four currencies */}
              <div className="mt-5 rounded-xl p-4" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: COLORS.label }}>Цена в валютах</p>
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  {CURRENCY_ORDER.map((id) => {
                    const c = CURRENCIES[id]
                    return (
                      <div key={id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ border: `1px solid ${COLORS.border}` }}>
                        <span className="inline-flex items-center gap-1.5" style={{ color: c.color }}>
                          <c.Icon size={13} strokeWidth={2} aria-hidden="true" />
                          {c.symbol}
                        </span>
                        <span style={{ color: "#FFFFFF" }}>{formatCurrencyAmount(id, creditsTo(a.price, id))}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Pay-currency selector */}
              <p className="mt-5 mb-2 text-[12px]" style={{ color: COLORS.label }}>Оплатить из кошелька:</p>
              <div className="flex flex-wrap gap-2">
                {CURRENCY_ORDER.map((id) => {
                  const c = CURRENCIES[id]
                  const active = payCurrency === id
                  const affordable = wallet[id] >= creditsTo(a.price, id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setPayCurrency(id); setError(null) }}
                      aria-pressed={active}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                      style={{
                        backgroundColor: active ? c.color : "transparent",
                        color: active ? "#0A0A0F" : affordable ? c.color : "rgba(255,255,255,0.3)",
                        border: `1px solid ${active ? c.color : COLORS.border}`,
                      }}
                    >
                      <c.Icon size={13} strokeWidth={2} aria-hidden="true" />
                      {c.label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 space-y-1.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: COLORS.label }}>Ваш баланс</span>
                  <span style={{ color: enough ? "#FFFFFF" : COLORS.red }}>{formatCurrencyAmount(payCurrency, wallet[payCurrency])} {payCur.symbol}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: COLORS.label }}>Продавец получит (−5%)</span>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>{formatCurrencyAmount(payCurrency, sellerNet)} {payCur.symbol}</span>
                </div>
              </div>

              {error && (
                <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" role="alert" style={{ backgroundColor: "rgba(231,76,60,0.1)", color: COLORS.red }}>
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={onClose} className="flex-1 rounded-lg py-3 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!enough}
                  className="flex-1 rounded-lg py-3 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  Купить за {formatCurrencyAmount(payCurrency, cost)} {payCur.symbol}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
