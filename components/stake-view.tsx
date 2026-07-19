"use client"

/* ================================================================
   StakeView — стейкинг TimeCoin OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchStakes() (GET /stakes) и
     fetchWallet() (GET /wallet).
   - Отображает список стейков пользователя из state.stakes.
   - Форма стейкинга: выбор срока (STAKE_TERMS из lib/tc-market.ts) +
     ввод количества TimeCoin → stakeTC(amount, days) (POST /stakes).
   - Кнопка "Анстейкать" на каждой карточке стейка → unstakeTC(stakeId)
     (POST /stakes/:id/unstake).
   - APR, награды, сроки — берутся из данных бэкенда (stake.apr,
     stake.startTs/endTs), прогноз дохода на форме — локальный расчёт
     по STAKE_TERMS (константы, не моки).
   - Форматирование сумм — через fmtTC()/fmtUSD() из lib/tc-market.ts.
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import { Lock, Unlock, Percent, ShieldCheck, Infinity as InfinityIcon, Sparkles, Clock, Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS, formatTokens } from "@/lib/economy"
import { STAKE_TERMS, MIN_STAKE, UP, DAY_MS, fmtTC, fmtUSD, type StakeTerm } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"


const PURPLE = "#9B59B6"

function daysLeft(endTs: number): number {
  return Math.max(0, Math.ceil((endTs - Date.now()) / DAY_MS))
}

export function StakeView() {
  const { t } = useTranslation()
  const { wallet, stakes, fetchStakes, fetchWallet, stakeTC, unstakeTC, tcPrice, loading, error } = useOsgardStore()


  const [term, setTerm] = useState<StakeTerm>(STAKE_TERMS[1])
  const [amount, setAmount] = useState("")
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [unstakingId, setUnstakingId] = useState<number | string | null>(null)

  useEffect(() => {
    fetchStakes()
    fetchWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const amt = Number(amount) || 0
  const projected = useMemo(
    () => Math.round(amt * term.apr * (term.days / 365) * 100) / 100,
    [amt, term],
  )
  const total = amt + projected
  const canStake = amt >= MIN_STAKE && wallet.timecoin >= amt

  const active = stakes.filter((s) => s.status === "active")
  const totalStakedByUser = active.reduce((s, x) => s + x.amountTC, 0)

  async function doStake() {
    if (!canStake) return
    setSubmitting(true)
    setNotice(null)
    try {
      const res = await stakeTC(amt, term.days)
      if (res.success) {
        setNotice({ ok: true, text: t("stake.stakeDone", { amount: fmtTC(amt), days: term.days }) })
        setAmount("")
      } else {
        setNotice({ ok: false, text: res.error || t("stake.stakeFailed") })
      }

    } finally {
      setSubmitting(false)
    }
  }

  async function doUnstake(stakeId: number | string) {
    setUnstakingId(stakeId)
    setNotice(null)
    try {
      const res = await unstakeTC(stakeId)
      if (res.success) {
        setNotice({
          ok: true,
          text: t("stake.unstakeDone", { reward: fmtTC(res.reward ?? 0), total: fmtTC(res.totalReturn ?? 0) }),
        })
      } else {
        setNotice({ ok: false, text: res.error || t("stake.unstakeFailed") })
      }

    } finally {
      setUnstakingId(null)
    }
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
            <Lock size={26} strokeWidth={1.75} style={{ color: PURPLE }} aria-hidden="true" />
            {t("stake.title")}
          </h1>
          <p className="mt-1 text-[15px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("stake.subtitle")}
          </p>

        </div>

        {/* Summary */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: fmtTC(totalStakedByUser), l: t("stake.yourStake"), Icon: Lock, c: PURPLE },
            { n: `${active.length}`, l: t("stake.activePositions"), Icon: Clock, c: COLORS.accent },
            { n: fmtTC(tcPrice.staked), l: t("stake.networkStaked"), Icon: ShieldCheck, c: COLORS.green },
            { n: fmtUSD(totalStakedByUser * tcPrice.price), l: t("stake.stakeValue"), Icon: InfinityIcon, c: "#F1C40F" },
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
              {t("stake.newStake")}
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
                <label htmlFor="stake-amt" style={{ color: COLORS.label }}>{t("stake.amount")}</label>
                <button
                  type="button"
                  onClick={() => setAmount(String(wallet.timecoin))}
                  className="text-[12px]"
                  style={{ color: COLORS.accent }}
                >
                  {t("stake.max", { amount: fmtTC(wallet.timecoin) })}
                </button>
              </div>
              <input
                id="stake-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setNotice(null) }}
                placeholder={t("stake.minAmount", { amount: MIN_STAKE })}
                className="cal-input"
              />

            </div>

            {/* Projection */}
            <div className="mt-4 space-y-2 rounded-lg p-4 text-[13px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("stake.lockPeriod")}</span>
                <span>{t("stake.days", { count: term.days })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("stake.incomeForecast")}</span>
                <span style={{ color: UP }}>+{fmtTC(projected)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("stake.marketFee")}</span>
                <span style={{ color: PURPLE }}>{(term.marketFee * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span>{t("stake.payoutAtEnd")}</span>
                <span className="text-[15px] font-medium" style={{ color: "#FFFFFF" }}>{fmtTC(total)}</span>
              </div>

            </div>

            <button
              type="button"
              onClick={doStake}
              disabled={!canStake || submitting || loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: PURPLE, color: "#FFFFFF" }}
            >
              {(submitting || loading) && <Loader2 size={16} className="animate-spin" />}
              {t("stake.stakeBtn", { amount: amt >= MIN_STAKE ? fmtTC(amt) : "" })}
            </button>


            {notice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: notice.ok ? COLORS.green : COLORS.red }}>
                {notice.text}
              </p>
            )}
            {error && !notice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: COLORS.red }}>
                {error}
              </p>
            )}
          </section>

          {/* Benefits + active stakes */}
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
                {t("stake.benefitsTitle")}
              </h2>
              <ul className="mt-4 space-y-3 text-[13px]">
                {[
                  { Icon: Percent, t: t("stake.benefitReducedFee"), d: t("stake.benefitReducedFeeDesc") },
                  { Icon: Sparkles, t: t("stake.benefitEarlyAccess"), d: t("stake.benefitEarlyAccessDesc") },
                  { Icon: ShieldCheck, t: t("stake.benefitBadge"), d: t("stake.benefitBadgeDesc") },
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
                {t("stake.myPositions")}
              </h2>
              {active.length === 0 ? (
                <p className="mt-4 text-[13px]" style={{ color: COLORS.label }}>
                  {t("stake.noActiveStakes")}
                </p>

              ) : (
                <ul className="mt-4 space-y-3">
                  {active.map((s) => {
                    const left = daysLeft(s.endTs)
                    const totalMs = Math.max(1, s.endTs - s.startTs)
                    const progress = Math.min(100, Math.max(0, ((totalMs - (s.endTs - Date.now())) / totalMs) * 100))
                    const isUnstaking = unstakingId === s.id
                    return (
                      <li key={s.id} className="rounded-lg p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[15px] font-medium" style={{ color: PURPLE }}>
                            <InfinityIcon size={14} strokeWidth={1.75} aria-hidden="true" />
                            {fmtTC(s.amountTC)}
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
                            {left > 0 ? t("stake.daysLeft", { count: left }) : t("stake.termEnded")}
                          </span>
                          <button
                            type="button"
                            onClick={() => doUnstake(s.id)}
                            disabled={isUnstaking || loading}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ border: `1px solid ${left > 0 ? COLORS.border : UP}`, color: left > 0 ? "rgba(255,255,255,0.7)" : UP }}
                          >
                            {isUnstaking ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Unlock size={13} strokeWidth={1.75} aria-hidden="true" />
                            )}
                            {left > 0 ? t("stake.earlyUnstake") : t("stake.claim")}
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
