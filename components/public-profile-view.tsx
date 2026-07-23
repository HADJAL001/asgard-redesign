"use client"

/* Публичный профиль стороннего пользователя — read-only: без вкладок
   "Настройки"/кошелька, без кнопки "Редактировать". Открывается по клику
   на карточку в Зале Славы / Рейтинге (hall-of-fame-view.tsx, leaderboard-view.tsx). */

import { useEffect, useState } from "react"
import Image from "next/image"
import { FolderKanban, Trophy, TrendingUp, Coins, Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { useOsgard } from "@/lib/store/osgard-store"
import { formatTokens } from "@/lib/economy"
import { ArtifactMiniCard, type MiniArtifact } from "./artifact-mini-card"

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80"

type PublicUser = {
  id: number
  username: string
  displayName: string | null
  avatarUrl: string | null
  level: number
  bio: string | null
  createdAt: string
  totalIncome: number
  totalSales: number
  artifactCount: number
}

export function PublicProfileView({ userId }: { userId: number }) {
  const { tcPrice } = useOsgard()
  const [user, setUser] = useState<PublicUser | null>(null)
  const [artifacts, setArtifacts] = useState<MiniArtifact[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      setLoading(true)
      setNotFound(false)
    })

    Promise.all([
      apiClient.get<{ user: PublicUser }>(`/users/${userId}`, { skipAuthRedirect: true }),
      apiClient.get<{ artifacts: MiniArtifact[] }>(`/users/${userId}/artifacts`, { skipAuthRedirect: true }),
    ])
      .then(([userRes, artifactsRes]) => {
        if (cancelled) return
        setUser(userRes.user)
        setArtifacts(artifactsRes.artifacts)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const displayName = user?.displayName || user?.username || "Пользователь"

  if (loading) {
    return (
      <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: "#FFFFFF" }}>
        <Navbar />
        <main className="mx-auto flex max-w-[1240px] items-center justify-center px-6 py-24">
          <Loader2 size={24} className="animate-spin" style={{ color: "#6A6A8A" }} aria-hidden="true" />
        </main>
      </div>
    )
  }

  if (notFound || !user) {
    return (
      <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: "#FFFFFF" }}>
        <Navbar />
        <main className="mx-auto max-w-[1240px] px-6 py-24 text-center">
          <p className="text-[18px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            Пользователь не найден
          </p>
        </main>
      </div>
    )
  }

  const metrics = [
    { Icon: FolderKanban, n: String(user.artifactCount), l: "Артефактов" },
    { Icon: Coins, n: formatTokens(user.totalIncome), l: "Заработано, ∞" },
    { Icon: TrendingUp, n: String(user.level), l: "Уровень" },
    { Icon: Trophy, n: String(user.totalSales), l: "Продаж" },
  ]

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Профиль</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Архитектор вселенной — уровень {user.level}
          </p>
        </div>

        {/* Avatar + info */}
        <section className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-stretch">
          <div
            className="flex shrink-0 items-center justify-center rounded-2xl p-6"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <Image
              src={user.avatarUrl || AVATAR || "/placeholder.svg"}
              alt={displayName}
              width={128}
              height={128}
              className="size-32 rounded-full object-cover"
              style={{ border: "2px solid #2A2A3E" }}
            />
          </div>

          <div
            className="flex flex-1 flex-col justify-center gap-4 rounded-2xl p-6 md:p-8"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <div>
              <h2 className="text-[24px] font-semibold leading-tight">{displayName}</h2>
              <p className="mt-1 text-[16px]" style={{ color: "#6A6A8A" }}>
                Архитектор · Lvl. {user.level}
              </p>
              {user.bio && (
                <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {user.bio}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metrics.map(({ Icon, n, l }) => (
            <div
              key={l}
              className="rounded-xl p-5"
              style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
            >
              <Icon size={18} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
              <p className="mt-3 text-[24px] font-medium">{n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {l}
              </p>
            </div>
          ))}
        </section>

        {/* Artifacts */}
        <section className="mt-10 rounded-2xl p-6 md:p-8" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
          <h3 className="mb-6 text-[16px] font-semibold uppercase tracking-[0.08em]">Артефакты</h3>
          {artifacts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artifacts.map((a) => (
                <ArtifactMiniCard key={a.id} a={a} tcUsdPrice={tcPrice} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[14px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              У пользователя пока нет артефактов
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
