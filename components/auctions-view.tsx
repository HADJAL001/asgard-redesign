"use client"

/* ================================================================
   AuctionsView — Аукционы артефактов OSGARD
   ----------------------------------------------------------------
   Состязательный рынок: живые лоты с обратным отсчётом (по ends_at
   с сервера), текущей ставкой и реальным эскроу. Ставка списывает
   средства сразу, при перебитии — возврат. Данные полностью реальны
   (GET/POST /auctions), никаких заглушек.
   ================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Store, Gavel, Clock, Loader2, X, Plus, Crown, Coins } from "lucide-react"
import { Navbar } from "./navbar"
import { PremiumBackground } from "./premium-bg"
import { apiClient } from "@/lib/api-client"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS, RARITY, ARTIFACT_TYPES, CURRENCY_ORDER, CURRENCIES, type Rarity, type ArtifactType, type CurrencyId } from "@/lib/economy"

const CURRENCY_SYMBOL: Record<string, string> = {
  credits: "⚡",
  shards: "♦",
  crystals: "💎",
  timecoin: "∞",
  cash_usd: "$",
}

function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common") as Rarity
}
function safeType(t: string): ArtifactType {
  return (t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact") as ArtifactType
}
function fmt(n: number | null | undefined, currency: string): string {
  if (n == null) return "—"
  const v = n >= 1000 ? Math.round(n).toLocaleString("ru-RU") : (Math.round(n * 1000) / 1000).toLocaleString("ru-RU")
  return `${v} ${CURRENCY_SYMBOL[currency] || currency}`
}

type AuctionArtifact = {
  name: string
  type: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
}
type Auction = {
  id: number
  artifactId: number
  sellerId: number
  startPrice: number
  minIncrement: number
  currency: string
  currentBid: number | null
  currentBidderId: number | null
  bidCount: number
  status: string
  startsAt: number
  endsAt: number
  minNextBid: number
  artifact?: AuctionArtifact
  seller?: { username?: string; displayName?: string }
  isSeller?: boolean
  isTopBidder?: boolean
}

function timeLeft(ms: number): string {
  if (ms <= 0) return "Завершён"
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / (60 * 24))
  const h = Math.floor((totalMin % (60 * 24)) / 60)
  const m = totalMin % 60
  const s = Math.floor((ms % 60000) / 1000)
  if (d > 0) return `${d} д ${h} ч`
  if (h > 0) return `${h} ч ${m} мин`
  if (m > 0) return `${m} мин ${s} с`
  return `${s} с`
}

export function AuctionsView() {
  const router = useRouter()
  const wallet = useOsgardStore((s) => s.wallet)
  const artifacts = useOsgardStore((s) => s.artifacts)
  const fetchArtifacts = useOsgardStore((s) => s.fetchArtifacts)
  const fetchWallet = useOsgardStore((s) => s.fetchWallet)

  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)
  const skew = useRef(0)
  const [bidTarget, setBidTarget] = useState<Auction | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get<{ auctions: Auction[]; serverTime: number }>("/auctions", { skipAuthRedirect: true })
      skew.current = (r.serverTime || Date.now()) - Date.now()
      setNow(Date.now() + skew.current)
      setAuctions(r.auctions || [])
    } catch {
      setAuctions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void fetchArtifacts({ skipAuthRedirect: true })
    void fetchWallet({ skipAuthRedirect: true })
  }, [load, fetchArtifacts, fetchWallet])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew.current), 1000)
    return () => clearInterval(id)
  }, [])

  /* Живой список: SSE-снапшот (новые лоты, перебитые ставки, расчёт по истечении)
     вместо ручного обновления страницы. Реконнект с линейным бэкоффом, как в
     tc-market-panel. Начальный load() выше остаётся — первый кадр SSE придёт чуть
     позже монтирования. */
  useEffect(() => {
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    const connect = () => {
      source = new EventSource("/api/auctions/stream", { withCredentials: true })

      source.onopen = () => {
        attempts = 0
      }

      source.onmessage = (event) => {
        let payload: any
        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }
        if (payload?.type === "snapshot" && Array.isArray(payload.auctions)) {
          skew.current = (payload.serverTime || Date.now()) - Date.now()
          setNow(Date.now() + skew.current)
          setAuctions(payload.auctions)
          setLoading(false)
        }
      }

      source.onerror = () => {
        source?.close()
        attempts += 1
        reconnectTimer = setTimeout(connect, Math.min(1000 * attempts, 5000))
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      source?.close()
    }
  }, [])

  const metrics = useMemo(() => {
    const soon = auctions.filter((a) => a.endsAt - now < 60 * 60 * 1000).length
    const leading = auctions.filter((a) => a.isTopBidder).length
    return { total: auctions.length, soon, leading }
  }, [auctions, now])

  /* Артефакты, которые можно выставить: свои и не выставленные. */
  const auctionable = useMemo(() => artifacts.filter((a) => a.status !== "listed"), [artifacts])

  return (
    <div className="eg-page eg-page--violet relative min-h-screen overflow-hidden font-sans" style={{ color: COLORS.text }}>
      <PremiumBackground variant="market" />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
              <Gavel size={28} strokeWidth={1.75} style={{ color: COLORS.accent }} /> Аукционы
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Состязательные торги за артефакты — ставки с реальным удержанием средств
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-transform hover:scale-[1.03]"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              <Plus size={16} strokeWidth={2} /> Выставить артефакт
            </button>
            <button
              type="button"
              onClick={() => router.push("/marketplace")}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <Store size={16} strokeWidth={1.75} /> К маркетплейсу
            </button>
          </div>
        </div>

        {/* Метрики */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[
            { n: metrics.total, l: "Активных аукционов", Icon: Gavel },
            { n: metrics.soon, l: "Завершаются в течение часа", Icon: Clock },
            { n: metrics.leading, l: "Вы лидируете", Icon: Crown },
          ].map((m) => (
            <div key={m.l} className="eg-surface premium-card rounded-xl p-5">
              <m.Icon size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <p className="mt-2 text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Сетка аукционов */}
        {loading ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-[14px]" style={{ color: COLORS.label }}>
            <Loader2 size={18} className="animate-spin" /> Загрузка аукционов…
          </div>
        ) : auctions.length === 0 ? (
          <div className="eg-surface mt-10 rounded-2xl px-6 py-16 text-center">
            <Gavel size={32} strokeWidth={1.25} style={{ color: COLORS.label }} className="mx-auto" />
            <p className="mt-4 text-[16px]">Сейчас нет активных аукционов</p>
            <p className="mt-1 text-[13px]" style={{ color: COLORS.label }}>Выставьте свой артефакт первым — задайте старт и длительность торгов.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {auctions.map((a) => (
              <AuctionCard key={a.id} a={a} now={now} onBid={() => setBidTarget(a)} />
            ))}
          </div>
        )}
      </main>

      {bidTarget && (
        <BidModal
          auction={bidTarget}
          walletBalance={wallet[bidTarget.currency as CurrencyId] ?? 0}
          onClose={() => setBidTarget(null)}
          onPlaced={(updated) => {
            setAuctions((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
            setBidTarget(null)
            void fetchWallet({ skipAuthRedirect: true })
          }}
        />
      )}

      {createOpen && (
        <CreateAuctionModal
          artifacts={auctionable}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            void load()
            void fetchArtifacts({ skipAuthRedirect: true })
          }}
        />
      )}
    </div>
  )
}

/* ---------------- Карточка аукциона ---------------- */
function AuctionCard({ a, now, onBid }: { a: Auction; now: number; onBid: () => void }) {
  const rarity = RARITY[safeRarity(a.artifact?.rarity || "common")]
  const TypeIcon = ARTIFACT_TYPES[safeType(a.artifact?.type || "artifact")].Icon
  const msLeft = a.endsAt - now
  const ended = msLeft <= 0
  const seller = a.seller?.displayName || a.seller?.username || `#${a.sellerId}`

  return (
    <div
      className="eg-surface flex flex-col overflow-hidden rounded-2xl p-5"
      style={{
        border: `1px solid ${a.isTopBidder ? COLORS.accent : COLORS.border}`,
        boxShadow: `inset 0 0 32px ${rarity.color}0d`,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
          <TypeIcon size={22} strokeWidth={1.25} style={{ color: rarity.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{a.artifact?.name || "Артефакт"}</p>
          <p className="text-[12px]" style={{ color: rarity.color }}>{rarity.label} · Ур. {a.artifact?.level ?? 1}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]" style={{ border: `1px solid ${COLORS.border}`, color: ended ? COLORS.red : "rgba(255,255,255,0.6)" }}>
          <Clock size={11} /> {timeLeft(msLeft)}
        </span>
      </div>

      {/* Статы */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
        {[["СИЛ", a.artifact?.power], ["ЗАЩ", a.artifact?.defense], ["МАГ", a.artifact?.magic], ["СКР", a.artifact?.speed]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
            <p style={{ color: COLORS.label }}>{k}</p>
            <p className="font-medium">{(v as number) ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Ставка */}
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px]" style={{ color: COLORS.label }}>{a.currentBid != null ? "Текущая ставка" : "Старт"}</p>
          <p className="text-[20px] font-bold" style={{ color: COLORS.accent }}>
            {fmt(a.currentBid ?? a.startPrice, a.currency)}
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: COLORS.label }}>
            {a.bidCount} {a.bidCount === 1 ? "ставка" : a.bidCount >= 2 && a.bidCount <= 4 ? "ставки" : "ставок"} · след. от {fmt(a.minNextBid, a.currency)}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>Продавец: {seller}</p>

      {/* CTA */}
      <div className="mt-4">
        {a.isSeller ? (
          <span className="block rounded-lg py-2.5 text-center text-[13px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}>
            Ваш лот
          </span>
        ) : a.isTopBidder ? (
          <span className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-center text-[13px] font-medium" style={{ border: `1px solid ${COLORS.accent}`, color: COLORS.accent }}>
            <Crown size={15} /> Вы лидируете
          </span>
        ) : (
          <button
            type="button"
            onClick={onBid}
            disabled={ended}
            className="w-full rounded-lg py-2.5 text-[14px] font-medium transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {ended ? "Завершён" : "Сделать ставку"}
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------------- Модалка ставки ---------------- */
function BidModal({
  auction,
  walletBalance,
  onClose,
  onPlaced,
}: {
  auction: Auction
  walletBalance: number
  onClose: () => void
  onPlaced: (a: Auction) => void
}) {
  const [value, setValue] = useState(String(auction.minNextBid))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const amount = Number(value)
  const tooLow = !amount || amount < auction.minNextBid
  const tooPoor = amount > walletBalance

  async function submit() {
    if (tooLow || tooPoor) return
    setBusy(true)
    setErr(null)
    try {
      const r = await apiClient.post<{ auction: Auction }>(`/auctions/${auction.id}/bid`, { amount })
      onPlaced(r.auction)
    } catch (e: any) {
      const code = e?.data?.code
      if (code === "BID_TOO_LOW") setErr(`Ставку перебили. Минимум: ${fmt(e?.data?.minNextBid ?? auction.minNextBid, auction.currency)}`)
      else if (code === "AUCTION_ENDED") setErr("Аукцион уже завершён")
      else if (code === "ALREADY_TOP") setErr("Вы уже лидируете")
      else setErr(e?.message || "Не удалось сделать ставку")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="flex items-center gap-2 text-[18px] font-semibold"><Gavel size={18} /> Ставка</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-7 py-6">
          <p className="text-[15px] font-medium">{auction.artifact?.name}</p>
          <p className="mb-4 text-[12px]" style={{ color: COLORS.label }}>
            Текущая ставка: {fmt(auction.currentBid ?? auction.startPrice, auction.currency)} · минимум для перебития: {fmt(auction.minNextBid, auction.currency)}
          </p>
          <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Ваша ставка ({CURRENCY_SYMBOL[auction.currency] || auction.currency})</label>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} min={auction.minNextBid} className="cal-input" />
          <p className="mt-2 flex items-center gap-1.5 text-[12px]" style={{ color: tooPoor ? COLORS.red : COLORS.label }}>
            <Coins size={13} /> Баланс: {fmt(walletBalance, auction.currency)}
          </p>
          <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>
            При ставке средства удерживаются сразу. Если вашу ставку перебьют — они автоматически вернутся на кошелёк.
          </p>
          {err && <p className="mt-3 text-[12px]" style={{ color: COLORS.red }}>{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || tooLow || tooPoor}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium disabled:opacity-50"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {tooPoor ? "Недостаточно средств" : "Поставить"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Модалка создания аукциона ---------------- */
type OwnedArtifact = {
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
}
function CreateAuctionModal({
  artifacts,
  onClose,
  onCreated,
}: {
  artifacts: OwnedArtifact[]
  onClose: () => void
  onCreated: () => void
}) {
  const [artifactId, setArtifactId] = useState<number | null>(artifacts[0]?.id ?? null)
  const [startPrice, setStartPrice] = useState("100")
  const [currency, setCurrency] = useState<CurrencyId>("credits")
  const [hours, setHours] = useState("24")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const start = Number(startPrice)
  const dur = Number(hours)
  const valid = artifactId != null && start > 0 && dur >= 1 && dur <= 168

  async function submit() {
    if (!valid) return
    setBusy(true)
    setErr(null)
    try {
      await apiClient.post(`/auctions/create`, {
        artifactId,
        startPrice: start,
        currency,
        durationHours: dur,
      })
      onCreated()
    } catch (e: any) {
      setErr(e?.message || "Не удалось создать аукцион")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="flex items-center gap-2 text-[18px] font-semibold"><Gavel size={18} /> Выставить на аукцион</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-7 py-6">
          {artifacts.length === 0 ? (
            <p className="py-8 text-center text-[14px]" style={{ color: COLORS.label }}>
              Нет доступных артефактов. Скуйте или получите артефакт, чтобы выставить его на торги.
            </p>
          ) : (
            <>
              <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Артефакт</label>
              <div className="mb-4 grid max-h-[200px] grid-cols-1 gap-2 overflow-y-auto">
                {artifacts.map((a) => {
                  const rarity = RARITY[safeRarity(a.rarity)]
                  const TypeIcon = ARTIFACT_TYPES[safeType(a.type)].Icon
                  const sel = artifactId === a.id
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setArtifactId(a.id)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                      style={{ border: `1px solid ${sel ? COLORS.accent : COLORS.border}`, backgroundColor: sel ? "rgba(0,212,255,0.06)" : "transparent" }}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${rarity.color}` }}>
                        <TypeIcon size={17} strokeWidth={1.25} style={{ color: rarity.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px]">{a.name}</p>
                        <p className="text-[11px]" style={{ color: rarity.color }}>{rarity.label} · Ур. {a.level}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Стартовая цена</label>
                  <input type="number" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} min={1} className="cal-input" />
                </div>
                <div>
                  <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Валюта</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyId)} className="cal-input">
                    {CURRENCY_ORDER.map((c) => (
                      <option key={c} value={c}>{CURRENCIES[c].label} ({CURRENCIES[c].symbol})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Длительность торгов (часов, 1–168)</label>
                <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} min={1} max={168} className="cal-input" />
              </div>

              <p className="mt-4 text-[11px]" style={{ color: COLORS.label }}>
                Шаг ставки установится автоматически — 5% от старта (не менее 1). На время торгов артефакт блокируется.
              </p>
              {err && <p className="mt-3 text-[12px]" style={{ color: COLORS.red }}>{err}</p>}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !valid}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium disabled:opacity-50"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Выставить
          </button>
        </div>
      </div>
    </div>
  )
}
