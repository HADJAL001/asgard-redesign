"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const MarketplaceView = dynamic(
  () => import("@/components/marketplace-view").then((m) => m.MarketplaceView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function MarketplacePage() {
  return <MarketplaceView />
}
