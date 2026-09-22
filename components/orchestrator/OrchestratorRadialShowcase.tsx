"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Html, Sparkles } from "@react-three/drei"
import { AdditiveBlending, CatmullRomCurve3, Group, Mesh, Vector3 } from "three"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE } from "./node-types"

const NODE_POSITIONS: [number, number, number][] = [[0, 1.72, 0], [1.78, 0.62, 0.1], [1.18, -1.38, -0.15], [-1.28, -1.3, 0.08], [-1.78, 0.52, -0.1]]

function NodeShape({ index, color }: { index: number; color: string }) {
  const material = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.82} roughness={0.2} />
  if (index === 0) return <mesh>{material}<icosahedronGeometry args={[0.29, 2]} /></mesh>
  if (index === 1) return <mesh rotation={[0.3, 0.2, 0.1]}>{material}<boxGeometry args={[0.46, 0.46, 0.16]} /></mesh>
  if (index === 2) return <mesh>{material}<octahedronGeometry args={[0.31, 0]} /></mesh>
  if (index === 3) return <mesh rotation={[0.1, 0.2, 0]}>{material}<boxGeometry args={[0.48, 0.3, 0.12]} /></mesh>
  return <mesh rotation={[0, 0, Math.PI / 4]}>{material}<torusGeometry args={[0.23, 0.075, 8, 16]} /></mesh>
}

function SignalPath({ end, offset }: { end: [number, number, number]; offset: number }) {
  const curve = useMemo(() => new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(end[0] * 0.38, end[1] * 0.2, 0.4), new Vector3(...end)]), [end])
  const pulseRef = useRef<Mesh>(null)
  useFrame(({ clock }) => pulseRef.current?.position.copy(curve.getPointAt((clock.elapsedTime * 0.19 + offset) % 1)))
  return <><mesh><tubeGeometry args={[curve, 28, 0.014, 6, false]} /><meshBasicMaterial color="#d7ae57" transparent opacity={0.45} /></mesh><mesh ref={pulseRef}><sphereGeometry args={[0.055, 12, 12]} /><meshBasicMaterial color="#fff0ad" blending={AdditiveBlending} /></mesh></>
}

function Core() {
  const ref = useRef<Group>(null)
  useFrame(({ clock, pointer }) => { if (!ref.current) return; ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.09); ref.current.rotation.x = pointer.y * 0.18; ref.current.rotation.y = clock.elapsedTime * 0.33 + pointer.x * 0.18 })
  return <group ref={ref}><pointLight color="#ffcf5d" intensity={4} distance={5} /><mesh><icosahedronGeometry args={[0.48, 3]} /><meshStandardMaterial color="#fff8e8" emissive="#e89e28" emissiveIntensity={2.2} metalness={0.9} roughness={0.18} /></mesh><mesh scale={1.42}><icosahedronGeometry args={[0.48, 2]} /><meshBasicMaterial color="#ffd97e" transparent opacity={0.1} wireframe /></mesh>{[0, 1, 2, 3].map((i) => <mesh key={i} rotation={[Math.PI / 2 + (i - 1.5) * .3, i * .7, 0]}><torusGeometry args={[.86 + i * .2, .008, 8, 96]} /><meshBasicMaterial color={i % 2 ? "#00d9ff" : "#ffb800"} transparent opacity={.42} blending={AdditiveBlending} /></mesh>)}<Sparkles count={200} scale={1.7} size={2} speed={.35} color="#fff0ad" /></group>
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
  return <div className="orch-3d" aria-label="Интерактивная схема цепочки AI-моделей"><Canvas camera={{ position: [0, 0, 5.1], fov: 40 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}><ambientLight intensity={0.18} color="#4d7098" /><pointLight position={[0, 0, 2]} intensity={3.2} distance={8} color="#ffd36b" /><directionalLight position={[2, 3, 4]} intensity={1.15} color="#e7f2ff" /><Constellation /></Canvas></div>
}
