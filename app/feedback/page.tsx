"use client"

import dynamic from "next/dynamic"

const FeedbackView = dynamic(() => import("@/components/feedback-view").then((m) => m.FeedbackView), {
  loading: () => (
    <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
      Загрузка…
    </div>
  ),
  ssr: false,
})

export default function FeedbackPage() {
  return <FeedbackView />
}
