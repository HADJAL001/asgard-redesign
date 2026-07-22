"use client"

import dynamic from "next/dynamic"

const PricingView = dynamic(
  () => import("@/components/pricing-view").then((m) => m.PricingView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  },
)

export default function PricingPage() {
  return <PricingView />
}
