"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const AdminView = dynamic(
  () => import("@/components/admin-view").then((m) => m.AdminView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function AdminPage() {
  return <AdminView />
}
