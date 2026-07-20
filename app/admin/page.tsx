"use client"

import dynamic from "next/dynamic"

const AdminView = dynamic(
  () => import("@/components/admin-view").then((m) => m.AdminView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function AdminPage() {
  return <AdminView />
}
