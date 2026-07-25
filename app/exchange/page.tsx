"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ExchangeView = dynamic(
  () => import("@/components/exchange-view").then((m) => m.ExchangeView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function ExchangePage() {
  return <ExchangeView />
}
