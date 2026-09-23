"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Html, RoundedBox } from "@react-three/drei"
import { AdditiveBlending, CatmullRomCurve3, Group, Mesh, Vector3 } from "three"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE } from "./node-types"

const NODE_POSITIONS: [number, number, number][] = [[0, 1.72, 0], [1.78, 0.62, 0.1], [1.18, -1.38, -0.15], [-1.28, -1.3, 0.08], [-1.78, 0.52, -0.1]]

function NodeShape({ index, color }: { index: number; color: string }) {
  const material = <meshStandardMaterial color="#1c2a35" emissive={color} emissiveIntensity={0.12} metalness={0.92} roughness={0.28} />
  if (index === 0) return <RoundedBox args={[0.52, 0.34, 0.18]} radius={0.06} smoothness={3}>{material}</RoundedBox>
  if (index === 1) return <RoundedBox args={[0.42, 0.42, 0.2]} radius={0.05} smoothness={3} rotation={[0.3, 0.2, 0.1]}>{material}</RoundedBox>
  if (index === 2) return <mesh rotation={[0, 0, Math.PI / 4]}>{material}<boxGeometry args={[0.42, 0.42, 0.2]} /></mesh>
  if (index === 3) return <RoundedBox args={[0.52, 0.28, 0.18]} radius={0.05} smoothness={3} rotation={[0.1, 0.2, 0]}>{material}</RoundedBox>
  return <mesh>{material}<cylinderGeometry args={[.22, .22, .16, 8]} /></mesh>
}

function SignalPath({ end, offset }: { end: [number, number, number]; offset: number }) {
  const curve = useMemo(() => new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(end[0] * 0.38, end[1] * 0.2, 0.4), new Vector3(...end)]), [end])
  const pulseRef = useRef<Mesh>(null)
  useFrame(({ clock }) => pulseRef.current?.position.copy(curve.getPointAt((clock.elapsedTime * 0.19 + offset) % 1)))
  return <><mesh><tubeGeometry args={[curve, 28, 0.009, 5, false]} /><meshBasicMaterial color="#74899a" transparent opacity={0.48} /></mesh><mesh ref={pulseRef}><sphereGeometry args={[0.035, 10, 10]} /><meshBasicMaterial color="#d7ae57" /></mesh></>
}

function Core() {
  const ref = useRef<Group>(null)
  useFrame(({ clock, pointer }) => { if (!ref.current) return; ref.current.rotation.x = pointer.y * 0.08; ref.current.rotation.y = clock.elapsedTime * 0.12 + pointer.x * 0.08 })
  return <group ref={ref}><pointLight color="#d7ae57" intensity={1.1} distance={3.5} /><RoundedBox args={[.92, .42, .34]} radius={.1} smoothness={4}><meshStandardMaterial color="#263744" metalness={.94} roughness={.24} /></RoundedBox><mesh position={[0, .23, 0]}><boxGeometry args={[.62, .025, .22]} /><meshBasicMaterial color="#d7ae57" /></mesh><mesh position={[0, 0, .19]}><boxGeometry args={[.58, .22, .012]} /><meshBasicMaterial color="#0a1117" /></mesh></group>
}

function Satellite({ index, label, color, position }: { index: number; label: string; color: string; position: [number, number, number] }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => { if (!ref.current) return; ref.current.rotation.y = clock.elapsedTime * (0.35 + index * 0.04); ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 1.4 + index) * 0.075 })
  return <group ref={ref} position={position}><NodeShape index={index} color={color} /><Html transform distanceFactor={7} center position={[0, -0.43, 0]}><span className="orch-3d-label" style={{ "--node-color": color } as React.CSSProperties}>{label}</span></Html></group>
}

function Constellation() {
  const ref = useRef<Group>(null), { t } = useTranslation(), nodes = ORCHESTRATOR_PALETTE.slice(0, 5)
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.18) * 0.08 })
  return <group ref={ref} scale={1.22}><Core />{nodes.map((item, index) => <SignalPath key={`path-${item.type}`} end={NODE_POSITIONS[index]} offset={index / nodes.length} />)}{nodes.map((item, index) => <Satellite key={item.type} index={index} label={t(item.labelKey)} color={item.color} position={NODE_POSITIONS[index]} />)}</group>
}

export function OrchestratorRadialShowcase() {
  return <div className="orch-3d" aria-label="Интерактивная схема цепочки AI-моделей"><Canvas camera={{ position: [0, 0, 5.1], fov: 40 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}><ambientLight intensity={0.4} color="#7891a5" /><directionalLight position={[2, 3, 4]} intensity={1.4} color="#dcecff" /><Constellation /></Canvas></div>
}
