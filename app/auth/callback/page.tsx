"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-store"

/* ================================================================
   OSGARD · OAuth callback
   ----------------------------------------------------------------
   Бэкенд после успешного соц-входа редиректит сюда с ?token=...&
   refreshToken=..., либо с ?error=... при сбое. Забираем токен,
   поднимаем сессию через loginWithToken и уходим на /dashboard.
   ================================================================ */

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  )
}

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const token = searchParams.get("token")
    const refreshToken = searchParams.get("refreshToken") || undefined
    const oauthError = searchParams.get("error")

    if (oauthError || !token) {
      router.replace(`/login?oauthError=${encodeURIComponent(oauthError || "no_token")}`)
      return
    }

    loginWithToken(token, refreshToken).then((result) => {
      if (result.ok) {
        router.replace("/dashboard")
      } else {
        setError(result.message || "Не удалось выполнить вход")
        router.replace(`/login?oauthError=${encodeURIComponent(result.message || "login_failed")}`)
      }
    })
  }, [searchParams, loginWithToken, router])

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0A0F] px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00D4FF]/10 blur-[120px]" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF]" />
        <p className="text-sm text-[#6A6A8A]">{error || "Завершаем вход…"}</p>
      </div>
    </main>
  )
}
