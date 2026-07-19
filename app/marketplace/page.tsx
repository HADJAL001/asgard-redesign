"use client"

import dynamic from "next/dynamic"

const MarketplaceView = dynamic(
  () => import("@/components/marketplace-view").then((m) => m.MarketplaceView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function MarketplacePage() {
  return <MarketplaceView />
}
