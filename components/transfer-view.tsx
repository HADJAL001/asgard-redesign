"use client"

/* ================================================================
   TransferView — перевод TC (∞) другому пользователю OSGARD
   ----------------------------------------------------------------
   Форма (email получателя + сумма + комментарий) → модалка
   подтверждения (пароль + опционально 2FA) → POST /wallet/transfer
   через transferTC() из useOsgardStore(). Стилистика идентична
   withdraw/deposit-модалкам в wallet-view.tsx.
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Send, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"

function fmtTc(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
}

export function TransferView() {
  const { wallet, fetchWallet, lookupRecipient, transferTC, loading } = useOsgardStore()

  useEffect(() => {
    fetchWallet({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [email, setEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [comment, setComment] = useState("")
  const [formNotice, setFormNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // — предпросмотр получателя (live-поиск по email) —
  const [recipientCheck, setRecipientCheck] = useState<{
    checking: boolean
    found: boolean | null
    displayName?: string
    error?: string
  }>({ checking: false, found: null })

  useEffect(() => {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes("@")) {
      setRecipientCheck({ checking: false, found: null })
      return
    }
    setRecipientCheck({ checking: true, found: null })
    const timer = setTimeout(async () => {
      const res = await lookupRecipient(trimmed)
      setRecipientCheck({ checking: false, found: res.found, displayName: res.displayName, error: res.error })
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  // — модалка подтверждения —
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [twofaToken, setTwofaToken] = useState("")
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmNotice, setConfirmNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [done, setDone] = useState(false)

  const n = Number(amount)
  const amountValid = Number.isFinite(n) && n > 0
  const affordable = amountValid && wallet.timecoin >= n
  const canContinue =
    amountValid && affordable && recipientCheck.found === true && !recipientCheck.checking

  function openConfirm() {
    setFormNotice(null)
    if (!email.trim()) { setFormNotice({ ok: false, text: "Введите email получателя" }); return }
    if (recipientCheck.found !== true) { setFormNotice({ ok: false, text: "Получатель не найден" }); return }
    if (!amountValid) { setFormNotice({ ok: false, text: "Введите корректную сумму" }); return }
    if (!affordable) { setFormNotice({ ok: false, text: `Недостаточно средств. Доступно: ${fmtTc(wallet.timecoin)} ∞` }); return }
    setPassword("")
    setTwofaToken("")
    setConfirmNotice(null)
    setConfirmOpen(true)
  }

  async function doTransfer() {
    if (!password) { setConfirmNotice({ ok: false, text: "Введите пароль" }); return }
    setConfirmBusy(true)
    setConfirmNotice(null)
    try {
      const res = await transferTC(email.trim(), n, comment.trim(), password, twofaToken.trim() || undefined)
      if (res.success) {
        setConfirmNotice({ ok: true, text: "Перевод выполнен" })
        setDone(true)
        setEmail("")
        setAmount("")
        setComment("")
        setRecipientCheck({ checking: false, found: null })
        setTimeout(() => setConfirmOpen(false), 1200)
      } else {
        setConfirmNotice({ ok: false, text: res.error || "Не удалось выполнить перевод" })
      }
    } finally {
      setConfirmBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[560px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
            <Send size={26} strokeWidth={1.75} style={{ color: "#F1C40F" }} />
            Перевод TC
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Отправьте ∞ другому пользователю OSGARD по email
          </p>
        </div>

        <div
          className="mt-8 rounded-2xl p-6"
          style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        >
          <p className="mb-5 text-[13px]" style={{ color: COLORS.label }}>
            Доступно: <span style={{ color: "#FFFFFF" }}>{fmtTc(wallet.timecoin)} ∞</span>
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                Email получателя
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
              />
              {recipientCheck.checking && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.label }}>
                  <Loader2 size={12} className="animate-spin" /> Поиск получателя…
                </p>
              )}
              {!recipientCheck.checking && recipientCheck.found === true && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.green }}>
                  <CheckCircle2 size={13} /> {recipientCheck.displayName || "Получатель найден"}
                </p>
              )}
              {!recipientCheck.checking && recipientCheck.found === false && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.red }}>
                  <XCircle size={13} /> {recipientCheck.error || "Пользователь не найден"}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                Сумма ∞
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                Комментарий (необязательно)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 200))}
                placeholder="Например: за помощь с проектом"
                rows={3}
                className="w-full resize-none rounded-lg px-3 py-2.5 text-[14px] outline-none"
                style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
              />
              <p className="mt-1 text-right text-[11px]" style={{ color: COLORS.label }}>
                {comment.length}/200
              </p>
            </div>
          </div>

          {formNotice && (
            <p className="mt-3 text-[13px]" role="status" style={{ color: formNotice.ok ? COLORS.green : COLORS.red }}>
              {formNotice.text}
            </p>
          )}

          <button
            type="button"
            onClick={openConfirm}
            disabled={!canContinue}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            Далее
          </button>

          <Link
            href="/transactions"
            className="mt-4 block text-center text-[13px] transition-opacity hover:opacity-90"
            style={{ color: COLORS.label }}
          >
            История переводов →
          </Link>
        </div>
      </main>

      {/* ── Модалка подтверждения перевода ──────────────────────── */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !confirmBusy) setConfirmOpen(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                <Send size={18} strokeWidth={1.75} style={{ color: "#F1C40F" }} />
                Подтверждение перевода
              </h2>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={confirmBusy}
                className="flex size-8 items-center justify-center rounded-lg text-[18px] transition-colors hover:bg-white/10"
                style={{ color: COLORS.label }}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div
              className="mb-4 space-y-1.5 rounded-lg p-4 text-[13px]"
              style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>Получатель</span>
                <span>{recipientCheck.displayName || email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>Сумма</span>
                <span>{fmtTc(n)} ∞</span>
              </div>
              {comment.trim() && (
                <div className="flex items-center justify-between gap-4">
                  <span style={{ color: COLORS.label }}>Комментарий</span>
                  <span className="truncate text-right">{comment.trim()}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                  Пароль от аккаунта
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                  style={{ backgroundColor: "#14141E", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px]" style={{ color: COLORS.label }}>
                  Код 2FA (если включена)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={twofaToken}
                  onChange={(e) => setTwofaToken(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
                  style={{ backgroundColor: "#14141E", border: `1px solid ${COLORS.border}`, color: "#FFFFFF" }}
                />
              </div>
            </div>

            {confirmNotice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: confirmNotice.ok ? COLORS.green : COLORS.red }}>
                {confirmNotice.text}
              </p>
            )}

            <button
              type="button"
              onClick={doTransfer}
              disabled={confirmBusy || done || loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {(confirmBusy || loading) && <Loader2 size={16} className="animate-spin" />}
              Подтвердить перевод
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
