"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Loader2, Gift, Wand2 } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { getReferralCode } from "@/lib/referral"
import { SocialLoginButtons } from "@/components/social-login-buttons"
import { OsgardMark } from "@/components/osgard-mark"

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
  const searchParams = useSearchParams()
  const { register } = useAuth()
  const continuesProject = searchParams.get("continue") === "project"

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
    <main className="auth-stage relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-9 flex flex-col items-center gap-3 text-center">
          {/* boxed={false} — тот же тихий гравированный знак, что на /login. */}
          <OsgardMark size={132} boxed={false} className="auth-mark mb-1" />
          <span className="elite-eyebrow">Создай аккаунт</span>
          <h1 className="auth-wordmark font-display text-[2.6rem] font-bold leading-none">OSGARD</h1>
          <p className="auth-kicker">Создайте аккаунт и начните зарабатывать</p>
        </div>

        {invited && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/40 text-[#D4AF37]">
              <Gift className="h-4 w-4" />
            </span>
            <p className="text-[13px] leading-snug text-white/80">
              Тебя пригласили — при регистрации получишь <span className="font-semibold text-[#D4AF37]">+5&nbsp;∞</span> приветственный бонус.
            </p>
          </div>
        )}

        {continuesProject && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.06] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 text-cyan-200">
              <Wand2 className="h-4 w-4" />
            </span>
            <p className="text-[13px] leading-snug text-white/80">
              Идея сохранена. После создания аккаунта OSGARD продолжит собирать ваш проект.
            </p>
          </div>
        )}

        {/* Оправа: та же материя, что на /login — пара страниц читается одним объектом */}
        <div className="auth-vault p-7 sm:p-8">
          <h2 className="text-[1.05rem] font-semibold tracking-tight text-[#ecebe6]">Регистрация</h2>
          <hr className="auth-rule mb-6 mt-4" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="auth-label">
                Имя пользователя
              </label>
              <input
                id="name"
                type="text"
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="alex_odin"
                className="auth-field"
              />
              <p className="text-[11px] text-[#7c869e]">
                Только латинские буквы, цифры и подчёркивание, без пробелов (3–20 символов)
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="auth-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@osgard.io"
                className="auth-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="auth-label">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-field"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="confirmPassword" className="auth-label">
                Повтор пароля
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-field"
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn-auth mt-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Создать аккаунт
            </button>
          </form>

          {/* Разделитель «или через» уже есть внутри SocialLoginButtons —
              вторую линию не рисуем, только перекрашиваем через .auth-social. */}
          <div className="auth-social mt-7">
            <SocialLoginButtons />
          </div>
        </div>

        <p className="auth-footnote mt-7 text-center text-xs">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="auth-link">
            Войти
          </Link>
        </p>
      </div>
    </main>
  )
}
