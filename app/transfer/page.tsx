"use client"

import dynamic from "next/dynamic"

const TransferView = dynamic(
  () => import("@/components/transfer-view").then((m) => m.TransferView),
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
  return <TransferView />
}
