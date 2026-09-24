import { Atom, BrainCircuit, Clock3, GitBranch } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Layer = { name: string; detail: string; icon: LucideIcon; tone: string }
const layers: Layer[] = [
  { name: "Atomic", detail: "Факты и события", icon: Atom, tone: "atomic" },
  { name: "Semantic", detail: "Связи и смысл", icon: BrainCircuit, tone: "semantic" },
  { name: "Episodic", detail: "История решений", icon: Clock3, tone: "episodic" },
  { name: "Procedural", detail: "Проверенные playbook", icon: GitBranch, tone: "procedural" },
]

export function MemoryLayerRail({ counts = {} }: { counts?: Partial<Record<"Atomic" | "Semantic" | "Episodic" | "Procedural", number>> }) {
  return <section className="ds-memory-rail ds-glass ds-hull" aria-label="Слои памяти AI Cofounder"><header><span className="ds-utility">MEMORY FABRIC / ORBITAL MAP</span><h2 className="ds-display">Память продукта</h2><p>Каждое решение получает источник, связь и проверяемую историю.</p></header><div className="ds-memory-orbit" role="list" aria-label="Четыре слоя памяти"><div className="ds-memory-orbit-core" aria-hidden="true"><span>AI</span><small>CORE</small></div>{layers.map(({ name, detail, icon: Icon, tone }, index) => <div key={name} role="listitem" tabIndex={0} className={`ds-memory-layer ds-memory-${tone}`} data-orbit-index={index}><span className="ds-memory-link" aria-hidden="true" /><span className="ds-memory-icon"><Icon size={18} aria-hidden="true" /></span><span className="ds-memory-layer-copy"><strong>{name}</strong><small>{detail}</small></span><b>{counts[name as keyof typeof counts] ?? 0}</b></div>)}</div></section>
}
