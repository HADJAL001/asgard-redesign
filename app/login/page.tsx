"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Infinity as InfinityIcon, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { SocialLoginButtons } from "@/components/social-login-buttons"

/* ================================================================
   OSGARD · Login / Register
   ----------------------------------------------------------------
   Единая форма входа/регистрации. После успешной аутентификации
   редиректит на /dashboard (или на ?next=... если указан).
   ================================================================ */

type Mode = "login" | "register"

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, register } = useAuth()

  const [mode, setMode] = useState<Mode>("login")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  // Второй шаг входа: бэкенд запросил код 2FA (TOTP или резервный код).
  const [twofaRequired, setTwofaRequired] = useState(false)
  const [twofaCode, setTwofaCode] = useState("")
  const [loading, setLoading] = useState(false)
  const nextPath = searchParams.get("next") || "/"
  const oauthError = searchParams.get("oauthError")
  const reason = searchParams.get("reason")
  const [error, setError] = useState<string | null>(
    oauthError
      ? "Не удалось выполнить вход через соцсеть. Попробуйте ещё раз."
      : reason === "banned"
        ? "Ваш аккаунт заблокирован. Обратитесь в поддержку, если считаете это ошибкой."
        : null,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (mode === "login") {
      // При входе используем email (или username если введён email)
      if (!username.trim() || !password) {
        setError("Заполните все обязательные поля")
        return
      }
    } else {
      if (!username.trim() || !email.trim() || !password) {
        setError("Заполните все обязательные поля")
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
    }

    if (mode === "login" && twofaRequired && !twofaCode.trim()) {
      setError("Введите код двухфакторной аутентификации")
      return
    }

    setLoading(true)
    let result
    if (mode === "login") {
      // Email (содержит @) или username — auth-store сам разложит по нужным полям.
      // twofaCode передаём только на втором шаге (когда бэкенд его запросил).
      const input = username.trim()
      result = await login(input, password, twofaRequired ? twofaCode.trim() : undefined)
    } else {
      result = await register(username.trim(), email.trim(), password)
    }
    setLoading(false)

    // Бэкенд запросил второй фактор — показываем поле кода и ждём повторной отправки.
    if (result.twofaRequired) {
      setTwofaRequired(true)
      setError(null)
      return
    }

    if (!result.ok) {
      setError(result.message || "Что-то пошло не так")
      return
    }

    if (mode === "register") {
      const sep = nextPath.includes("?") ? "&" : "?"
      router.push(`${nextPath}${sep}welcome=1`)
    } else {
      router.push(nextPath)
    }
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
          <span className="elite-eyebrow">Neural Platform</span>
          <h1 className="holo-title font-display text-4xl font-bold tracking-tight">OSGARD</h1>
          <p className="text-sm text-[#8899bb]">Command Interface</p>
        </div>

        <div className="premium-card premium-panel rounded-2xl p-6">
          {/* переключатель режима */}
          <div className="mb-6 flex rounded-xl border border-[color:var(--eg-glass-border)] bg-[color:rgb(8_10_20/55%)] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login")
                setError(null)
                setTwofaRequired(false)
                setTwofaCode("")
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === "login" ? "seg-premium-active" : "text-[#8899bb] hover:text-white"
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register")
                setError(null)
                setTwofaRequired(false)
                setTwofaCode("")
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === "register" ? "seg-premium-active" : "text-[#8899bb] hover:text-white"
              }`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs font-medium text-[#8899bb]">
                {mode === "login" ? "Email или Username" : "Username"}
              </label>
              <input
                id="username"
                type={mode === "login" ? "text" : "text"}
                autoComplete={mode === "login" ? "email" : "username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === "login" ? "alex@example.com или alex_odin" : "alex_odin"}
                className="premium-field px-3 py-2.5 text-sm"
              />
            </div>

            {mode === "register" && (
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
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[#8899bb]">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="premium-field px-3 py-2.5 text-sm"
              />
            </div>

            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmPassword" className="text-xs font-medium text-[#8899bb]">
                  Подтвердите пароль
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
            )}

            {mode === "login" && twofaRequired && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="twofaCode" className="text-xs font-medium text-[#8899bb]">
                  Код 2FA
                </label>
                <input
                  id="twofaCode"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  value={twofaCode}
                  onChange={(e) => setTwofaCode(e.target.value)}
                  placeholder="123456 или резервный код"
                  className="premium-field px-3 py-2.5 text-sm"
                />
                <p className="text-[11px] text-[#8899bb]">
                  Введите 6-значный код из приложения-аутентификатора или один из резервных кодов.
                </p>
              </div>
            )}

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
              {mode === "login" ? (twofaRequired ? "Подтвердить код" : "Войти") : "Создать аккаунт"}
            </button>
          </form>

          <div className="mt-5">
            <SocialLoginButtons />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#8899bb]">
          {mode === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError(null)
              setTwofaRequired(false)
              setTwofaCode("")
            }}
            className="font-medium text-[color:var(--color-gold)] hover:underline"
          >
            {mode === "login" ? "Зарегистрироваться" : "Войти"}
          </button>
        </p>
      </div>
    </main>
  )
}
