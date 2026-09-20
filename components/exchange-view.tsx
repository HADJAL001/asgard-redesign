"use client"

import Link from "next/link"
import { Boxes, TrendingUp } from "lucide-react"
import { Navbar } from "./navbar"
import { PremiumBackground } from "./premium-bg"
import { SectionHelp } from "./section-help"
import { TCMarketPanel } from "./tc-market-panel"

const ACCENT = "#d7ae57"
const BORDER = "#30424b"

export function ExchangeView() {
  return (
    <div className="exchange-floor world-exchange eg-page relative min-h-screen overflow-hidden font-sans text-white">
      <PremiumBackground variant="coins" />
      <Navbar />
      <SectionHelp
        title="OSGARD Exchange"
        what="Exchange is the live TimeCoin market. Credits cannot be exchanged: they are used for activity and generations."
        goals={[
          { goal: "Buy or sell TimeCoin", steps: ["Choose Buy or Sell", "Enter the amount", "Confirm the market action"] },
          { goal: "Trade artifacts", steps: ["Open Marketplace", "Choose a listed artifact", "Complete the deal in TimeCoin"] },
        ]}
        tour={[
          { title: "TimeCoin market", text: "Market data, reserve status, and buy or sell actions are available below." },
          { title: "Artifact marketplace", text: "Artifacts are traded on Marketplace only, so listings and ownership stay verifiable." },
        ]}
      />

      <main className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
              <TrendingUp size={26} strokeWidth={1.75} style={{ color: ACCENT }} aria-hidden="true" />
              OSGARD Exchange
            </h1>
            <p className="mt-1 text-[15px] text-white/50">TimeCoin market. Artifact listings live on Marketplace.</p>
          </div>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium"
            style={{ border: `1px solid ${BORDER}`, color: ACCENT }}
          >
            <Boxes size={16} strokeWidth={1.75} aria-hidden="true" />
            Open Marketplace
          </Link>
        </div>
        <TCMarketPanel />
      </main>
    </div>
  )
}
