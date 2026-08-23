"use client"

import { useState } from "react"
import { Infinity as InfinityIcon, X, CreditCard, ShieldCheck, Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS, TC_USD, formatTokens } from "@/lib/economy"
import { apiClient } from "@/lib/api-client"

type Pack = { tc: number; popular?: boolean }

const PACKS: Pack[] = [
  { tc: 1 },
  { tc: 5 },
  { tc: 10, popular: true },
  { tc: 25 },
  { tc: 50 },
  { tc: 100 },
]

export function BuyTcView() {
  const [selected, setSelected] = useState<Pack | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usd = selected ? selected.tc * TC_USD : 0

  async function confirm() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const result = await apiClient.post<{ url: string | null }>("/subscription/timecoin-checkout", { quantity: selected.tc })
      if (!result.url) throw new Error("Payment URL was not returned")
      window.location.assign(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open checkout")
      setBusy(false)
    }
  }

  function close() {
    setSelected(null)
    setError(null)
  }

  return (
    <div
      className="eg-page eg-page--violet min-h-screen font-sans"
      style={{ color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Пополнение TimeCoin</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Высшая валюта экосистемы. 1 ∞ = ${TC_USD} USD · дефляционная эмиссия 2 100 000 ∞
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PACKS.map((p) => (
            <button
              key={p.tc}
              type="button"
              onClick={() => {
                setSelected(p)
                setError(null)
              }}
              className="eg-surface premium-card group relative rounded-2xl p-6 text-left transition-colors"
              style={{
                border: `1px solid ${p.popular ? "#F1C40F" : COLORS.border}`,
              }}
              onMouseEnter={(e) => {
                if (!p.popular) e.currentTarget.style.borderColor = COLORS.accent
              }}
              onMouseLeave={(e) => {
                if (!p.popular) e.currentTarget.style.borderColor = COLORS.border
              }}
            >
              {p.popular && (
                <span
                  className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]"
                  style={{ backgroundColor: "rgba(241,196,15,0.12)", color: "#F1C40F" }}
                >
                  Популярный
                </span>
              )}
              <InfinityIcon size={24} strokeWidth={1.5} style={{ color: "#F1C40F" }} aria-hidden="true" />
              <p className="mt-4 text-[28px] font-medium leading-none">{formatTokens(p.tc)} ∞</p>
              <p className="mt-4 text-[15px]" style={{ color: COLORS.label }}>
                ${formatTokens(p.tc * TC_USD)} USD
              </p>
            </button>
          ))}
        </div>

        <p className="mt-6 inline-flex items-center gap-2 text-[12px]" style={{ color: COLORS.label }}>
          <ShieldCheck size={14} strokeWidth={1.5} />
          Безопасная оплата. Средства зачисляются мгновенно после подтверждения.
        </p>
      </main>

      {/* Checkout modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(5,5,8,0.75)" }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Оплата TimeCoin"
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-semibold">Оплата</h2>
              <button type="button" onClick={close} aria-label="Закрыть" className="transition-colors hover:text-white" style={{ color: COLORS.label }}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            <>
                <div className="eg-inset mt-5 rounded-lg p-4">
                  <div className="flex items-center justify-between text-[14px]">
                    <span style={{ color: COLORS.label }}>TimeCoin</span>
                    <span>{formatTokens(selected.tc)} ∞</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-[15px]" style={{ borderColor: COLORS.border }}>
                    <span>К оплате</span>
                    <span className="font-medium">${formatTokens(usd)} USD</span>
                  </div>
                </div>

                <div className="mt-5 inline-flex items-center gap-2 text-[13px]" style={{ color: COLORS.label }}>
                  <CreditCard size={15} strokeWidth={1.5} />
                  Безопасная оплата картой
                </div>

                {error ? <p className="mt-4 text-[13px]" style={{ color: COLORS.red }}>{error}</p> : null}

                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="mt-5 w-full rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  {busy ? <Loader2 className="mx-auto animate-spin" size={18} /> : `Оплатить $${formatTokens(usd)}`}
                </button>
              </>
          </div>
        </div>
      )}
    </div>
  )
}
