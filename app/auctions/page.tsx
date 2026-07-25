"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const AuctionsView = dynamic(
  () => import("@/components/auctions-view").then((m) => m.AuctionsView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function AuctionsPage() {
  return <AuctionsView />
}
