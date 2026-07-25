"use client"

import { use } from "react"
import { PageLoader } from "@/components/osgard-loader"
import dynamic from "next/dynamic"

const IntegrationsDetailView = dynamic(
  () => import("@/components/integrations-detail-view").then((m) => m.IntegrationsDetailView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const integrationId = id === "new" ? "new" : Number(id)
  return <IntegrationsDetailView id={integrationId} />
}
