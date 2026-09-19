import type { ProjectRank } from "@/lib/store/osgard-store"

export type VibecoderRankKey = "prompt_apprentice" | "code_whisperer" | "vibe_architect" | "osgard_legend"

export type VibecoderRankPresentation = {
  key: VibecoderRankKey
  label: string
  color: string
  glow: string
}

export const VIBECODER_RANKS: Record<VibecoderRankKey, VibecoderRankPresentation> = {
  prompt_apprentice: { key: "prompt_apprentice", label: "Prompt Apprentice", color: "#7DD3FC", glow: "rgba(125, 211, 252, 0.34)" },
  code_whisperer: { key: "code_whisperer", label: "Code Whisperer", color: "#C4B5FD", glow: "rgba(196, 181, 253, 0.34)" },
  vibe_architect: { key: "vibe_architect", label: "Vibe Architect", color: "#FCD34D", glow: "rgba(252, 211, 77, 0.36)" },
  osgard_legend: { key: "osgard_legend", label: "OSGARD Legend", color: "#FB7185", glow: "rgba(251, 113, 133, 0.36)" },
}

const ORDERED_RANKS: VibecoderRankKey[] = ["osgard_legend", "vibe_architect", "code_whisperer", "prompt_apprentice"]

export function getActiveVibecoderRank(projectRanks: ProjectRank[]): VibecoderRankPresentation | null {
  const achieved = new Set(projectRanks.filter((rank) => rank.achieved).map((rank) => rank.key))
  const key = ORDERED_RANKS.find((candidate) => achieved.has(candidate))
  return key ? VIBECODER_RANKS[key] : null
}
