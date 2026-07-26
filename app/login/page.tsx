"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { SocialLoginButtons } from "@/components/social-login-buttons"
import { OsgardMark } from "@/components/osgard-mark"

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
    <main className="auth-stage relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-9 flex flex-col items-center gap-3 text-center">
          {/* boxed={false}: стеклянная коробка со свечением читалась «неоновой
              кляксой». Голый гравированный лемнискат — дороже и тише. */}
          <OsgardMark size={132} boxed={false} className="auth-mark mb-1" />
          <span className="elite-eyebrow">Neural Platform</span>
          <h1 className="auth-wordmark font-display text-[2.6rem] font-bold leading-none">OSGARD</h1>
          <p className="auth-kicker">Command Interface</p>
        </div>

        {/* Оправа: обсидиановое стекло с золотой фаской (.auth-vault) */}
        <div className="auth-vault p-7 sm:p-8">
          {/* Переключатель режима: активный сегмент — золотая подпись, не плашка */}
          <div className="auth-seg mb-7">
            <button
              type="button"
              data-active={mode === "login"}
              className="auth-seg-item"
              onClick={() => {
                setMode("login")
                setError(null)
                setTwofaRequired(false)
                setTwofaCode("")
              }}
            >
              Вход
            </button>
            <button
              type="button"
              data-active={mode === "register"}
              className="auth-seg-item"
              onClick={() => {
                setMode("register")
                setError(null)
                setTwofaRequired(false)
                setTwofaCode("")
              }}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-2">
              <label htmlFor="username" className="auth-label">
                {mode === "login" ? "Email или Username" : "Username"}
              </label>
              <input
                id="username"
                type="text"
                autoComplete={mode === "login" ? "email" : "username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === "login" ? "alex@example.com или alex_odin" : "alex_odin"}
                className="auth-field"
              />
            </div>

            {mode === "register" && (
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
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="auth-label">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-field"
              />
            </div>

            {mode === "register" && (
              <div className="flex flex-col gap-2">
                <label htmlFor="confirmPassword" className="auth-label">
                  Подтвердите пароль
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
            )}

            {mode === "login" && twofaRequired && (
              <div className="flex flex-col gap-2">
                <label htmlFor="twofaCode" className="auth-label">
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
                  className="auth-field"
                />
                <p className="text-[11px] text-[#7c869e]">
                  Введите 6-значный код из приложения-аутентификатора или один из резервных кодов.
                </p>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn-auth mt-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? (twofaRequired ? "Подтвердить код" : "Войти") : "Создать аккаунт"}
            </button>
          </form>

          {/* Свою разделительную линию здесь НЕ ставим: у SocialLoginButtons
              уже есть собственный разделитель «или через» — две линии подряд
              выглядели бы шумом. Перекрашиваем его через .auth-social. */}
          <div className="auth-social mt-7">
            <SocialLoginButtons />
          </div>
        </div>

        <p className="auth-footnote mt-7 text-center text-xs">
          {mode === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError(null)
              setTwofaRequired(false)
              setTwofaCode("")
            }}
          >
            {mode === "login" ? "Зарегистрироваться" : "Войти"}
          </button>
        </p>
      </div>
    </main>
  )
}
