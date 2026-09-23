"use client"

import { useMemo, useRef } from "react"
import { Html, Line } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { Group, MathUtils } from "three"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE } from "./node-types"

const CARD_POSITIONS: [number, number, number][] = [[0, 1.56, 0], [1.58, 0.58, 0.08], [1.06, -1.2, 0.12], [-1.28, -1.02, 0.08], [-1.62, 0.48, 0]]

function GlobeCore() {
  const globe = useRef<Group>(null)
  useFrame(({ clock, pointer }) => {
    if (!globe.current) return
    globe.current.rotation.y = clock.elapsedTime * 0.075 + pointer.x * 0.08
    globe.current.rotation.x = MathUtils.lerp(globe.current.rotation.x, pointer.y * 0.08, 0.04)
  })
  return <group ref={globe}><mesh><sphereGeometry args={[0.92, 48, 32]} /><meshStandardMaterial color="#0b263d" emissive="#0c4f72" emissiveIntensity={0.16} metalness={0.72} roughness={0.5} transparent opacity={0.9} /></mesh><mesh scale={1.012}><sphereGeometry args={[0.92, 24, 16]} /><meshBasicMaterial color="#57c8f4" wireframe transparent opacity={0.18} /></mesh><mesh rotation={[Math.PI / 2, 0.16, 0]} scale={1.025}><torusGeometry args={[0.72, 0.006, 6, 96]} /><meshBasicMaterial color="#78d8ff" transparent opacity={0.5} /></mesh><mesh rotation={[Math.PI / 2, -0.28, 0]} scale={1.025}><torusGeometry args={[0.5, 0.004, 6, 96]} /><meshBasicMaterial color="#4aa9db" transparent opacity={0.38} /></mesh><mesh rotation={[0.18, 0, 0.55]} scale={1.025}><torusGeometry args={[0.86, 0.004, 6, 96]} /><meshBasicMaterial color="#4aa9db" transparent opacity={0.3} /></mesh><pointLight color="#4cc8ff" intensity={0.65} distance={3.2} /></group>
}

function DataArc({ index, color }: { index: number; color: string }) {
  const points = useMemo(() => { const angle = (index / 4) * Math.PI * 2 + 0.22; const radius = 1.42 + (index % 2) * 0.16; const start = [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.54, -0.12] as [number, number, number]; const end = [Math.cos(angle + 1.42) * radius, Math.sin(angle + 1.42) * radius * 0.54, -0.12] as [number, number, number]; const mid = [(start[0] + end[0]) * 0.22, (start[1] + end[1]) * 0.22 + 0.2, 0.08] as [number, number, number]; return [start, mid, end] }, [index])
  return <Line points={points} color={color} lineWidth={0.8} transparent opacity={0.68} />
}

function NodeCard({ label, color, position, index }: { label: string; color: string; position: [number, number, number]; index: number }) {
  return <Html position={position} center distanceFactor={5.2} zIndexRange={[2, 4]}><div className="orch-deck-card" style={{ "--deck-color": color } as React.CSSProperties}><i className="orch-deck-card__dot" /><span>{label}</span><em>{String(index + 1).padStart(2, "0")}</em></div></Html>
}

function DeckScene() {
  const { t } = useTranslation(); const nodes = ORCHESTRATOR_PALETTE.slice(0, 5); const deck = useRef<Group>(null)
  useFrame(({ clock }) => { if (deck.current) deck.current.rotation.z = Math.sin(clock.elapsedTime * 0.18) * 0.012 })
  return <group ref={deck} scale={1.08}><GlobeCore />{nodes.map((item, index) => <DataArc key={`arc-${item.type}`} index={index} color={item.color} />)}{nodes.map((item, index) => <NodeCard key={item.type} label={t(item.labelKey)} color={item.color} position={CARD_POSITIONS[index]} index={index} />)}<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.04, 0]}><torusGeometry args={[1.12, 0.012, 8, 96]} /><meshBasicMaterial color="#51c7ef" transparent opacity={0.52} /></mesh><Html position={[0, 0, 0.95]} center distanceFactor={5.2} zIndexRange={[3, 5]}><div className="orch-deck-core"><strong>OSGARD</strong><span>AI ORCHESTRATOR</span></div></Html></group>
}

export function OrchestratorRadialShowcase() {
  return <div className="orch-3d" aria-label="Интерактивная схема цепочки AI-моделей"><Canvas camera={{ position: [0, 0, 5.35], fov: 38 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}><ambientLight intensity={0.56} color="#8bb4c9" /><directionalLight position={[2, 3, 4]} intensity={1.1} color="#d8f4ff" /><DeckScene /></Canvas></div>
}
