"use client"

import { motion, useReducedMotion } from "framer-motion"

const nodes = ["Atomic", "Semantic", "Episodic", "Procedural"]

export function OrbitalMemory() {
  const reduced = useReducedMotion()
  return (
    <section className="orbital-memory ds-hull ds-glass" aria-label="Memory Fabric live map">
      <div className="orbital-copy"><span className="ds-utility">LIVE MEMORY MAP</span><h2 className="ds-display">Контекст в движении</h2><p>Система связывает факты, смысл, историю и playbook перед каждым следующим действием.</p></div>
      <div className="orbital-stage" aria-hidden="true">
        <motion.div className="orbital-ring orbital-ring-a" animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }} />
        <motion.div className="orbital-ring orbital-ring-b" animate={reduced ? undefined : { rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
        <div className="orbital-core">AI<br /><small>CORE</small></div>
        {nodes.map((node, index) => <span key={node} className={`orbital-node orbital-node-${index}`}>{node}</span>)}
      </div>
    </section>
  )
}
