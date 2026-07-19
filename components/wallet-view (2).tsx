"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Plus, Info } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "./osgard-store"
import {
  COLORS,
  CURRENCIES,
  CURRENCY_ORDER,
  EXCHANGE_FEE,
  crossRate,
  formatTokens,
  formatCurrencyAmount,
  type CurrencyId,
} from "@/lib/economy"
import { UP } from "@/lib/tc-market"

export function WalletView() {
  const { wallet, convert, usdFor, tcPrice } = useOsgard()
  const [from, setFrom] = useState<CurrencyId>("credits")
  const [to, setTo] = useState<CurrencyId>("shards")
  const [amount, setAmount] = useState("")
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // amount is entered as "how much `to` you want to receive"
  const wantTo = Number(amount) || 0
  const rate = from === to ? 0 : crossRate(from, to) // 1 `to` = rate `from`
  const grossGive = wantTo * rate
  const fee = grossGive * EXCHANGE_FEE
  const totalGive = grossGive + fee
  const affordable = wallet[from] >= totalGive

  function doConvert() {
    if (from === to) {
      setNotice({ ok: false, text: "Выберите разные валюты" })
      return
    }
    const n = Number(amount)
    if (!n || n <= 0) {
      setNotice({ ok: false, text: "Введите сумму" })
      return
    }
    const res = convert(n, from, to)
    setNotice({ ok: res.ok, text: res.message })
    if (res.ok) setAmount("")
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Кошелёк</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Баланс всех валют OSGARD и обмен между уровнями
            </p>
          </div>
          <Link
            href="/buy-tc"
            className="inline-flex items-center gap-2 self-start rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90 sm:self-auto"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            <Plus size={16} strokeWidth={2} />
            Пополнить TimeCoin
          </Link>
        </div>

        {/* Currency balances */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CURRENCY_ORDER.map((id) => {
            const c = CURRENCIES[id]
            return (
              <div
                key={id}
                className="rounded-xl p-5"
                style={{
                  backgroundColor: COLORS.card,
                  border: `1px solid ${id === "timecoin" ? "rgba(241,196,15,0.4)" : COLORS.border}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <c.Icon size={20} strokeWidth={1.5} style={{ color: c.color }} aria-hidden="true" />
                  <span className="text-[18px]" style={{ color: c.color }}>
                    {c.symbol}
                  </span>
                </div>
                <p className="mt-4 text-[26px] font-medium leading-none">{formatTokens(wallet[id])}</p>
                {id === "timecoin" && (
                  <p className="mt-1.5 text-[13px]" style={{ color: UP }}>
                    ≈ ${usdFor(wallet[id]).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </p>
                )}
                <p className="mt-2 text-[13px]">{c.label}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em]" style={{ color: COLORS.label }}>
                  Уровень {c.tier} · {c.rarity}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Exchange */}
          <section
            className="rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              Конвертер валют
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: COLORS.label }}>
              Обмен между любыми валютами · комиссия {Math.round(EXCHANGE_FEE * 100)}%
            </p>

            {/* From / To selectors */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <CurrencySelect
                label="Из"
                value={from}
                onChange={(id) => {
                  setFrom(id)
                  if (id === to) setTo(CURRENCY_ORDER.find((c) => c !== id)!)
                  setNotice(null)
                }}
              />
              <button
                type="button"
                aria-label="Поменять местами"
                onClick={() => {
                  setFrom(to)
                  setTo(from)
                  setNotice(null)
                }}
                className="mx-auto flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
              >
                <ArrowRight size={16} strokeWidth={1.75} />
              </button>
              <CurrencySelect
                label="В"
                value={to}
                onChange={(id) => {
                  setTo(id)
                  if (id === from) setFrom(CURRENCY_ORDER.find((c) => c !== id)!)
                  setNotice(null)
                }}
              />
            </div>

            <div className="mt-5">
              <label htmlFor="ex-amt" className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>
                Хочу получить ({CURRENCIES[to].label})
              </label>
              <input
                id="ex-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                className="cal-input"
              />
            </div>

            {/* Quote breakdown */}
            <div className="mt-4 space-y-2 rounded-lg p-4 text-[13px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5" style={{ color: COLORS.label }}>
                  <Info size={13} strokeWidth={1.5} /> Курс
                </span>
                <span>1 {CURRENCIES[to].symbol} = {formatCurrencyAmount(from, rate)} {CURRENCIES[from].symbol}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>Комиссия ({Math.round(EXCHANGE_FEE * 100)}%)</span>
                <span>{formatCurrencyAmount(from, fee)} {CURRENCIES[from].symbol}</span>
              </div>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span>Спишется</span>
                <span style={{ color: affordable ? "#FFFFFF" : COLORS.red }}>
                  {formatCurrencyAmount(from, totalGive)} {CURRENCIES[from].symbol}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={doConvert}
              disabled={!affordable || wantTo <= 0 || from === to}
              className="mt-5 w-full rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              Обменять
            </button>

            {notice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: notice.ok ? COLORS.green : COLORS.red }}>
                {notice.text}
              </p>
            )}
          </section>

          {/* Hierarchy reference */}
          <aside
            className="rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              Иерархия
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {CURRENCY_ORDER.map((id, i) => {
                const c = CURRENCIES[id]
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span
                      className="flex size-9 items-center justify-center rounded-lg text-[16px]"
                      style={{ border: `1px solid ${COLORS.border}`, color: c.color }}
                    >
                      {c.symbol}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px]">{c.label}</p>
                      <p className="text-[12px]" style={{ color: COLORS.label }}>
                        {i === 0 ? "Базовая валюта" : `${formatTokens(c.ratePerLower)} ${CURRENCIES[CURRENCY_ORDER[i - 1]].symbol} = 1 ${c.symbol}`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-5 rounded-lg p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <p className="text-[12px]" style={{ color: COLORS.label }}>
                  Рыночный курс
                </p>
                <Link href="/exchange" className="text-[12px]" style={{ color: COLORS.accent }}>
                  Торговать
                </Link>
              </div>
              <p className="mt-1 text-[15px]" style={{ color: "#F1C40F" }}>
                1 ∞ = ${tcPrice.toFixed(2)} USD
              </p>
              <p className="mt-1 text-[12px]" style={{ color: UP }}>
                Баланс TimeCoin ≈ ${usdFor(wallet.timecoin).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: CurrencyId
  onChange: (id: CurrencyId) => void
}) {
  const c = CURRENCIES[value]
  return (
    <label className="block">
      <span className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>
        {label}
      </span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px]" style={{ color: c.color }}>
          {c.symbol}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as CurrencyId)}
          className="w-full appearance-none rounded-lg py-2.5 pl-9 pr-8 text-[14px]"
          style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
        >
          {CURRENCY_ORDER.map((id) => (
            <option key={id} value={id}>
              {CURRENCIES[id].label}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}
