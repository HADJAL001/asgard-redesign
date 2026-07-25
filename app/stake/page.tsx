"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const StakeView = dynamic(
  () => import("@/components/stake-view").then((m) => m.StakeView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function StakePage() {
  return <StakeView />
}
