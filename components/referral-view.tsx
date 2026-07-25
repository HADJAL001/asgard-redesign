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

/* Премиальный фон «многолюдная биржа Уолл-стрит»: несколько рядов бегущих
   тикеров (зелёные/красные котировки) на тёмной подложке + золотое сияние и
   виньетка. Сделано на чистом CSS (без внешних картинок — надёжнее, ничего не
   «битого»), это декоративная атмосфера биржи, а не реальные данные. */
const RF_CSS = `
@keyframes rf-scroll-l { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes rf-scroll-r { from { transform: translateX(-50%) } to { transform: translateX(0) } }
@keyframes rf-glow { 0%,100% { opacity: .5 } 50% { opacity: .85 } }
.rf-page { position: relative; overflow: hidden; }
.rf-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgba(212,175,55,0.10), transparent 60%),
    linear-gradient(180deg, #05070f 0%, #0a0e1a 55%, #05070f 100%); }
.rf-ticker-row { position: absolute; left: 0; white-space: nowrap; font-family: ui-monospace, Menlo, monospace;
  font-size: 15px; font-weight: 600; letter-spacing: .04em; opacity: .10; filter: blur(.3px); will-change: transform; }
.rf-ticker-row span { display: inline-block; padding-right: 3rem; }
.rf-up { color: #34d399; } .rf-down { color: #f87171; } .rf-sym { color: rgba(255,255,255,0.55); }
.rf-vignette { position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(3,5,12,0.65) 100%); }
.rf-glow { position: absolute; left: 50%; top: 8%; width: 640px; height: 320px; transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(212,175,55,0.16), transparent); filter: blur(30px);
  animation: rf-glow 6s ease-in-out infinite; z-index: 0; pointer-events: none; }
.rf-content { position: relative; z-index: 2; }
.rf-card { background: rgba(15,18,30,0.62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(212,175,55,0.22); box-shadow: 0 12px 44px rgba(0,0,0,0.42); border-radius: 16px; }
.rf-quote { position: relative; border-radius: 18px; overflow: hidden;
  background: linear-gradient(135deg, rgba(212,175,55,0.14), rgba(240,199,94,0.05) 45%, rgba(15,18,30,0.6));
  border: 1px solid rgba(212,175,55,0.35); box-shadow: 0 16px 50px rgba(0,0,0,0.45); }
.rf-quote::before { content: "“"; position: absolute; top: -18px; left: 14px; font-family: Georgia, serif;
  font-size: 120px; line-height: 1; color: rgba(212,175,55,0.18); pointer-events: none; }
.rf-gold { color: #E6C868; }
.rf-gold-btn { background: linear-gradient(135deg, #E6C868, #C69B2E); color: #1a1405; }
.rf-gold-btn:hover { filter: brightness(1.06); }
@media (prefers-reduced-motion: reduce) { .rf-ticker-row { animation: none !important; } }
`

const TICKER_UNIT = [
  ["AAPL", "▲", "2.41", true], ["NVDA", "▲", "3.18", true], ["TSLA", "▼", "0.88", false],
  ["MSFT", "▲", "1.02", true], ["AMZN", "▲", "0.74", true], ["META", "▼", "1.35", false],
  ["GOOG", "▲", "0.56", true], ["JPM", "▲", "0.92", true], ["GS", "▼", "0.41", false],
  ["BTC", "▲", "4.20", true], ["ETH", "▲", "2.10", true], ["SPX", "▲", "0.31", true],
] as const

function TickerRow({ i }: { i: number }) {
  // Разные ряды: скорость, направление, вертикальное положение, лёгкий сдвиг набора.
  const top = 6 + i * 13
  const dur = 34 + (i % 4) * 11
  const dir = i % 2 === 0 ? "rf-scroll-l" : "rf-scroll-r"
  const offset = (i * 5) % TICKER_UNIT.length
  const seq = [...TICKER_UNIT.slice(offset), ...TICKER_UNIT.slice(0, offset)]
  const content = (
    <>
      {seq.map(([sym, arrow, val, up], k) => (
        <span key={k}>
          <span className="rf-sym">{sym}</span> <span className={up ? "rf-up" : "rf-down"}>{arrow}{val}%</span>
        </span>
      ))}
    </>
  )
  return (
    <div className="rf-ticker-row" style={{ top: `${top}%`, animation: `${dir} ${dur}s linear infinite` }} aria-hidden="true">
      {/* дублируем набор дважды для бесшовной прокрутки (translateX -50%) */}
      {content}
      {content}
    </div>
  )
}

/* Общая обёртка страницы: Navbar + премиальный биржевой фон. Раньше страница
   рендерилась на плоском bg-background — теперь единый фон под всеми состояниями
   (загрузка/гость/данные). */
function ReferralPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rf-page min-h-screen font-sans" style={{ backgroundColor: "#05070f" }}>
      <style dangerouslySetInnerHTML={{ __html: RF_CSS }} />
      <div className="rf-bg">
        {Array.from({ length: 6 }).map((_, i) => (
          <TickerRow key={i} i={i} />
        ))}
      </div>
      <div className="rf-glow" />
      <div className="rf-vignette" />
      <div className="rf-content">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-12">{children}</main>
      </div>
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
      Promise.resolve().then(() => setLoading(false))
      return
    }
    Promise.resolve().then(() => fetchStats())
  }, [authLoading, isAuthenticated, fetchStats])

  const referralLink = stats?.referralCode
    ? `https://osgardnewworld.com/?ref=${stats.referralCode}`
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
            <Gift className="w-7 h-7 rf-gold" />
            {t("referral.title") || "Реферальная программа"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("referral.subtitle") ||
              "Приглашайте друзей и получайте награды в ∞"}
          </p>
        </div>

        {/* Мотивирующая цитата — премиальный акцент */}
        <div className="rf-quote px-6 py-6 md:px-8 md:py-7">
          <p className="relative text-[17px] md:text-[19px] font-semibold leading-snug text-white">
            Пригласи друга в элитную платформу — и <span className="rf-gold">зарабатывайте вместе</span>.
          </p>
          <p className="relative mt-1.5 text-[14px] md:text-[15px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            Он скажет тебе спасибо.
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
            <div className="rf-card p-4 md:p-6 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {t("referral.yourCode") || "Ваш реферальный код"}
                </div>
                <div className="text-lg font-mono font-semibold tracking-widest rf-gold">
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
                    className="rf-gold-btn shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition"
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
              <div className="rf-card p-4 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <Users className="w-4 h-4" />
                  {t("referral.invites") || "Приглашено"}
                </div>
                <div className="text-2xl font-bold">{stats.invites}</div>
              </div>

              <div className="rf-card p-4 flex flex-col gap-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("referral.earned") || "Получено ∞"}
                </div>
                <div className="text-2xl font-bold">
                  {stats.rewardsEarnedTC.toLocaleString()} ∞
                </div>
              </div>

              <div className="rf-card p-4 flex flex-col gap-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("referral.claimable") || "Доступно к получению"}
                </div>
                <div className="text-2xl font-bold rf-gold">
                  {stats.claimableTC.toLocaleString()} ∞
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="rf-card p-4 md:p-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("referral.progressToNext") || "Прогресс до следующей награды"}
                </span>
                <span className="font-semibold">{Math.min(100, Math.max(0, stats.progress))}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, stats.progress))}%`, background: "linear-gradient(90deg, #C69B2E, #E6C868)" }}
                />
              </div>
            </div>

            {/* Claim button */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleClaim}
                disabled={stats.claimableTC <= 0 || claiming}
                className="rf-gold-btn w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
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
