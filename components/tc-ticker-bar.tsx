"use client"

import Link from "next/link"
import { TrendingUp, TrendingDown, Infinity as InfinityIcon } from "lucide-react"
import { useOsgard } from "./osgard-store"
import { UP, DOWN, TC_ACCENT, fmtCompactUSD } from "@/lib/tc-market"

/** Slim global marquee: live TC/USD rate + 24h & 30d change + macro stats. */
export function TCTickerBar() {
  const { tcPrice, change24h, changeMonth, marketCapUSD, volume24hTC, circulatingTC } = useOsgard()

  const items = [
    {
      label: "TimeCoin",
      value: `$${tcPrice.toFixed(2)}`,
      change: change24h,
      suffix: "24ч",
      infinity: true,
    },
    { label: "За месяц", change: changeMonth, suffix: "30д" },
    { label: "Капитализация", value: fmtCompactUSD(marketCapUSD) },
    { label: "Объём 24ч", value: `${Math.round(volume24hTC).toLocaleString("ru-RU")} ∞` },
    { label: "В обороте", value: `${Math.round(circulatingTC).toLocaleString("ru-RU")} ∞` },
  ]

  // duplicate for a seamless marquee loop
  const loop = [...items, ...items, ...items]

  return (
    <Link
      href="/exchange"
      className="block overflow-hidden border-b"
      style={{ backgroundColor: "#07070C", borderColor: "#1C1C2A" }}
      aria-label={`Курс TimeCoin: $${tcPrice.toFixed(2)}, изменение за 24 часа ${change24h.toFixed(1)}%`}
    >
      <div className="flex whitespace-nowrap py-1.5">
        <div className="osgard-ticker flex shrink-0">
          {loop.map((it, i) => {
            const up = (it.change ?? 0) >= 0
            return (
              <span key={i} className="mx-5 inline-flex items-center gap-1.5 text-[12px]">
                {it.infinity && (
                  <InfinityIcon size={13} strokeWidth={2} style={{ color: TC_ACCENT }} aria-hidden="true" />
                )}
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{it.label}</span>
                {it.value && (
                  <span className="font-medium" style={{ color: "#FFFFFF" }}>
                    {it.value}
                  </span>
                )}
                {typeof it.change === "number" && (
                  <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: up ? UP : DOWN }}>
                    {up ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                    {up ? "+" : ""}
                    {it.change.toFixed(1)}%
                    {it.suffix ? <span style={{ color: "rgba(255,255,255,0.35)" }}> {it.suffix}</span> : null}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      </div>
    </Link>
  )
}
