"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const PricingView = dynamic(
  () => import("@/components/pricing-view").then((m) => m.PricingView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function PricingPage() {
  return <PricingView />
}
