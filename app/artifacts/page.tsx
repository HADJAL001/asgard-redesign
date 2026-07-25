"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ArtifactsView = dynamic(
  () => import("@/components/artifacts-view").then((m) => m.ArtifactsView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function ArtifactsPage() {
  return <ArtifactsView />
}
