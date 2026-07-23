"use client"

/* ================================================================
   WalletView — кошелёк OSGARD
   ----------------------------------------------------------------
   ШАГ 4 (view-компоненты): полностью переведён на реальные данные
   бэкенда через Zustand-стор useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - Подтягивает кошелёк (GET /wallet) и состояние рынка TimeCoin
     (GET /tc-market/state — для курса TC/USD) при монтировании.
   - Отображает 5 балансов: credits, shards, crystals, timecoin
     (иерархия CURRENCY_ORDER из lib/economy.tsx — это лишь UI-метаданные:
     иконки/цвета/labels, не моковые данные) + отдельно cash_usd (наличные).
   - Конвертер валют вызывает реальный эндпоинт POST /wallet/convert
     через convertCurrency(from, to, amount) из стора. Пользователь
     теперь вводит сумму СПИСАНИЯ (amount из "Из"), а не "хочу получить" —
     это соответствует контракту бэкенда. Предпросмотр суммы получения
     считается по приблизительным курсам к USD (RATE_TO_USD), совпадающим
     с backend/src/routes/wallet.routes.ts; итоговую сумму (после реальной
     комиссии 1%) возвращает сервер и отображается в уведомлении.
   - Никаких моков экономики/локального стейта кошелька не используется.
   - ШАГ i18n: все статичные тексты заменены на t('wallet.*') с
     интерполяцией динамических данных через useTranslation().
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Plus, Info, DollarSign, Loader2, ArrowDownToLine, ArrowUpFromLine, Send } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore, type CurrencyKey } from "@/lib/store/osgard-store"
import { COLORS, CURRENCIES, CURRENCY_ORDER, formatTokens } from "@/lib/economy"
import { UP } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"
import { apiClient } from "@/lib/api-client"
import { ExtraPackagePurchase } from "./ExtraPackagePurchase"

/* Приблизительные курсы к cash_usd — используются ТОЛЬКО для предпросмотра
   суммы конвертации на клиенте. Совпадают с RATE_TO_USD в
   backend/src/routes/wallet.routes.ts. Итоговую сумму и комиссию всегда
   определяет сервер. */
const RATE_TO_USD: Record<CurrencyKey, number> = {
  credits: 0.01,
  shards: 0.1,
  crystals: 1,
  timecoin: 12.4,
  cash_usd: 1,
}
const CONVERT_FEE_PREVIEW = 0.01 // 1% — совпадает с CONVERT_FEE на бэкенде

/* TimeCoin исключён из конвертера: его можно только купить/продать на бирже
   (POST /tc-market/buy, /sell) или получить продажей артефактов. Прямая
   конвертация TimeCoin ↔ другие валюты запрещена на бэкенде (400). */
const CONVERT_CURRENCIES: CurrencyKey[] = ["credits", "shards", "crystals", "cash_usd"]


const CURRENCY_SYMBOL: Record<CurrencyKey, string> = {

  credits: "⚡",
  shards: "♦",
  crystals: "💎",
  timecoin: "∞",
  cash_usd: "$",
}

function fmtAmount(id: CurrencyKey, n: number): string {
  if (id === "credits" || id === "shards") return formatTokens(Math.round(n))
  const rounded = Math.round(n * 1000) / 1000
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: id === "cash_usd" ? 2 : 3 })
}

export function WalletView() {
  const { t } = useTranslation()
  const {
    wallet, tcPrice,
    fetchWallet, fetchTcState, convertCurrency, convertToTc, convertFromTc,
    fetchTcBalance, tcReserveBalance, tcUserBalance, tcBalanceLoading,
    loading, error,
  } = useOsgardStore()

  /** Локализованные названия валют: cash_usd берётся из wallet.cash, остальные — из CURRENCIES (lib/economy.tsx). */
  const CURRENCY_LABEL: Record<CurrencyKey, string> = {
    credits: CURRENCIES.credits.label,
    shards: CURRENCIES.shards.label,
    crystals: CURRENCIES.crystals.label,
    timecoin: CURRENCIES.timecoin.label,
    cash_usd: t("wallet.cash"),
  }

  // — модалка "Вывести TC" —
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [solanaAddr, setSolanaAddr] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("osgard_solana_address") ?? ""
    return ""
  })
  const [withdrawNotice, setWithdrawNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [withdrawBusy, setWithdrawBusy] = useState(false)

  // — модалка "Пополнить из TC" —
  const [depositOpen, setDepositOpen] = useState(false)
  const [txSignature, setTxSignature] = useState("")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositNotice, setDepositNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [depositBusy, setDepositBusy] = useState(false)

  const [from, setFrom] = useState<CurrencyKey>("credits")
  const [to, setTo] = useState<CurrencyKey>("shards")
  // TimeCoin недоступен для конвертации — оба селектора всегда переключаются
  // только между credits / shards / crystals / cash_usd.

  const [amount, setAmount] = useState("")
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchWallet({ skipAuthRedirect: true })
    fetchTcState({ skipAuthRedirect: true })
    fetchTcBalance({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // amount = сколько списать из `from`
  const giveAmount = Number(amount) || 0
  const rate = from === to ? 0 : RATE_TO_USD[from] / RATE_TO_USD[to] // 1 `from` = rate `to`
  const grossReceive = giveAmount * rate
  const previewFee = grossReceive * CONVERT_FEE_PREVIEW
  const previewReceive = Math.max(0, grossReceive - previewFee)
  const affordable = wallet[from] >= giveAmount

  async function doConvert() {
    if (from === to) {
      setNotice({ ok: false, text: t("wallet.differentCurrencies") })
      return
    }
    const n = Number(amount)
    if (!n || n <= 0) {
      setNotice({ ok: false, text: t("wallet.enterAmount") })
      return
    }
    if (!affordable) {
      setNotice({ ok: false, text: t("wallet.insufficientFunds", { currency: CURRENCY_LABEL[from].toLowerCase() }) })
      return
    }
    setSubmitting(true)
    try {
      const res = await convertCurrency(from, to, n)
      if (res.success && res.conversion) {
        setNotice({
          ok: true,
          text: t("wallet.exchangeDone", {
            sent: `${fmtAmount(from, res.conversion.amountSent)} ${CURRENCY_SYMBOL[from]}`,
            received: `${fmtAmount(to, res.conversion.amountReceived)} ${CURRENCY_SYMBOL[to]}`,
          }),
        })
        setAmount("")
        fetchTcBalance({ skipAuthRedirect: true })
      } else {
        setNotice({ ok: false, text: res.error || t("wallet.exchangeFailed") })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function doWithdraw() {
    const n = Number(withdrawAmount)
    if (!n || n <= 0) { setWithdrawNotice({ ok: false, text: "Введите корректную сумму" }); return }
    if (!solanaAddr.trim()) { setWithdrawNotice({ ok: false, text: "Введите Solana-адрес" }); return }
    localStorage.setItem("osgard_solana_address", solanaAddr.trim())
    setWithdrawBusy(true)
    try {
      // 1. Получаем актуальный nonce непосредственно перед отправкой.
      //    Сервер отклонит запрос, если nonce не совпадёт (защита от replay-атак).
      const nonceRes = await apiClient.get<{ nonce: number }>("/api/tc/nonce")
      const nonce: number = nonceRes.nonce

      const res = await convertToTc(n, solanaAddr.trim(), nonce)
      if (res.success) {
        setWithdrawNotice({ ok: true, text: res.txId ? `Отправлено. tx: ${res.txId.slice(0, 12)}…` : "Запрос на вывод отправлен" })
        setWithdrawAmount("")
      } else {
        setWithdrawNotice({ ok: false, text: res.error ?? "Ошибка вывода" })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка сети"
      setWithdrawNotice({ ok: false, text: msg })
    } finally {
      setWithdrawBusy(false)
    }
  }

  async function doDeposit() {
    const n = Number(depositAmount)
    if (!n || n <= 0) { setDepositNotice({ ok: false, text: "Введите сумму TC" }); return }
    if (!txSignature.trim()) { setDepositNotice({ ok: false, text: "Введите txSignature" }); return }
    setDepositBusy(true)
    try {
      const res = await convertFromTc(txSignature.trim(), n)
      if (res.success) {
        setDepositNotice({ ok: true, text: "TC успешно зачислены в ∞" })
        setTxSignature("")
        setDepositAmount("")
        fetchWallet({ skipAuthRedirect: true })
      } else {
        setDepositNotice({ ok: false, text: res.error ?? "Ошибка подтверждения" })
      }
    } catch {
      setDepositNotice({ ok: false, text: "Ошибка сети" })
    } finally {
      setDepositBusy(false)
    }
  }

  const usdForTC = wallet.timecoin * tcPrice.price

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("wallet.title")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("wallet.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Link
              href="/transfer"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
            >
              <Send size={16} strokeWidth={2} />
              Отправить TC
            </Link>
            <button
              type="button"
              onClick={() => { setWithdrawNotice(null); setWithdrawOpen(true) }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
            >
              <ArrowDownToLine size={16} strokeWidth={2} />
              Вывести TC
            </button>
            <button
              type="button"
              onClick={() => { setDepositNotice(null); setDepositOpen(true) }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
            >
              <ArrowUpFromLine size={16} strokeWidth={2} />
              Пополнить из TC
            </button>
            <Link
              href="/buy-tc"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              <Plus size={16} strokeWidth={2} />
              {t("wallet.topUpTimeCoin")}
            </Link>
          </div>
        </div>

        {/* TC балансы (резерв и пользователь) */}
        <div className="mt-8">
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: COLORS.card, border: "1px solid rgba(241,196,15,0.4)", maxWidth: 420 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[18px]" style={{ color: "#F1C40F" }}>∞</span>
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#F1C40F" }}>
                TimeCoin · Solana
              </p>
              {tcBalanceLoading && <Loader2 size={14} className="animate-spin ml-1" style={{ color: "#F1C40F" }} />}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] mb-1" style={{ color: COLORS.label }}>
                  Резерв
                </p>
                <p className="text-[20px] font-medium leading-none">
                  {tcReserveBalance !== null
                    ? `${tcReserveBalance.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} TC`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] mb-1" style={{ color: COLORS.label }}>
                  Твой баланс
                </p>
                <p className="text-[20px] font-medium leading-none">
                  {tcUserBalance !== null
                    ? `${tcUserBalance.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} TC`
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Наличные (cash_usd) */}
        <div className="mt-8">
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, maxWidth: 280 }}
          >
            <div className="flex items-center justify-between">
              <DollarSign size={20} strokeWidth={1.5} style={{ color: UP }} aria-hidden="true" />
              <span className="text-[18px]" style={{ color: UP }}>$</span>
            </div>
            <p className="mt-4 text-[26px] font-medium leading-none">
              {wallet.cash_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-[13px]">{t("wallet.cash")}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em]" style={{ color: COLORS.label }}>
              {t("wallet.cashSub")}
            </p>
          </div>
        </div>

        {/* Currency balances */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    ≈ ${usdForTC.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </p>
                )}
                <p className="mt-2 text-[13px]">{c.label}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em]" style={{ color: COLORS.label }}>
                  {t("wallet.level", { tier: c.tier, rarity: c.rarity })}
                </p>
                {id === "timecoin" && (
                  <p
                    className="mt-3 rounded-md px-2.5 py-2 text-[11px] leading-snug"
                    style={{ backgroundColor: "rgba(241,196,15,0.08)", border: "1px solid rgba(241,196,15,0.3)", color: "#F1C40F" }}
                  >
                    {t("wallet.timecoinNoConvert")}
                  </p>
                )}

              </div>
            )
          })}
        </div>

        {/* Докупка пакетов AI-провайдеров (Pro/Supreme/Duo/Elite) */}
        <div className="mt-8">
          <ExtraPackagePurchase />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Exchange */}
          <section
            className="rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              {t("wallet.converterTitle")}
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: COLORS.label }}>
              {t("wallet.converterSub", { fee: Math.round(CONVERT_FEE_PREVIEW * 100) })}
            </p>

            {/* From / To selectors */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <CurrencySelect
                label={t("wallet.from")}
                value={from}
                labels={CURRENCY_LABEL}
                onChange={(id) => {
                  setFrom(id)
                  if (id === to) setTo(CONVERT_CURRENCIES.find((c) => c !== id)!)
                  setNotice(null)
                }}
              />
              <button
                type="button"
                aria-label={t("wallet.swap")}
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
                label={t("wallet.to")}
                value={to}
                labels={CURRENCY_LABEL}
                onChange={(id) => {
                  setTo(id)
                  if (id === from) setFrom(CONVERT_CURRENCIES.find((c) => c !== id)!)
                  setNotice(null)
                }}
              />
            </div>

            <div className="mt-5">
              <label htmlFor="ex-amt" className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>
                {t("wallet.give", { currency: CURRENCY_LABEL[from] })}
              </label>
              <input
                id="ex-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                className="cal-input"
              />
              <p className="mt-1.5 text-[12px]" style={{ color: COLORS.label }}>
                {t("wallet.available", { amount: `${fmtAmount(from, wallet[from])} ${CURRENCY_SYMBOL[from]}` })}
              </p>
            </div>

            {/* Quote breakdown */}
            <div className="mt-4 space-y-2 rounded-lg p-4 text-[13px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5" style={{ color: COLORS.label }}>
                  <Info size={13} strokeWidth={1.5} /> {t("wallet.rateApprox")}
                </span>
                <span>1 {CURRENCY_SYMBOL[from]} ≈ {rate.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} {CURRENCY_SYMBOL[to]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("wallet.fee", { fee: Math.round(CONVERT_FEE_PREVIEW * 100) })}</span>
                <span>{fmtAmount(to, previewFee)} {CURRENCY_SYMBOL[to]}</span>
              </div>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span>{t("wallet.youReceive")}</span>
                <span style={{ color: affordable ? "#FFFFFF" : COLORS.red }}>
                  {fmtAmount(to, previewReceive)} {CURRENCY_SYMBOL[to]}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={doConvert}
              disabled={!affordable || giveAmount <= 0 || from === to || submitting || loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {(submitting || loading) && <Loader2 size={16} className="animate-spin" />}
              {t("wallet.exchangeBtn")}
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

          {/* Hierarchy reference */}
          <aside
            className="rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              {t("wallet.hierarchyTitle")}
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
                        {i === 0 ? t("wallet.baseCurrency") : `${formatTokens(c.ratePerLower)} ${CURRENCIES[CURRENCY_ORDER[i - 1]].symbol} = 1 ${c.symbol}`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-5 rounded-lg p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <p className="text-[12px]" style={{ color: COLORS.label }}>
                  {t("wallet.marketRate")}
                </p>
                <Link href="/exchange" className="text-[12px]" style={{ color: COLORS.accent }}>
                  {t("wallet.trade")}
                </Link>
              </div>
              <p className="mt-1 text-[15px]" style={{ color: "#F1C40F" }}>
                1 ∞ = ${tcPrice.price.toFixed(2)} USD
              </p>
              <p className="mt-1 text-[12px]" style={{ color: UP }}>
                {t("wallet.balanceApprox", { amount: `$${usdForTC.toLocaleString("en-US", { maximumFractionDigits: 0 })}` })}
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* ── Модалка «Вывести TC» ──────────────────────────────────── */}
      {withdrawOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setWithdrawOpen(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                <ArrowDownToLine size={18} strokeWidth={1.75} style={{ color: "#F1C40F" }} />
                Вывести TC
              </h2>
              <button
                type="button"
                onClick={() => setWithdrawOpen(false)}
                className="flex size-8 items-center justify-center rounded-lg text-[18px] transition-colors hover:bg-white/10"
                style={{ color: COLORS.label }}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                  Сумма ∞
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                  style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                  Solana-адрес
                </label>
                <input
                  type="text"
                  value={solanaAddr}
                  onChange={(e) => setSolanaAddr(e.target.value)}
                  placeholder="Адрес кошелька Solana"
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                  style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
                />
              </div>
            </div>

            {withdrawNotice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: withdrawNotice.ok ? COLORS.green : COLORS.red }}>
                {withdrawNotice.text}
              </p>
            )}

            <button
              type="button"
              onClick={doWithdraw}
              disabled={withdrawBusy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {withdrawBusy && <Loader2 size={16} className="animate-spin" />}
              Отправить
            </button>
          </div>
        </div>
      )}

      {/* ── Модалка «Пополнить из TC» ────────────────────────────── */}
      {depositOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDepositOpen(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                <ArrowUpFromLine size={18} strokeWidth={1.75} style={{ color: "#F1C40F" }} />
                Пополнить из TC
              </h2>
              <button
                type="button"
                onClick={() => setDepositOpen(false)}
                className="flex size-8 items-center justify-center rounded-lg text-[18px] transition-colors hover:bg-white/10"
                style={{ color: COLORS.label }}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                  Сумма TC
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                  style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                  Transaction Signature
                </label>
                <input
                  type="text"
                  value={txSignature}
                  onChange={(e) => setTxSignature(e.target.value)}
                  placeholder="Вставьте txSignature транзакции"
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                  style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
                />
              </div>
            </div>

            {depositNotice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: depositNotice.ok ? COLORS.green : COLORS.red }}>
                {depositNotice.text}
              </p>
            )}

            <button
              type="button"
              onClick={doDeposit}
              disabled={depositBusy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {depositBusy && <Loader2 size={16} className="animate-spin" />}
              Подтвердить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CurrencySelect({
  label,
  value,
  labels,
  onChange,
}: {
  label: string
  value: CurrencyKey
  labels: Record<CurrencyKey, string>
  onChange: (id: CurrencyKey) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>
        {label}
      </span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px]" style={{ color: "#FFFFFF" }}>
          {CURRENCY_SYMBOL[value]}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as CurrencyKey)}
          className="w-full appearance-none rounded-lg py-2.5 pl-9 pr-8 text-[14px]"
          style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
        >
          {CONVERT_CURRENCIES.map((id) => (
            <option key={id} value={id}>
              {labels[id]}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}
