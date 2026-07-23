"use client"

import dynamic from "next/dynamic"

const BillingDashboardView = dynamic(
  () => import("@/components/billing-dashboard-view").then((m) => m.BillingDashboardView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function AdminBillingPage() {
  return <BillingDashboardView />
}
