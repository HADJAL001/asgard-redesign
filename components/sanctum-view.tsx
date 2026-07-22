"use client"

import { useMemo } from "react"
import Link from "next/link"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Navbar } from "./navbar"
import { useOsgard } from "@/lib/store/osgard-store"
import {
  ARTIFACTS,
  RARITY,
  ARTIFACT_TYPES,
  CURRENCIES,
  CURRENCY_ORDER,
  INFINITY_BADGES,
  EMISSION_SERIES,
  hasEliteAccess,
  creditsTo,
  formatTokens,
  formatCurrencyAmount,
  formatTC,
} from "@/lib/economy"
import { Infinity as InfinityIcon, Lock, ShieldCheck, Sparkles, Wallet as WalletIcon } from "lucide-react"

const CARD = "#101018"
const BORDER = "#2A2A3E"
const LABEL = "#8A8AA0"
const GOLD = "#F1C40F"
const SERIF = "var(--font-playfair)"

export function SanctumView() {
  const elite = hasEliteAccess()
  const { wallet, netWorthTC } = useOsgard()

  // The vault holds only mythic (∞) artifacts
  const vault = useMemo(() => ARTIFACTS.filter((a) => a.rarity === "mythic"), [])

  // Capital-over-time (net worth in TC), derived from emission trend + current worth
  const capitalSeries = useMemo(() => {
    const factors = [0.42, 0.55, 0.68, 0.79, 0.9, 1]
    return EMISSION_SERIES.map((row, i) => ({
      month: row.month,
      capital: Math.round(netWorthTC * factors[i]),
    }))
  }, [netWorthTC])

  if (!elite) {
    return (
      <div
        className="min-h-screen font-sans"
        style={{ background: "radial-gradient(circle at 50% 20%, #1A1408 0%, #0A0A0F 60%)", color: "#FFFFFF" }}
      >
        <Navbar />
        <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
          <div
            className="flex size-16 items-center justify-center rounded-full"
            style={{ border: `1px solid ${GOLD}`, color: GOLD }}
          >
            <Lock size={26} strokeWidth={1.25} aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-[34px] font-medium" style={{ fontFamily: SERIF, color: GOLD }}>
            Святилище
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            Доступ открыт лишь владельцам ∞-знака — тем, чей артефакт вошёл в Зал славы.
            Продайте артефакт дороже 20 000 ∞, чтобы получить приглашение.
          </p>
          <Link
            href="/hall-of-fame"
            className="mt-8 rounded-full px-6 py-3 text-[14px] font-medium"
            style={{ backgroundColor: GOLD, color: "#0A0A0F" }}
          >
            Смотреть Зал славы
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(circle at 50% 0%, #1A1408 0%, #0A0A0F 55%)", color: "#FFFFFF" }}
    >
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Elite header */}
        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]"
            style={{ border: `1px solid ${GOLD}`, color: GOLD }}
          >
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            Элитный доступ · ∞-знак
          </span>
          <h1 className="mt-5 text-[44px] leading-tight" style={{ fontFamily: SERIF, color: GOLD }}>
            Святилище
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            Хранилище мифических артефактов OSGARD
          </p>
        </div>

        {/* Owner's infinity badges */}
        <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-3">
          {INFINITY_BADGES.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px]"
              style={{ border: `1px solid ${GOLD}55`, color: "#FFFFFF", backgroundColor: "rgba(241,196,15,0.04)" }}
            >
              <InfinityIcon size={14} strokeWidth={1.75} style={{ color: GOLD }} aria-hidden="true" />
              {b.label}
              <span style={{ color: LABEL }}>· {b.date}</span>
            </span>
          ))}
        </div>

        {/* Elite capital: 4-currency balances + net worth chart */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${GOLD}33` }}>
            <div className="flex items-center gap-2">
              <WalletIcon size={16} strokeWidth={1.75} style={{ color: GOLD }} aria-hidden="true" />
              <h2 className="text-[13px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Капитал святилища
              </h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {CURRENCY_ORDER.map((id) => {
                const c = CURRENCIES[id]
                return (
                  <div
                    key={id}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: "#0A0A0F", border: `1px solid ${c.elite ? `${GOLD}55` : BORDER}` }}
                  >
                    <div className="flex items-center gap-1.5" style={{ color: c.color }}>
                      <c.Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span className="text-[13px]">{c.symbol}</span>
                    </div>
                    <p className="mt-2 text-[18px] font-medium leading-none" style={{ color: "#FFFFFF" }}>
                      {formatCurrencyAmount(id, wallet[id])}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: LABEL }}>
                      {c.label}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: "rgba(241,196,15,0.06)", border: `1px solid ${GOLD}44` }}>
              <span className="text-[13px]" style={{ color: LABEL }}>
                Чистая стоимость
              </span>
              <span className="inline-flex items-center gap-1 text-[18px] font-medium" style={{ color: GOLD }}>
                <InfinityIcon size={15} strokeWidth={1.75} aria-hidden="true" />
                {formatCurrencyAmount("timecoin", netWorthTC)}
              </span>
            </div>
          </section>

          <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${GOLD}33` }}>
            <h2 className="text-[13px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>
              Рост капитала · TimeCoin
            </h2>
            <div className="mt-4 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={capitalSeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="capGold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fill: LABEL, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: LABEL, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}`, borderRadius: 8, color: "#FFFFFF" }}
                    labelStyle={{ color: LABEL }}
                    formatter={(v) => [`${formatTokens(Number(v))} ∞`, "Капитал"]}
                  />
                  <Area type="monotone" dataKey="capital" stroke={GOLD} strokeWidth={2} fill="url(#capGold)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Mythic vault */}
        <h2 className="mt-12 text-[14px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>
          Мифическое хранилище
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vault.length === 0 && (
            <p className="text-[14px]" style={{ color: LABEL }}>
              В вашем хранилище пока нет мифических артефактов. Достигните ∞ через синтез или эволюцию.
            </p>
          )}
          {vault.map((a) => (
            <Link
              key={a.id}
              href={`/artifact/${a.id}`}
              className="group flex flex-col items-center rounded-2xl p-6 text-center transition-transform hover:-translate-y-1"
              style={{
                backgroundColor: CARD,
                border: `1px solid ${RARITY.mythic.color}66`,
                boxShadow: `0 0 32px ${RARITY.mythic.color}22`,
              }}
            >
              <div
                className="flex size-20 items-center justify-center rounded-2xl text-[40px]"
                style={{ border: `2px solid ${RARITY.mythic.color}`, color: RARITY.mythic.color }}
              >
                {RARITY.mythic.symbol}
              </div>
              <p className="mt-4 text-[16px] font-medium text-balance">{a.name}</p>
              <p className="text-[12px]" style={{ color: LABEL }}>
                {ARTIFACT_TYPES[a.type].label} · {RARITY.mythic.label}
              </p>
              <p className="mt-3 inline-flex items-center gap-1 text-[16px] font-medium" style={{ color: GOLD }}>
                <InfinityIcon size={14} strokeWidth={1.75} aria-hidden="true" />
                {formatCurrencyAmount("timecoin", creditsTo(a.price, "timecoin"))}
              </p>
            </Link>
          ))}
        </div>

        {/* Elite privileges */}
        <div
          className="mt-12 rounded-2xl p-8"
          style={{ backgroundColor: CARD, border: `1px solid ${GOLD}33` }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={1.75} style={{ color: GOLD }} aria-hidden="true" />
            <h2 className="text-[18px] font-medium" style={{ fontFamily: SERIF }}>
              Привилегии святилища
            </h2>
          </div>
          <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { t: "Ранний доступ к дропам", d: "Мифические артефакты появляются здесь за 24 часа до маркета" },
              { t: "Нулевая комиссия", d: "Сделки внутри святилища проходят без 5% платформенного сбора" },
              { t: "∞-знак в профиле", d: "Вечный статус легенды OSGARD во всех разделах платформы" },
              { t: "Голос в совете", d: "Влияние на эмиссию TimeCoin и параметры экономики" },
            ].map((p) => (
              <li key={p.t} className="rounded-xl p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}>
                <p className="text-[14px] font-medium" style={{ color: GOLD }}>
                  {p.t}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: LABEL }}>
                  {p.d}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-[13px]" style={{ color: LABEL }}>
            Совокупная ценность хранилища:{" "}
            <span style={{ color: GOLD }}>
              {formatTC(vault.reduce((s, a) => s + creditsTo(a.price, "timecoin"), 0))}
            </span>
          </p>
        </div>
      </main>
    </div>
  )
}
