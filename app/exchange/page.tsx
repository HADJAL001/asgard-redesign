"use client"

import dynamic from "next/dynamic"

const ExchangeView = dynamic(
  () => import("@/components/exchange-view").then((m) => m.ExchangeView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function ExchangePage() {
  return <ExchangeView />
}
