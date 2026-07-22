"use client"

import dynamic from "next/dynamic"
import { Infinity as InfinityIcon } from "lucide-react"

import { useAuth } from "@/lib/auth-store"

const EternityLanding = dynamic(
  () => import("@/components/eternity-landing").then((m) => m.EternityLanding),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

const DemoProjectGenerator = dynamic(
  () => import("@/components/DemoProjectGenerator").then((m) => m.DemoProjectGenerator),
  { loading: () => null, ssr: false }
)

const PlatformMap = dynamic(
  () => import("@/components/platform-map/PlatformMap").then((m) => m.PlatformMap),
  { loading: () => <NeutralSplash />, ssr: false }
)

function NeutralSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2A2A3E] bg-[#14141E] text-[#00D4FF] shadow-[0_0_30px_rgba(0,212,255,0.15)] animate-pulse">
        <InfinityIcon className="h-7 w-7" />
      </div>
    </div>
  )
}

export default function Page() {
  const { isAuthenticated, loading } = useAuth()

  /* Авторизованный пользователь: показываем платформу.
     Если loading=true (нет кеша — значит гость или первый визит),
     показываем лендинг сразу — он не требует авторизации.
     PlatformMap появится когда /auth/me вернёт пользователя. */
  if (isAuthenticated) return <PlatformMap />

  /* loading=true и нет user → показываем лендинг немедленно.
     После ответа /auth/me (если юзер залогинен) будет ре-рендер на PlatformMap. */
  return (
    <>
      <EternityLanding />
      <DemoProjectGenerator />
    </>
  )
}
