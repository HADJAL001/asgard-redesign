"use client"

import { Check, Copy, Share2 } from "lucide-react"
import { useEffect, useState } from "react"
import { track } from "@/lib/analytics"

type ReplayShareButtonProps = { blueprintId: string; revision: number; appName: string }

export function ReplayShareButton({ blueprintId, revision, appName }: ReplayShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "cancelled">("idle")

  useEffect(() => {
    if (status === "idle") return
    const timer = window.setTimeout(() => setStatus("idle"), 2800)
    return () => window.clearTimeout(timer)
  }, [status])

  async function share() {
    const url = `${window.location.origin}/cofounder/replay/${blueprintId}?revision=${revision}`
    const text = `${appName} — verified product direction assembled in OSGARD AI Cofounder.`
    const nativeShare = typeof navigator.share === "function"
    try {
      if (nativeShare) {
        await navigator.share({ title: `${appName} / OSGARD Mission Replay`, text, url })
        setStatus("shared")
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        setStatus("copied")
      }
      track("replay_shared", { blueprintId, revision, channel: nativeShare ? "native" : "clipboard" })
    } catch {
      setStatus("cancelled")
    }
  }

  const label = status === "shared" ? "Replay shared" : status === "copied" ? "Replay link copied" : status === "cancelled" ? "Share cancelled" : "Share replay"
  return (
    <button type="button" className="ds-dialog-secondary ds-focus ds-replay-share" onClick={() => void share()} aria-live="polite">
      {status === "shared" || status === "copied" ? <Check size={15} aria-hidden="true" /> : status === "cancelled" ? <Copy size={15} aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}
      {label}
    </button>
  )
}
