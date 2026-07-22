"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Copy, Gift, Users, Check, Loader2, LogIn, RefreshCw } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient, ApiError } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"
import { useTranslation } from "@/lib/i18n/use-translation"

interface ReferralStats {
  referralCode: string
  invites: number
  rewardsEarnedTC: number
  claimableTC: number
  progress: number // 0..100
}

/* Общая обёртка страницы: тот же Navbar + фон, что и на /leaderboard,
   /hall-of-fame и остальных публичных страницах (см. leaderboard-view.tsx,
   wallet-view.tsx) — раньше эта страница рендерилась без хедера/навигации. */
function ReferralPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-12">{children}</main>
    </div>
  )
}

export default function ReferralView() {
  const { t } = useTranslation()
  const { isAuthenticated, loading: authLoading } = useAuth()

  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invalidSession, setInvalidSession] = useState(false)
  const [copied, setCopied] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setInvalidSession(false)
      const data = await apiClient.get<ReferralStats>("/referral/stats", { skipAuthRedirect: true })
      setStats(data)
    } catch (err) {
      console.error(err)
      // 404 с USER_NOT_FOUND значит, что кешированная на клиенте сессия ссылается на
      // userId, которого больше нет в БД (например, после пересоздания эфемерной SQLite
      // на Railway) — бесконечный "Повторить" тут бессмысленен, нужно предложить войти заново.
      if (err instanceof ApiError && err.status === 404 && err.data?.code === "USER_NOT_FOUND") {
        setInvalidSession(true)
      } else {
        setError(t("referral.errorLoad") || "Не удалось загрузить данные реферальной программы")
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // /referral/stats требует авторизации (это персональные данные пользователя).
    // Пока не завершилась начальная проверка сессии — ждём, иначе гость
    // получал бы 401 и сырую ошибку вместо предложения войти.
    if (authLoading) return
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    fetchStats()
  }, [authLoading, isAuthenticated, fetchStats])

  const referralLink = stats?.referralCode
    ? `https://osgard.com/?ref=${stats.referralCode}`
    : ""

  const handleCopy = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Copy failed", err)
    }
  }

  const handleClaim = async () => {
    if (!stats || stats.claimableTC <= 0 || claiming) return
    try {
      setClaiming(true)
      setClaimMessage(null)
      await apiClient.post("/referral/claim", {})
      setClaimMessage(t("referral.claimSuccess") || "Награда успешно получена!")
      await fetchStats()
    } catch (err) {
      console.error(err)
      setClaimMessage(t("referral.claimError") || "Не удалось получить награду")
    } finally {
      setClaiming(false)
    }
  }

  // Начальная проверка сессии ещё не завершена
  if (authLoading) {
    return (
      <ReferralPageShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </ReferralPageShell>
    )
  }

  // Гость: раньше сюда прилетал сырой 401 от /referral/stats и рендерилась
  // общая ошибка загрузки. Показываем понятный призыв войти вместо этого.
  if (!isAuthenticated) {
    return (
      <ReferralPageShell>
        <div className="space-y-1 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Gift className="w-7 h-7 text-primary" />
            {t("referral.title") || "Реферальная программа"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("referral.subtitle") || "Приглашайте друзей и получайте награды в ∞"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center text-center gap-3">
          <LogIn className="w-8 h-8 text-primary" />
          <div className="font-semibold">
            {t("referral.loginRequiredTitle") || "Войдите в аккаунт"}
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t("referral.loginRequiredText") ||
              "Чтобы посмотреть свой реферальный код и награды, нужно войти в аккаунт"}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            {t("referral.loginCta") || "Войти"}
          </Link>
        </div>
      </ReferralPageShell>
    )
  }

  if (invalidSession) {
    return (
      <ReferralPageShell>
        <div className="space-y-1 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Gift className="w-7 h-7 text-primary" />
            {t("referral.title") || "Реферальная программа"}
          </h1>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center text-center gap-3">
          <LogIn className="w-8 h-8 text-primary" />
          <div className="font-semibold">
            {t("referral.sessionExpiredTitle") || "Сессия устарела"}
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t("referral.sessionExpiredText") ||
              "Ваша сессия больше не действительна. Пожалуйста, войдите в аккаунт заново"}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            {t("referral.loginCta") || "Войти"}
          </Link>
        </div>
      </ReferralPageShell>
    )
  }

  if (loading && !stats) {
    return (
      <ReferralPageShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </ReferralPageShell>
    )
  }

  return (
    <ReferralPageShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Gift className="w-7 h-7 text-primary" />
            {t("referral.title") || "Реферальная программа"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("referral.subtitle") ||
              "Приглашайте друзей и получайте награды в ∞"}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => fetchStats()}
              disabled={loading}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium hover:bg-destructive/10 transition disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {t("referral.retry") || "Повторить"}
            </button>
          </div>
        )}

        {stats && (
          <>
            {/* Referral code + link */}
            <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {t("referral.yourCode") || "Ваш реферальный код"}
                </div>
                <div className="text-lg font-mono font-semibold tracking-widest">
                  {stats.referralCode}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {t("referral.yourLink") || "Ваша реферальная ссылка"}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={referralLink}
                    className="flex-1 min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied
                      ? t("referral.copied") || "Скопировано"
                      : t("referral.copyLink") || "Копировать ссылку"}
                  </button>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <Users className="w-4 h-4" />
                  {t("referral.invites") || "Приглашено"}
                </div>
                <div className="text-2xl font-bold">{stats.invites}</div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("referral.earned") || "Получено ∞"}
                </div>
                <div className="text-2xl font-bold">
                  {stats.rewardsEarnedTC.toLocaleString()} ∞
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("referral.claimable") || "Доступно к получению"}
                </div>
                <div className="text-2xl font-bold text-primary">
                  {stats.claimableTC.toLocaleString()} ∞
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("referral.progressToNext") || "Прогресс до следующей награды"}
                </span>
                <span className="font-semibold">{Math.min(100, Math.max(0, stats.progress))}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, stats.progress))}%` }}
                />
              </div>
            </div>

            {/* Claim button */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleClaim}
                disabled={stats.claimableTC <= 0 || claiming}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("referral.claimReward") || "Забрать награду"}
              </button>
              {claimMessage && (
                <p className="text-sm text-muted-foreground">{claimMessage}</p>
              )}
            </div>
          </>
        )}
      </div>
    </ReferralPageShell>
  )
}
