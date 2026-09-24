import { ImageResponse } from "next/og"
import { getBlueprint } from "@/lib/blueprint-store"

export const runtime = "nodejs"
export const alt = "OSGARD Mission Replay"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const blueprint = getBlueprint(id)
  const title = blueprint?.app || "Mission Replay"
  const score = blueprint?.quality.score ?? 0
  const preset = blueprint?.preset || "futuristic"
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "58px 72px", color: "#ecfeff", background: "#061018", fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(circle at 78% 25%, rgba(100,217,232,.22), transparent 34%), linear-gradient(135deg, rgba(255,255,255,.04), transparent 45%)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "22px", letterSpacing: "5px", color: "#64d9e8" }}>OSGARD / MISSION REPLAY <span style={{ color: "#86efac", fontSize: "16px", letterSpacing: "2px" }}>VERIFIED</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px", position: "relative" }}><div style={{ display: "flex", fontSize: "72px", lineHeight: 1, fontWeight: 700, maxWidth: "900px" }}>{title}</div><div style={{ display: "flex", gap: "18px", fontSize: "24px", color: "#9bb8c1" }}><span>{blueprint?.productType || "product"}</span><span>·</span><span>{preset} DNA</span><span>·</span><span>blueprint quality</span></div></div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", position: "relative" }}><div style={{ display: "flex", flexDirection: "column", gap: "8px", color: "#7f9aa3", fontSize: "19px" }}>A product direction assembled in AI Cofounder<div style={{ display: "flex", color: "#64d9e8", fontSize: "17px", letterSpacing: "3px" }}>OSGARDNEWWORLD.COM</div></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><div style={{ display: "flex", color: "#f5c451", fontSize: "86px", lineHeight: 1, fontWeight: 700 }}>{score}</div><div style={{ display: "flex", color: "#9bb8c1", fontSize: "18px", letterSpacing: "2px" }}>QUALITY SCORE</div></div></div>
    </div>,
    { ...size },
  )
}
