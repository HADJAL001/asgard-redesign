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
  const [loading, setLoading] = useState(false)
  const nextPath = searchParams.get("next") || "/dashboard"
  const oauthError = searchParams.get("oauthError")
  const [error, setError] = useState<string | null>(
    oauthError ? "Не удалось выполнить вход через соцсеть. Попробуйте ещё раз." : null,
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

    setLoading(true)
    let result
    if (mode === "login") {
      // Определяем: если введён email (содержит @) — передаём как email, иначе как username
      const input = username.trim()
      if (input.includes("@")) {
        result = await login(input, password)
      } else {
        // Пробуем как username — передаём username в поле email для совместимости со старым бэкендом
        // auth-store отправит { username: input, password }
        result = await login(input, password)
      }
    } else {
      result = await register(username.trim(), email.trim(), password)
    }
    setLoading(false)

    if (!result.ok) {
      setError(result.message || "Что-то пошло не так")
      return
    }

    router.push(nextPath)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0A0F] px-4">
      {/* фоновое свечение в стиле OSGARD */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00D4FF]/10 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[300px] w-[300px] rounded-full bg-[#E74C3C]/10 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2A2A3E] bg-[#14141E] text-[#00D4FF] shadow-[0_0_30px_rgba(0,212,255,0.15)]">
            <InfinityIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">OSGARD</h1>
          <p className="text-sm text-[#6A6A8A]">Neural Platform · Command Interface</p>
        </div>

        <div className="rounded-2xl border border-[#2A2A3E] bg-[#14141E] p-6 shadow-2xl">
          {/* переключатель режима */}
          <div className="mb-6 flex rounded-xl border border-[#2A2A3E] bg-[#0A0A0F] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login")
                setError(null)
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === "login" ? "bg-[#00D4FF] text-black" : "text-[#6A6A8A] hover:text-white"
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register")
                setError(null)
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === "register" ? "bg-[#00D4FF] text-black" : "text-[#6A6A8A] hover:text-white"
              }`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs font-medium text-[#6A6A8A]">
                {mode === "login" ? "Email или Username" : "Username"}
              </label>
              <input
                id="username"
                type={mode === "login" ? "text" : "text"}
                autoComplete={mode === "login" ? "email" : "username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === "login" ? "alex@example.com или alex_odin" : "alex_odin"}
                className="rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6A6A8A]/60 focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]"
              />
            </div>

            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-xs font-medium text-[#6A6A8A]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@osgard.io"
                  className="rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6A6A8A]/60 focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[#6A6A8A]">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6A6A8A]/60 focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]"
              />
            </div>

            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmPassword" className="text-xs font-medium text-[#6A6A8A]">
                  Подтвердите пароль
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6A6A8A]/60 focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]"
                />
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
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#00D4FF] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>

          <div className="mt-5">
            <SocialLoginButtons />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#6A6A8A]">
          {mode === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError(null)
            }}
            className="text-[#00D4FF] hover:underline"
          >
            {mode === "login" ? "Зарегистрироваться" : "Войти"}
          </button>
        </p>
      </div>
    </main>
  )
}
