"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Infinity as InfinityIcon, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
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
          <p className="text-sm text-[#6A6A8A]">Создайте аккаунт и начните зарабатывать</p>
        </div>

        <div className="rounded-2xl border border-[#2A2A3E] bg-[#14141E] p-6 shadow-2xl">
          <h2 className="mb-6 text-lg font-semibold text-white">Регистрация</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-xs font-medium text-[#6A6A8A]">
                Имя пользователя
              </label>
              <input
                id="name"
                type="text"
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="alex_odin"
                className="rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6A6A8A]/60 focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]"
              />
              <p className="text-[11px] text-[#6A6A8A]/80">
                Только латинские буквы, цифры и подчёркивание, без пробелов (3–20 символов)
              </p>
            </div>

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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[#6A6A8A]">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6A6A8A]/60 focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-medium text-[#6A6A8A]">
                Повтор пароля
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
              Создать аккаунт
            </button>
          </form>

          <div className="mt-5">
            <SocialLoginButtons />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#6A6A8A]">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-[#00D4FF] hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </main>
  )
}
