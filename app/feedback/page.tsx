"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const FeedbackView = dynamic(() => import("@/components/feedback-view").then((m) => m.FeedbackView), {
  loading: () => <PageLoader />,
  ssr: false,
})

export default function FeedbackPage() {
  return <FeedbackView />
}
