"use client"

/* ================================================================
   TransactionsView — история транзакций OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchTransactions() (GET /transactions).
   - Отображает историю всех транзакций пользователя (state.transactions):
       - Тип транзакции (покупка / продажа / стейкинг / анстейк /
         конвертация / прочее)
       - Сумма + валюта
       - Статус (выполнено / в обработке / ошибка)
       - Дата/время
   - Фильтры по типу транзакции (кнопки-чипсы над таблицей) — чисто
     клиентская фильтрация уже загруженного списка, без доп. запросов.
   - Форматирование сумм — через fmtUSD()/fmtTC() из lib/tc-market.ts
     (для cash_usd и timecoin), для остальных валют — locale-число.
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Lock,
  Unlock,
  Repeat,
  Receipt,
  Loader2,
  History,
  Send,
} from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { fmtUSD, fmtTC, UP, DOWN } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

/* ---- Типы транзакций (соответствуют полю `type` в таблице transactions) ---- */
type TxType = "buy" | "sell" | "stake" | "unstake" | "convert" | "transfer" | "other"

/** Приводит произвольную строку типа из БД к одному из известных TxType. */
function normalizeType(raw: string): TxType {
  const t = raw.toLowerCase()
  if (t.includes("transfer")) return "transfer"
  if (t.includes("unstake")) return "unstake"
  if (t.includes("stake")) return "stake"
  if (t.includes("convert")) return "convert"
  if (t.includes("sell")) return "sell"
  if (t.includes("buy")) return "buy"
  return "other"
}

type StatusKey = "done" | "pending" | "failed"

function normalizeStatus(raw: string): StatusKey {
  const s = raw.toLowerCase()
  if (s.includes("pend") || s.includes("process") || s.includes("обраб")) return "pending"
  if (s.includes("fail") || s.includes("error") || s.includes("cancel")) return "failed"
  return "done"
}

const CURRENCY_SYMBOL: Record<string, string> = {
  credits: "⚡",
  shards: "♦",
  crystals: "💎",
  timecoin: "∞",
  cash_usd: "$",
}

function fmtAmount(currency: string, amount: number): string {
  if (currency === "cash_usd") return fmtUSD(amount)
  if (currency === "timecoin") return fmtTC(amount)
  const symbol = CURRENCY_SYMBOL[currency] || ""
  return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${symbol}`.trim()
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function TransactionsView() {
  const { t } = useTranslation()
  const { transactions, fetchTransactions, loading, error } = useOsgardStore()

  const TYPE_META: Record<TxType, { label: string; Icon: typeof ArrowDownCircle; color: string }> = {
    buy: { label: t("transactions.typeBuy"), Icon: ArrowDownCircle, color: UP },
    sell: { label: t("transactions.typeSell"), Icon: ArrowUpCircle, color: DOWN },
    stake: { label: t("transactions.typeStakeTx"), Icon: Lock, color: "#9B59B6" },
    unstake: { label: t("transactions.typeUnstake"), Icon: Unlock, color: "#9B59B6" },
    convert: { label: t("transactions.typeConvert"), Icon: Repeat, color: COLORS.accent },
    transfer: { label: t("transactions.typeTransfer"), Icon: Send, color: "#F1C40F" },
    other: { label: t("transactions.typeOther"), Icon: Receipt, color: COLORS.label },
  }

  const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
    done: { label: t("transactions.statusDone"), color: UP },
    pending: { label: t("transactions.statusPending"), color: "#F1C40F" },
    failed: { label: t("transactions.statusFailed"), color: DOWN },
  }

  const FILTERS: { id: TxType | "all"; label: string }[] = [
    { id: "all", label: t("transactions.filterAll") },
    { id: "buy", label: t("transactions.filterBuy") },
    { id: "sell", label: t("transactions.filterSell") },
    { id: "stake", label: t("transactions.filterStake") },
    { id: "unstake", label: t("transactions.filterUnstake") },
    { id: "convert", label: t("transactions.filterConvert") },
    { id: "transfer", label: t("transactions.filterTransfer") },
  ]

  const [filter, setFilter] = useState<TxType | "all">("all")

  useEffect(() => {
    fetchTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const normalized = useMemo(
    () =>
      transactions.map((tx) => ({
        ...tx,
        typeKey: normalizeType(tx.type),
        statusKey: normalizeStatus(tx.status),
      })),
    [transactions],
  )

  const filtered = useMemo(() => {
    if (filter === "all") return normalized
    return normalized.filter((tx) => tx.typeKey === filter)
  }, [normalized, filter])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: normalized.length }
    for (const tx of normalized) {
      map[tx.typeKey] = (map[tx.typeKey] || 0) + 1
    }
    return map
  }, [normalized])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[1080px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("transactions.title")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("transactions.subtitle")}
            </p>
          </div>
        </div>

        {/* Фильтры по типу транзакции */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id
            const count = counts[f.id] ?? 0
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                  color: active ? COLORS.accent : "rgba(255,255,255,0.6)",
                  backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                }}
              >
                {f.label}
                <span
                  className="rounded-full px-1.5 text-[11px]"
                  style={{
                    backgroundColor: active ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.06)",
                    color: active ? COLORS.accent : COLORS.label,
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Loading */}
        {loading && normalized.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
            <p className="text-[14px]" style={{ color: COLORS.label }}>
              {t("transactions.loading")}
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="mt-6 text-center text-[13px]" role="status" style={{ color: COLORS.red }}>
            {error}
          </p>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && !error && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <History size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
            <p className="text-[15px]" style={{ color: COLORS.label }}>
              {normalized.length === 0 ? t("transactions.noTransactions") : t("transactions.noFiltered")}
            </p>
          </div>
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div
            className="mt-6 overflow-hidden rounded-xl"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <div
              className="hidden grid-cols-[1.4fr_2fr_1.2fr_1fr_1.2fr] gap-4 px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.14em] sm:grid"
              style={{ color: COLORS.label, borderBottom: `1px solid ${COLORS.border}` }}
            >
              <span>{t("transactions.colType")}</span>
              <span>{t("transactions.colDescription")}</span>
              <span>{t("transactions.colAmount")}</span>
              <span>{t("transactions.colStatus")}</span>
              <span className="text-right">{t("transactions.colDate")}</span>
            </div>

            {filtered.map((tx) => {
              const meta = TYPE_META[tx.typeKey]
              const status = STATUS_META[tx.statusKey]
              const Icon = meta.Icon
              return (
                <div
                  key={tx.id}
                  className="grid grid-cols-1 gap-2 px-6 py-4 text-[14px] sm:grid-cols-[1.4fr_2fr_1.2fr_1fr_1.2fr] sm:items-center sm:gap-4"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} strokeWidth={1.75} style={{ color: meta.color }} />
                    <span style={{ color: meta.color }}>{meta.label}</span>
                  </div>

                  <span className="truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {tx.item || tx.counterparty || "—"}
                  </span>

                  <span style={{ color: COLORS.text }}>{fmtAmount(tx.currency, tx.amount)}</span>

                  <span className="inline-flex w-fit items-center gap-1.5">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    <span style={{ color: status.color }}>{status.label}</span>
                  </span>

                  <span className="text-left sm:text-right" style={{ color: COLORS.label }}>
                    {fmtDateTime(tx.createdAt)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
