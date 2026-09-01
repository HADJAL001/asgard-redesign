"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const RarestHallView = dynamic(
  () => import("@/components/rarest-hall-view").then((m) => m.RarestHallView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function Page() {
  return <RarestHallView />
}
