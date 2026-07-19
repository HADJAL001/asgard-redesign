"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { X, Store, TrendingUp, Coins, Eye, Tag, XCircle } from "lucide-react"
import { Navbar } from "./navbar"
import {
  COLORS,
  RARITY,
  ARTIFACT_TYPES,
  ARTIFACTS,
  formatTokens,
  type Artifact,
} from "@/lib/economy"

type SaleStatus = "active" | "sold" | "cancelled"

type Sale = Artifact & { saleStatus: SaleStatus; views: number; listed: string }

const STATUS: Record<SaleStatus, { label: string; color: string }> = {
  active: { label: "Активно", color: "#00D4FF" },
  sold: { label: "Продано", color: "#4ADE80" },
  cancelled: { label: "Отменено", color: "#F87171" },
}

function seedSales(): Sale[] {
  const mine = ARTIFACTS.filter((a) => a.architect === "Alex Odin" && (a.status === "listed" || a.status === "sold"))
  const map: SaleStatus[] = ["active", "sold", "active", "cancelled"]
  return mine.map((a, i) => ({
    ...a,
    saleStatus: a.status === "sold" ? "sold" : map[i % map.length],
    views: 20 + ((a.id * 37) % 220),
    listed: `${10 + (a.id % 18)}.07.2026`,
  }))
}

export function MySalesView() {
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>(() => seedSales())
  const [filter, setFilter] = useState<SaleStatus | "all">("all")
  const [editing, setEditing] = useState<Sale | null>(null)

  const shown = useMemo(
    () => (filter === "all" ? sales : sales.filter((s) => s.saleStatus === filter)),
    [sales, filter],
  )

  const active = sales.filter((s) => s.saleStatus === "active")
  const totals = {
    active: active.length,
    sold: sales.filter((s) => s.saleStatus === "sold").length,
    revenue: sales.filter((s) => s.saleStatus === "sold").reduce((x, s) => x + s.price, 0),
  }

  function cancel(id: number) {
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, saleStatus: "cancelled" } : s)))
  }
  function setPrice(id: number, price: number) {
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, price } : s)))
    setEditing(null)
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Мои продажи</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Управление артефактами, выставленными на продажу
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/marketplace")}
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
            К маркетплейсу
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { n: totals.active, l: "Активных лотов", Icon: Tag },
            { n: totals.sold, l: "Продано", Icon: TrendingUp },
            { n: formatTokens(totals.revenue), l: "Выручка, токенов", Icon: Coins },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <p className="mt-2 text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {([["all", "Все"], ["active", "Активно"], ["sold", "Продано"], ["cancelled", "Отменено"]] as const).map(([id, label]) => {
            const activeF = filter === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className="rounded-lg px-4 py-2 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${activeF ? COLORS.accent : COLORS.border}`,
                  color: activeF ? COLORS.accent : "rgba(255,255,255,0.6)",
                  backgroundColor: activeF ? "rgba(0,212,255,0.06)" : "transparent",
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1.4fr] gap-4 px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.14em] md:grid" style={{ color: COLORS.label, borderBottom: `1px solid ${COLORS.border}` }}>
            <span>Артефакт</span>
            <span>Статус</span>
            <span>Просмотры</span>
            <span>Цена</span>
            <span className="text-right">Действия</span>
          </div>
          {shown.map((s) => {
            const TypeIcon = ARTIFACT_TYPES[s.type].Icon
            const rarity = RARITY[s.rarity]
            const st = STATUS[s.saleStatus]
            return (
              <div key={s.id} className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-[2fr_1fr_1fr_1fr_1.4fr] md:items-center" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${rarity.color}` }}>
                    <TypeIcon size={18} strokeWidth={1.25} style={{ color: rarity.color }} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px]">{s.name}</p>
                    <p className="text-[12px]" style={{ color: rarity.color }}>{rarity.label} · Ур. {s.level}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: st.color }}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: st.color }} />
                  {st.label}
                </span>
                <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                  <Eye size={14} strokeWidth={1.75} style={{ color: COLORS.label }} />
                  {s.views}
                </span>
                <span className="text-[14px]" style={{ color: COLORS.accent }}>{formatTokens(s.price)} ток.</span>
                <div className="flex items-center gap-2 md:justify-end">
                  {s.saleStatus === "active" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                      >
                        <Tag size={14} strokeWidth={1.75} />
                        Изменить цену
                      </button>
                      <button
                        type="button"
                        onClick={() => cancel(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
                      >
                        <XCircle size={14} strokeWidth={1.75} />
                        Снять
                      </button>
                    </>
                  ) : (
                    <span className="text-[12px]" style={{ color: COLORS.label }}>—</span>
                  )}
                </div>
              </div>
            )
          })}
          {shown.length === 0 && (
            <div className="px-6 py-12 text-center text-[14px]" style={{ color: COLORS.label }}>Нет лотов в этой категории</div>
          )}
        </div>
      </main>

      {editing && <PriceModal sale={editing} onClose={() => setEditing(null)} onSave={(p) => setPrice(editing.id, p)} />}
    </div>
  )
}

function PriceModal({ sale, onClose, onSave }: { sale: Sale; onClose: () => void; onSave: (price: number) => void }) {
  const [value, setValue] = useState(String(sale.price))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,6,17,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[18px] font-semibold">Изменить цену</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} style={{ color: COLORS.label }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-7 py-6">
          <p className="text-[14px]">{sale.name}</p>
          <p className="mb-4 text-[12px]" style={{ color: COLORS.label }}>Текущая цена: {formatTokens(sale.price)} токенов</p>
          <label className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>Новая цена, токенов</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="cal-input"
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-[14px]" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Отмена</button>
          <button type="button" onClick={() => onSave(Math.max(0, Number(value) || 0))} className="rounded-lg px-5 py-2.5 text-[14px] font-medium" style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
