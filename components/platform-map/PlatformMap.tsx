"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"

import { Navbar } from "@/components/navbar"
import { useAuth } from "@/lib/auth-store"
import { getPlatformSections } from "./hotspots"

const PlatformGlobeScene = dynamic(
  () => import("./PlatformGlobeScene").then((m) => m.PlatformGlobeScene),
  { ssr: false },
)

export function PlatformMap() {
  const { user } = useAuth()
  const sections = getPlatformSections(user?.role === "admin")

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0F]">
      <Navbar />
      <div className="platform-map-boot relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex flex-col items-center gap-1 text-center px-4">
          <h1 className="text-lg font-semibold tracking-wide text-white sm:text-xl">Карта платформы</h1>
          <p className="text-xs text-[#6A6A8A] sm:text-sm">Нажмите на точку, чтобы перейти в раздел</p>
        </div>
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <PlatformGlobeScene sections={sections} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
