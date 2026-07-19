"use client"

import dynamic from "next/dynamic"

const HallOfFameView = dynamic(
  () => import("@/components/hall-of-fame-view").then((m) => m.HallOfFameView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function Page() {
  return <HallOfFameView />
}
