"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const BillingDashboardView = dynamic(
  () => import("@/components/billing-dashboard-view").then((m) => m.BillingDashboardView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function AdminBillingPage() {
  return <BillingDashboardView />
}
