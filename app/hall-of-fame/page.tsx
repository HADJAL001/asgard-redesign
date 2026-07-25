"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const HallOfFameView = dynamic(
  () => import("@/components/hall-of-fame-view").then((m) => m.HallOfFameView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function Page() {
  return <HallOfFameView />
}
