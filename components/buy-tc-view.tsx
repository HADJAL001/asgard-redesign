"use client"

import { useState } from "react"
import { Infinity as InfinityIcon, Check, X, CreditCard, Bitcoin, ShieldCheck } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "./osgard-store"
import { COLORS, TC_USD, formatTokens } from "@/lib/economy"

type Pack = { tc: number; bonus: number; popular?: boolean }

const PACKS: Pack[] = [
  { tc: 100, bonus: 0 },
  { tc: 550, bonus: 50, popular: true },
  { tc: 1_200, bonus: 200 },
  { tc: 3_000, bonus: 750 },
  { tc: 7_000, bonus: 2_000 },
  { tc: 15_000, bonus: 5_000 },
]

export function BuyTcView() {
  const { addTC } = useOsgard()
  const [selected, setSelected] = useState<Pack | null>(null)
  const [method, setMethod] = useState<"card" | "crypto">("card")
  const [done, setDone] = useState(false)

  const totalTc = selected ? selected.tc + selected.bonus : 0
  const usd = selected ? selected.tc * TC_USD : 0

  function confirm() {
    if (!selected) return
    addTC(totalTc)
    setDone(true)
  }

  function close() {
    setSelected(null)
    setDone(false)
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #160B24 100%)", color: COLORS.text }}
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
                setDone(false)
              }}
              className="group relative rounded-2xl p-6 text-left transition-colors"
              style={{
                backgroundColor: COLORS.card,
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
              {p.bonus > 0 && (
                <p className="mt-2 text-[13px]" style={{ color: COLORS.green }}>
                  + {formatTokens(p.bonus)} ∞ бонус
                </p>
              )}
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
              <h2 className="text-[20px] font-semibold">{done ? "Готово" : "Оплата"}</h2>
              <button type="button" onClick={close} aria-label="Закрыть" className="transition-colors hover:text-white" style={{ color: COLORS.label }}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            {done ? (
              <div className="mt-6 flex flex-col items-center py-6 text-center">
                <span className="flex size-16 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(74,222,128,0.12)" }}>
                  <Check size={30} strokeWidth={2} style={{ color: COLORS.green }} />
                </span>
                <p className="mt-4 text-[22px] font-medium" style={{ color: "#F1C40F" }}>
                  +{formatTokens(totalTc)} ∞
                </p>
                <p className="mt-1 text-[13px]" style={{ color: COLORS.label }}>
                  Зачислено на ваш кошелёк
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 w-full rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-lg p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center justify-between text-[14px]">
                    <span style={{ color: COLORS.label }}>TimeCoin</span>
                    <span>{formatTokens(selected.tc)} ∞</span>
                  </div>
                  {selected.bonus > 0 && (
                    <div className="mt-2 flex items-center justify-between text-[14px]">
                      <span style={{ color: COLORS.label }}>Бонус</span>
                      <span style={{ color: COLORS.green }}>+{formatTokens(selected.bonus)} ∞</span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t pt-3 text-[15px]" style={{ borderColor: COLORS.border }}>
                    <span>К оплате</span>
                    <span className="font-medium">${formatTokens(usd)} USD</span>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  {[
                    { id: "card" as const, label: "Карта", Icon: CreditCard },
                    { id: "crypto" as const, label: "Крипто", Icon: Bitcoin },
                  ].map((m) => {
                    const active = method === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] transition-colors"
                        style={{
                          border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                          color: active ? COLORS.accent : "rgba(255,255,255,0.7)",
                          backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                        }}
                      >
                        <m.Icon size={15} strokeWidth={1.5} />
                        {m.label}
                      </button>
                    )
                  })}
                </div>

                <button
                  type="button"
                  onClick={confirm}
                  className="mt-5 w-full rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  Оплатить ${formatTokens(usd)}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
