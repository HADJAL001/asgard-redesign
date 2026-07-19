"use client"

import dynamic from "next/dynamic"

const StakeView = dynamic(
  () => import("@/components/stake-view").then((m) => m.StakeView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function StakePage() {
  return <StakeView />
}
