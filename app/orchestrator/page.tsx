"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const OrchestratorView = dynamic(
  () => import("@/components/orchestrator-view").then((m) => m.OrchestratorView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function OrchestratorPage() {
  return <OrchestratorView />
}
