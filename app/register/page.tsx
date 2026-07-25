"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Infinity as InfinityIcon, Loader2, Gift } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { getReferralCode } from "@/lib/referral"
import { SocialLoginButtons } from "@/components/social-login-buttons"

/* ================================================================
   OSGARD · Register
   ----------------------------------------------------------------
   Отдельная страница регистрации в стиле /login (тёмный, премиум).
   Поля: Имя пользователя, Email, Пароль, Повтор пароля.
   После успешной регистрации → /dashboard.
   ================================================================ */

// Должно соответствовать бэкенд-валидации username (см. backend/src/utils/validators.ts, USERNAME_RE)
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Пришёл по реферальной ссылке → показываем welcome-бонус (двусторонняя реферралка).
  const [invited, setInvited] = useState(false)
  useEffect(() => { Promise.resolve().then(() => setInvited(!!getReferralCode())) }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Заполните все поля")
      return
    }
    if (!USERNAME_RE.test(name.trim())) {
      setError("Имя пользователя: только латинские буквы, цифры и подчёркивание, 3–20 символов, без пробелов")
      return
    }
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов")
      return
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают")
      return
    }

    setLoading(true)
    const result = await register(name.trim(), email.trim(), password)
    setLoading(false)

    if (!result.ok) {
      setError(result.message || "Что-то пошло не так")
      return
    }

    router.push("/dashboard?welcome=1")
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Локальное золото-бирюзовое свечение поверх общего AmbientBackdrop
          (фон платформы дышит сквозь прозрачную подложку — не глушим его). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--color-gold-rgb)/0.10)] blur-[130px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[320px] w-[320px] rounded-full bg-[color:rgb(var(--color-cyan-rgb)/0.08)] blur-[110px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[color:rgb(var(--color-gold-rgb)/0.4)] bg-[color:var(--eg-glass-bg)] text-[color:var(--color-gold)] shadow-[var(--eg-glow-gold)] backdrop-blur">
            <InfinityIcon className="h-8 w-8" />
          </div>
          <span className="elite-eyebrow">Создай аккаунт</span>
          <h1 className="holo-title font-display text-4xl font-bold tracking-tight">OSGARD</h1>
          <p className="text-sm text-[#8899bb]">Создайте аккаунт и начните зарабатывать</p>
        </div>

        {invited && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.07] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/40 text-[#D4AF37]">
              <Gift className="h-4 w-4" />
            </span>
            <p className="text-[13px] leading-snug text-white/80">
              Тебя пригласили — при регистрации получишь <span className="font-semibold text-[#D4AF37]">+5&nbsp;∞</span> приветственный бонус.
            </p>
          </div>
        )}

        <div className="premium-card premium-panel rounded-2xl p-6">
          <h2 className="mb-6 text-lg font-semibold text-white">Регистрация</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-xs font-medium text-[#8899bb]">
                Имя пользователя
              </label>
              <input
                id="name"
                type="text"
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="alex_odin"
                className="premium-field px-3 py-2.5 text-sm"
              />
              <p className="text-[11px] text-[#8899bb]/80">
                Только латинские буквы, цифры и подчёркивание, без пробелов (3–20 символов)
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-[#8899bb]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@osgard.io"
                className="premium-field px-3 py-2.5 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[#8899bb]">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="premium-field px-3 py-2.5 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-medium text-[#8899bb]">
                Повтор пароля
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="premium-field px-3 py-2.5 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-sm text-[#F87171]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-premium-gold mt-2 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Создать аккаунт
            </button>
          </form>

          <div className="mt-5">
            <SocialLoginButtons />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#8899bb]">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-medium text-[color:var(--color-gold)] hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </main>
  )
}
