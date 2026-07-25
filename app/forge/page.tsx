"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ForgeView = dynamic(
  () => import("@/components/forge-view").then((m) => m.ForgeView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function ForgePage() {
  return <ForgeView />
}
