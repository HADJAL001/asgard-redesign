"use client"

import { motion, useReducedMotion } from "framer-motion"

const nodes = [
  { label: "Atomic", className: "orbital-node-0" },
  { label: "Semantic", className: "orbital-node-1" },
  { label: "Episodic", className: "orbital-node-2" },
  { label: "Procedural", className: "orbital-node-3" },
]

export function OrbitalMemory() {
  const reduced = useReducedMotion()
  return (
    <section className="orbital-memory ds-hull ds-glass" aria-label="Memory Fabric live map">
      <div className="orbital-copy"><span className="ds-utility">LIVE MEMORY MAP</span><h2 className="ds-display">Контекст в движении</h2><p>Система связывает факты, смысл, историю и playbook перед каждым следующим действием.</p></div>
      <div className="orbital-stage" aria-hidden="true">
        <motion.div className="orbital-ring orbital-ring-a" animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} />
        <motion.div className="orbital-ring orbital-ring-b" animate={reduced ? undefined : { rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
        <div className="orbital-core">AI<br /><small>CORE</small></div>
        <span className="orbital-dust orbital-dust-a" />
        <span className="orbital-dust orbital-dust-b" />
        {nodes.map(({ label, className }) => (
          <motion.span
            key={label}
            className={`orbital-node ${className}`}
            whileHover={reduced ? undefined : { scale: 1.12, z: 18 }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
          >
            <i className="orbital-node-spark" aria-hidden="true" />
            {label}
          </motion.span>
        ))}
      </div>
    </section>
  )
}
