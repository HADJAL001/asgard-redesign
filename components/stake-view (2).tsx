"use client"

import { useMemo, useState } from "react"
import { Lock, Unlock, Percent, ShieldCheck, Infinity as InfinityIcon, Sparkles, Clock } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "./osgard-store"
import { COLORS, formatTokens } from "@/lib/economy"
import { STAKE_TERMS, MIN_STAKE, UP, DAY_MS, type StakeTerm } from "@/lib/tc-market"

const PURPLE = "#9B59B6"

function daysLeft(endTs: number): number {
  return Math.max(0, Math.ceil((endTs - Date.now()) / DAY_MS))
}

export function StakeView() {
  const { wallet, stakes, stakeTC, unstakeTC, tcPrice, stakedTC } = useOsgard()
  const [term, setTerm] = useState<StakeTerm>(STAKE_TERMS[1])
  const [amount, setAmount] = useState("")
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const amt = Number(amount) || 0
  const projected = useMemo(
    () => Math.round(amt * term.apr * (term.days / 365) * 100) / 100,
    [amt, term],
  )
  const total = amt + projected
  const canStake = amt >= MIN_STAKE && wallet.timecoin >= amt

  const active = stakes.filter((s) => s.status === "active")
  const totalStakedByUser = active.reduce((s, x) => s + x.amountTC, 0)

  function doStake() {
    const res = stakeTC(amt, term.days)
    setNotice({ ok: res.ok, text: res.message })
    if (res.ok) setAmount("")
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
            <Lock size={26} strokeWidth={1.75} style={{ color: PURPLE }} aria-hidden="true" />
            Стейкинг TimeCoin
          </h1>
          <p className="mt-1 text-[15px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Блокируйте ∞, получайте доход и снижайте комиссию маркета
          </p>
        </div>

        {/* Summary */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: `${formatTokens(totalStakedByUser)} ∞`, l: "Ваш стейк", Icon: Lock, c: PURPLE },
            { n: `${active.length}`, l: "Активных позиций", Icon: Clock, c: COLORS.accent },
            { n: `${formatTokens(stakedTC)} ∞`, l: "Застейкано в сети", Icon: ShieldCheck, c: COLORS.green },
            { n: `$${(totalStakedByUser * tcPrice).toFixed(2)}`, l: "Стоимость стейка", Icon: InfinityIcon, c: "#F1C40F" },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={18} strokeWidth={1.5} style={{ color: m.c }} aria-hidden="true" />
              <p className="mt-3 text-[22px] font-medium leading-none">{m.n}</p>
              <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{m.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Stake form */}
          <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              Новый стейк
            </h2>

            {/* Term selection */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {STAKE_TERMS.map((t) => {
                const activeTerm = term.days === t.days
                return (
                  <button
                    key={t.days}
                    type="button"
                    onClick={() => setTerm(t)}
                    aria-pressed={activeTerm}
                    className="rounded-xl p-4 text-left transition-colors"
                    style={{
                      backgroundColor: activeTerm ? "rgba(155,89,182,0.1)" : "#0A0A0F",
                      border: `1px solid ${activeTerm ? PURPLE : COLORS.border}`,
                    }}
                  >
                    <p className="text-[15px] font-medium">{t.label}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-[20px] font-semibold" style={{ color: UP }}>
                      <Percent size={15} strokeWidth={2} aria-hidden="true" />
                      {(t.apr * 100).toFixed(0)}
                      <span className="text-[12px] font-normal" style={{ color: COLORS.label }}>APR</span>
                    </p>
                    <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>{t.perk}</p>
                  </button>
                )
              })}
            </div>

            {/* Amount */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <label htmlFor="stake-amt" style={{ color: COLORS.label }}>Сумма (∞)</label>
                <button type="button" onClick={() => setAmount(String(wallet.timecoin))} className="text-[12px]" style={{ color: COLORS.accent }}>
                  Макс: {formatTokens(wallet.timecoin)} ∞
                </button>
              </div>
              <input
                id="stake-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setNotice(null) }}
                placeholder={`Минимум ${MIN_STAKE} ∞`}
                className="cal-input"
              />
            </div>

            {/* Projection */}
            <div className="mt-4 space-y-2 rounded-lg p-4 text-[13px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>Срок блокировки</span>
                <span>{term.days} дней</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>Прогноз дохода</span>
                <span style={{ color: UP }}>+{formatTokens(projected)} ∞</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>Комиссия маркета</span>
                <span style={{ color: PURPLE }}>{(term.marketFee * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span>К выплате в конце</span>
                <span className="text-[15px] font-medium" style={{ color: "#FFFFFF" }}>{formatTokens(total)} ∞</span>
              </div>
            </div>

            <button
              type="button"
              onClick={doStake}
              disabled={!canStake}
              className="mt-5 w-full rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: PURPLE, color: "#FFFFFF" }}
            >
              Застейкать {amt >= MIN_STAKE ? `${formatTokens(amt)} ∞` : ""}
            </button>

            {notice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: notice.ok ? COLORS.green : COLORS.red }}>
                {notice.text}
              </p>
            )}
          </section>

          {/* Benefits + active stakes */}
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
                Привилегии стейкинга
              </h2>
              <ul className="mt-4 space-y-3 text-[13px]">
                {[
                  { Icon: Percent, t: "Сниженная комиссия", d: "До 1% на маркетплейсе вместо 5%" },
                  { Icon: Sparkles, t: "Ранний доступ", d: "Первыми к новым дропам артефактов" },
                  { Icon: ShieldCheck, t: "∞-бейдж", d: "Эксклюзивный статус при стейке 180 дней" },
                ].map((b) => (
                  <li key={b.t} className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${PURPLE}` }}>
                      <b.Icon size={15} strokeWidth={1.75} style={{ color: PURPLE }} aria-hidden="true" />
                    </span>
                    <div>
                      <p>{b.t}</p>
                      <p className="text-[12px]" style={{ color: COLORS.label }}>{b.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
                Мои позиции
              </h2>
              {active.length === 0 ? (
                <p className="mt-4 text-[13px]" style={{ color: COLORS.label }}>
                  Нет активных стейков. Заблокируйте TimeCoin, чтобы начать зарабатывать.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {active.map((s) => {
                    const left = daysLeft(s.endTs)
                    const progress = Math.min(100, ((s.days * DAY_MS - (s.endTs - Date.now())) / (s.days * DAY_MS)) * 100)
                    return (
                      <li key={s.id} className="rounded-lg p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[15px] font-medium" style={{ color: PURPLE }}>
                            <InfinityIcon size={14} strokeWidth={1.75} aria-hidden="true" />
                            {formatTokens(s.amountTC)} ∞
                          </span>
                          <span className="text-[12px]" style={{ color: COLORS.label }}>
                            {(s.apr * 100).toFixed(0)}% APR · {s.days}д
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#14141E" }}>
                          <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: PURPLE }} />
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[12px]" style={{ color: COLORS.label }}>
                            {left > 0 ? `Осталось ${left} дн.` : "Срок завершён"}
                          </span>
                          <button
                            type="button"
                            onClick={() => unstakeTC(s.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                            style={{ border: `1px solid ${left > 0 ? COLORS.border : UP}`, color: left > 0 ? "rgba(255,255,255,0.7)" : UP }}
                          >
                            <Unlock size={13} strokeWidth={1.75} aria-hidden="true" />
                            {left > 0 ? "Досрочно" : "Забрать"}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
