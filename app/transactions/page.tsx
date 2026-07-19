"use client"

import dynamic from "next/dynamic"

const TransactionsView = dynamic(
  () => import("@/components/transactions-view").then((m) => m.TransactionsView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function TransactionsPage() {
  return <TransactionsView />
}
