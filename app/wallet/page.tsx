"use client"

import dynamic from "next/dynamic"

const WalletView = dynamic(
  () => import("@/components/wallet-view").then((m) => m.WalletView),
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
  return <WalletView />
}
