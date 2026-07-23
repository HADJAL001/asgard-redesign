"use client"

import { useId, type CSSProperties, type ComponentType } from "react"

export interface NodeIconProps {
  size?: number
  strokeWidth?: number
  color?: string
  style?: CSSProperties
  className?: string
  "aria-hidden"?: boolean | "true" | "false"
}

type Variant = "claude" | "deepseek" | "grok" | "prompt_template" | "service_call"

const GRADIENT_STOPS: Record<Variant, [string, string, string]> = {
  claude: ["#67E8F9", "#00D4FF", "#0369A1"],
  deepseek: ["#86EFAC", "#4ADE80", "#047857"],
  grok: ["#FDE68A", "#FBBF24", "#B45309"],
  prompt_template: ["#E2E8F0", "#94A3B8", "#334155"],
  service_call: ["#FCA5A5", "#F87171", "#7F1D1D"],
}

function Glyph({ variant }: { variant: Variant }) {
  switch (variant) {
    case "claude":
      return (
        <path
          d="M12 5.2 L16.9 12 L12 18.8 L7.1 12 Z M12 8.7 L9.5 12 L12 15.3 L14.5 12 Z"
          fill="#fff"
          fillRule="evenodd"
        />
      )
    case "deepseek":
      return (
        <path
          d="M12 5.9 L16.9 8.85 V14.75 L12 17.7 L7.1 14.75 V8.85 Z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      )
    case "grok":
      return <path d="M13.5 4.7 L7.7 13.3 H11.1 L9.8 19.3 L16.9 9.7 H13.1 Z" fill="#fff" />
    case "prompt_template":
      return <path d="M7.3 7.8h9.4M7.3 12h9.4M7.3 16.2h5.7" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    case "service_call":
      return (
        <path
          d="M9.2 7.2 L5.6 12 L9.2 16.8 M14.8 7.2 L18.4 12 L14.8 16.8"
          fill="none"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
  }
}

/** Премиум-бейдж узла оркестратора — градиентная плитка с глянцем и тенью вместо плоской lucide-иконки. */
function NodeIconBadge({ variant, size = 20, style, className }: { variant: Variant } & NodeIconProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const gradId = `nig-${variant}-${rawId}`
  const glossId = `nig-gloss-${rawId}`
  const shadowId = `nig-shadow-${variant}-${rawId}`
  const [light, mid, dark] = GRADIENT_STOPS[variant]

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <radialGradient id={glossId} cx="50%" cy="8%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={shadowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={dark} floodOpacity="0.6" />
        </filter>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6.5" fill={`url(#${gradId})`} filter={`url(#${shadowId})`} />
      <rect x="1.5" y="1.5" width="21" height="21" rx="6.5" fill={`url(#${glossId})`} />
      <rect x="1.5" y="1.5" width="21" height="21" rx="6.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <Glyph variant={variant} />
    </svg>
  )
}

export const PremiumClaudeIcon: ComponentType<NodeIconProps> = (props) => <NodeIconBadge variant="claude" {...props} />
export const PremiumDeepseekIcon: ComponentType<NodeIconProps> = (props) => <NodeIconBadge variant="deepseek" {...props} />
export const PremiumGrokIcon: ComponentType<NodeIconProps> = (props) => <NodeIconBadge variant="grok" {...props} />
export const PremiumTemplateIcon: ComponentType<NodeIconProps> = (props) => <NodeIconBadge variant="prompt_template" {...props} />
export const PremiumServiceCallIcon: ComponentType<NodeIconProps> = (props) => <NodeIconBadge variant="service_call" {...props} />
