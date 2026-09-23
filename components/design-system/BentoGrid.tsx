"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"

export type BentoItem = {
  id: string
  title: string
  eyebrow?: string
  description?: string
  children?: ReactNode
  span?: "wide" | "tall" | "hero" | "standard"
}

const spanClass = {
  hero: "md:col-span-8 md:row-span-2",
  wide: "md:col-span-6",
  tall: "md:col-span-4 md:row-span-2",
  standard: "md:col-span-4",
} as const

export function BentoGrid({ items, className = "" }: { items: BentoItem[]; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <div className={`grid auto-rows-[minmax(168px,auto)] grid-cols-1 gap-4 md:grid-cols-12 ${className}`}>
      {items.map((item, index) => (
        <motion.article
          key={item.id}
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.42, delay: reduced ? 0 : Math.min(index * 0.045, 0.24), ease: "easeOut" }}
          className={`relative overflow-hidden border border-cyan-200/15 bg-slate-950/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_18px_60px_rgba(0,0,0,.22)] backdrop-blur-xl [clip-path:polygon(0_12px,12px_0,calc(100%-12px)_0,100%_12px,100%_calc(100%-12px),calc(100%-12px)_100%,12px_100%,0_calc(100%-12px))] ${spanClass[item.span ?? "standard"]}`}
        >
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
          {item.eyebrow && <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-200/65">{item.eyebrow}</p>}
          <h3 className="font-[var(--ds-font-display)] text-xl font-semibold tracking-tight text-white">{item.title}</h3>
          {item.description && <p className="mt-2 max-w-prose text-sm leading-6 text-slate-300/75">{item.description}</p>}
          {item.children}
        </motion.article>
      ))}
    </div>
  )
}
