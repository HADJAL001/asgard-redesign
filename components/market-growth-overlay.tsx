"use client"

import { useMemo, useState } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { TrendingUp } from "lucide-react"

type Range = "1M" | "6M" | "1Y" | "ALL"

const RANGES: { id: Range; label: string; points: number; base: number; growth: number }[] = [
  { id: "1M", label: "1M", points: 22, base: 100, growth: 0.9 },
  { id: "6M", label: "6M", points: 26, base: 92, growth: 1.6 },
  { id: "1Y", label: "1Y", points: 30, base: 78, growth: 2.4 },
  { id: "ALL", label: "ALL", points: 36, base: 40, growth: 4.2 },
]

// Deterministic pseudo-random so SSR and client match.
function seeded(i: number, seed: number) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function buildSeries(range: Range) {
  const cfg = RANGES.find((r) => r.id === range)!
  let value = cfg.base
  const data = []
  for (let i = 0; i < cfg.points; i++) {
    const drift = cfg.growth + (seeded(i, cfg.base) - 0.4) * 3.2
    value = Math.max(20, value + drift)
    data.push({ i, label: `T${i + 1}`, value: Math.round(value * 10) / 10 })
  }
  return data
}

export function MarketGrowthOverlay() {
  const [range, setRange] = useState<Range>("1Y")
  const data = useMemo(() => buildSeries(range), [range])

  const change = useMemo(() => {
    if (data.length < 2) return 0
    const first = data[0].value
    const last = data[data.length - 1].value
    return Math.round(((last - first) / first) * 1000) / 10
  }, [data])

  return (
    <>
      {/* Clickable timeframe buttons over the holographic screen */}
      <div className="pointer-events-auto absolute left-1/2 top-[16%] z-30 flex -translate-x-1/2 gap-2">
        {RANGES.map((r) => {
          const active = range === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={active}
              className="rounded-md border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider backdrop-blur-sm transition-colors"
              style={{
                borderColor: active ? "#00D4FF" : "rgba(74,138,181,0.5)",
                background: active ? "rgba(0,212,255,0.16)" : "rgba(10,14,39,0.5)",
                color: active ? "#8FE6FF" : "#8FC2E0",
              }}
            >
              {r.label}
            </button>
          )
        })}
      </div>

      {/* Growth chart panel — always visible, updates when a timeframe button is clicked */}
      <div className="pointer-events-auto absolute left-1/2 top-[26%] z-30 w-[74%] max-w-2xl -translate-x-1/2">
          <div
            className="rounded-lg border p-4 shadow-2xl backdrop-blur-md"
            style={{ borderColor: "rgba(0,212,255,0.35)", background: "rgba(8,12,32,0.82)" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} strokeWidth={1.75} style={{ color: "#00D4FF" }} />
                <span className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "#8FC2E0" }}>
                  Market Growth · {range}
                </span>
              </div>
              <span
                className="font-mono text-[12px] font-semibold"
                style={{ color: change >= 0 ? "#4ADE80" : "#F87171" }}
              >
                {change >= 0 ? "+" : ""}
                {change}%
              </span>
            </div>

            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#00D4FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={["dataMin - 8", "dataMax + 8"]} />
                  <Tooltip
                    cursor={{ stroke: "rgba(0,212,255,0.4)", strokeWidth: 1 }}
                    contentStyle={{
                      background: "rgba(8,12,32,0.95)",
                      border: "1px solid rgba(0,212,255,0.4)",
                      borderRadius: 8,
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "#8FC2E0" }}
                    itemStyle={{ color: "#8FE6FF" }}
                    formatter={(v) => [`${v}`, "Index"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#00D4FF"
                    strokeWidth={2}
                    fill="url(#marketFill)"
                    animationDuration={700}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
      </div>
    </>
  )
}
