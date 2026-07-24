"use client"

/* ================================================================
   Премиум-иконки для лендинга — тонкие golden-line SVG (24x24),
   единый визуальный язык с существующими card-avatar/value-icon
   (thin stroke, rounded caps, золотой градиент + свечение).
   ================================================================ */

import { useId, type ReactNode } from "react"

interface GoldIconProps {
  size?: number
  className?: string
  children: (strokeUrl: string) => ReactNode
}

function GoldIcon({ size = 28, className = "", children }: GoldIconProps) {
  const gradientId = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`eg-icon-svg ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--eg-gold-1)" />
          <stop offset="55%" stopColor="var(--eg-gold-2)" />
          <stop offset="100%" stopColor="var(--eg-gold-3)" />
        </linearGradient>
      </defs>
      {children(`url(#${gradientId})`)}
    </svg>
  )
}

/* ── «Как это работает» ── */

export function IconIdea({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M12 3v3M12 18v3M4.5 12h3M16.5 12h3M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.2" stroke={c} strokeWidth={1.4} />
        </>
      )}
    </GoldIcon>
  )
}

export function IconCreate({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M5 19L17 7" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M15 3l1.2 2.4L18.5 6.5l-2.3 1.1L15 10l-1.2-2.4L11.5 6.5l2.3-1.1L15 3z" stroke={c} strokeWidth={1.3} strokeLinejoin="round" />
          <circle cx="6" cy="18" r="1.4" fill={c} stroke="none" />
        </>
      )}
    </GoldIcon>
  )
}

export function IconLegend({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M4 17l1.6-8 4 4.5L12 6l2.4 7.5 4-4.5L20 17H4z" stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M4 20h16" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
    </GoldIcon>
  )
}

/* ── «Примеры проектов» ── */

export function IconMarket({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M4 8l1-4h14l1 4" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8z" stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M9 12a3 3 0 006 0" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
    </GoldIcon>
  )
}

export function IconDialogue({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M8 4h9a3 3 0 013 3v5a3 3 0 01-3 3h-1l-3 3v-3H8a3 3 0 01-3-3V7a3 3 0 013-3z" stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M6 18a3 3 0 01-2-1" stroke={c} strokeWidth={1.4} strokeLinecap="round" opacity={0.6} />
        </>
      )}
    </GoldIcon>
  )
}

export function IconDashboard({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <rect x="3.5" y="12" width="4" height="8" rx="1" stroke={c} strokeWidth={1.4} />
          <rect x="10" y="7" width="4" height="13" rx="1" stroke={c} strokeWidth={1.4} />
          <rect x="16.5" y="3.5" width="4" height="16.5" rx="1" stroke={c} strokeWidth={1.4} />
        </>
      )}
    </GoldIcon>
  )
}

export function IconVPN({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M9 12.2l2 2 4-4.4" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </GoldIcon>
  )
}

export function IconSocial({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <rect x="4" y="5" width="16" height="6" rx="2" stroke={c} strokeWidth={1.4} />
          <rect x="4" y="13" width="16" height="6" rx="2" stroke={c} strokeWidth={1.4} opacity={0.55} />
          <circle cx="8" cy="8" r="1.3" fill={c} stroke="none" />
          <path d="M11.5 8h5" stroke={c} strokeWidth={1.3} strokeLinecap="round" />
          <path d="M16.2 15.6c-.9-.8-2.2-.3-2.2.8 0 .9 1 1.7 2.2 2.6 1.2-.9 2.2-1.7 2.2-2.6 0-1.1-1.3-1.6-2.2-.8z" stroke={c} strokeWidth={1.1} strokeLinejoin="round" />
        </>
      )}
    </GoldIcon>
  )
}

/* ── «Сообщество» ── */

export function IconCommunity({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <circle cx="12" cy="8" r="3" stroke={c} strokeWidth={1.4} />
          <circle cx="5" cy="16" r="2.2" stroke={c} strokeWidth={1.4} />
          <circle cx="19" cy="16" r="2.2" stroke={c} strokeWidth={1.4} />
          <path d="M8.5 10.5L6 14M15.5 10.5L18 14M9.2 17h5.6" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
    </GoldIcon>
  )
}

/* ── «Экономика артефактов»: Trade / Earn / Invest ── */

export function IconTrade({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M4 8h13M17 8l-3-3M17 8l-3 3" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 16H7M7 16l3-3M7 16l3 3" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </GoldIcon>
  )
}

export function IconEarn({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <ellipse cx="12" cy="6" rx="7" ry="2.6" stroke={c} strokeWidth={1.4} />
          <path d="M5 6v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M5 11v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
    </GoldIcon>
  )
}

export function IconInvest({ size }: { size?: number }) {
  return (
    <GoldIcon size={size}>
      {(c) => (
        <>
          <path d="M4 19V9M9.5 19V13M15 19V6M20 19V10" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M4 9l5.5-4L15 8l5-5" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 3h4v4" stroke={c} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </GoldIcon>
  )
}
