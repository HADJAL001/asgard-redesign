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
    <div className="flex min-h-screen flex-col bg-[#10181d]">
      <Navbar />
      <div className="platform-map-boot platform-map-space relative flex-1 overflow-hidden">
        <div className="platform-star-layer platform-star-layer--far" aria-hidden="true" />
        <div className="platform-star-layer platform-star-layer--mid" aria-hidden="true" />
        <div className="platform-star-layer platform-star-layer--near" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex flex-col items-center gap-1 text-center px-4">
          <p className="platform-map-kicker">OSGARD // LIVE ATLAS</p>
          <h1 className="text-lg font-semibold tracking-wide text-white sm:text-xl">Карта платформы</h1>
          <p className="text-xs text-[#9eb2bc] sm:text-sm">Нажмите на точку, чтобы перейти в раздел</p>
        </div>
        <div className="absolute inset-0 z-[1]">
          <Suspense fallback={null}>
            <PlatformGlobeScene sections={sections} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
