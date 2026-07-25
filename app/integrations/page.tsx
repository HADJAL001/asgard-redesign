"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const IntegrationsView = dynamic(
  () => import("@/components/integrations-view").then((m) => m.IntegrationsView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function IntegrationsPage() {
  return <IntegrationsView />
}
