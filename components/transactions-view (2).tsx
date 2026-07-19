"use client"

import { useMemo, useState } from "react"
import { Download, ArrowDownLeft, ArrowUpRight, Coins, TrendingUp, TrendingDown } from "lucide-react"
import { Navbar } from "./navbar"
import {
  COLORS,
  TRANSACTIONS,
  TX_META,
  TX_STATUS,
  formatTokens,
  type TxType,
} from "@/lib/economy"

const FILTERS: { id: TxType | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "buy", label: "Покупки" },
  { id: "sell", label: "Продажи" },
  { id: "dividend", label: "Дивиденды" },
]

export function TransactionsView() {
  const [filter, setFilter] = useState<TxType | "all">("all")

  const shown = useMemo(
    () => (filter === "all" ? TRANSACTIONS : TRANSACTIONS.filter((t) => t.type === filter)),
    [filter],
  )

  const income = TRANSACTIONS.filter((t) => (t.type === "sell" || t.type === "dividend") && t.status === "done").reduce((s, t) => s + t.amount, 0)
  const spent = TRANSACTIONS.filter((t) => t.type === "buy" && t.status === "done").reduce((s, t) => s + t.amount, 0)

  function exportCsv() {
    const header = ["ID", "Тип", "Предмет", "Контрагент", "Сумма", "Дата", "Статус"]
    const rows = shown.map((t) => [t.id, TX_META[t.type].label, t.item, t.counterparty, String(t.amount), t.date, TX_STATUS[t.status].label])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "osgard-transactions.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">История</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Все покупки, продажи и дивиденды
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
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
            <Download size={16} strokeWidth={1.75} />
            Экспорт в CSV
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { n: formatTokens(income), l: "Доход, токенов", Icon: TrendingUp, color: COLORS.green },
            { n: formatTokens(spent), l: "Расход, токенов", Icon: TrendingDown, color: COLORS.red },
            { n: formatTokens(income - spent), l: "Баланс, токенов", Icon: Coins, color: COLORS.accent },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={16} strokeWidth={1.5} style={{ color: m.color }} />
              <p className="mt-2 text-[24px] font-medium">{m.n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-lg px-4 py-2 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                  color: active ? COLORS.accent : "rgba(255,255,255,0.6)",
                  backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="hidden grid-cols-[1fr_2fr_1.4fr_1fr_1fr] gap-4 px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.14em] md:grid" style={{ color: COLORS.label, borderBottom: `1px solid ${COLORS.border}` }}>
            <span>Тип</span>
            <span>Предмет</span>
            <span>Дата</span>
            <span>Сумма</span>
            <span className="text-right">Статус</span>
          </div>
          {shown.map((t) => {
            const meta = TX_META[t.type]
            const status = TX_STATUS[t.status]
            const isIncome = t.type === "sell" || t.type === "dividend"
            return (
              <div key={t.id} className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[1fr_2fr_1.4fr_1fr_1fr] md:items-center" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: meta.color }}>
                  <span className="flex size-7 items-center justify-center rounded-lg" style={{ border: `1px solid ${COLORS.border}` }}>
                    {isIncome ? <ArrowDownLeft size={14} strokeWidth={1.75} /> : <ArrowUpRight size={14} strokeWidth={1.75} />}
                  </span>
                  {meta.label}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px]">{t.item}</p>
                  <p className="text-[12px]" style={{ color: COLORS.label }}>{t.counterparty} · {t.id}</p>
                </div>
                <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{t.date}</span>
                <span className="text-[14px]" style={{ color: isIncome ? COLORS.green : COLORS.red }}>
                  {isIncome ? "+" : "−"}{formatTokens(t.amount)}
                </span>
                <span className="inline-flex items-center gap-2 text-[13px] md:justify-end" style={{ color: status.color }}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
                  {status.label}
                </span>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
