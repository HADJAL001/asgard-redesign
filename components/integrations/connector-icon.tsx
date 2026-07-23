"use client"

/* Сопоставление строкового поля ConnectorPublic.icon (см. connector-registry.ts) с иконками lucide-react. */

import { CreditCard, Send, MessageSquare, MessageCircle, Mail, GitFork, Book, Plug, type LucideIcon } from "lucide-react"

const ICON_MAP: Record<string, LucideIcon> = {
  "credit-card": CreditCard,
  send: Send,
  "message-square": MessageSquare,
  "message-circle": MessageCircle,
  mail: Mail,
  github: GitFork,
  book: Book,
  plug: Plug,
}

interface ConnectorIconProps {
  icon: string
  size?: number
  color?: string
}

export function ConnectorIcon({ icon, size = 20, color }: ConnectorIconProps) {
  const Icon = ICON_MAP[icon] ?? Plug
  return <Icon size={size} strokeWidth={1.5} style={{ color }} aria-hidden="true" />
}
