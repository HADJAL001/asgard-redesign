"use client"

import { useEffect, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import type { Group } from "three"

function Companion({ level, active }: { level: number; active: boolean }) {
  const core = useRef<Group>(null)
  const ring = useRef<Group>(null)
  useFrame(({ clock }, delta) => {
    if (core.current) {
      core.current.position.y = Math.sin(clock.elapsedTime * 1.35) * 0.1
      core.current.rotation.y += delta * (active ? 1.7 : 0.32)
    }
    if (ring.current) ring.current.rotation.z += delta * (active ? 1.9 : 0.35)
  })
  const color = active ? "#7ce8d8" : "#d7ae57"
  return <group ref={core} position={[0, 0.15, 0]}><mesh><icosahedronGeometry args={[0.75, 2]} /><meshStandardMaterial color="#172b35" metalness={0.75} roughness={0.2} emissive={color} emissiveIntensity={active ? 1.4 : 0.4} /></mesh><group ref={ring} rotation={[Math.PI / 2, 0, 0]}><mesh><torusGeometry args={[1.04, 0.035, 12, 48]} /><meshBasicMaterial color={color} transparent opacity={0.9} /></mesh></group><mesh position={[0, 0, 0.76]}><sphereGeometry args={[0.12 + Math.min(level, 10) * 0.006, 20, 16]} /><meshBasicMaterial color={color} /></mesh></group>
}

function Scene({ level, active }: { level: number; active: boolean }) {
  return <Canvas camera={{ position: [0, 1.2, 4.1], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true }}><color attach="background" args={["#10181d"]} /><ambientLight intensity={0.7} /><pointLight position={[2, 3, 3]} color={active ? "#7ce8d8" : "#d7ae57"} intensity={20} distance={6} /><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.82, 0]}><circleGeometry args={[1.72, 48]} /><meshStandardMaterial color="#17242a" metalness={0.8} roughness={0.25} /></mesh><Companion level={level} active={active} /></Canvas>
}

export function TwinTrainingScene({ level, training }: { level: number; training: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(media.matches); sync(); media.addEventListener("change", sync); return () => media.removeEventListener("change", sync) }, [])
  return <div className="h-48 overflow-hidden rounded-lg" aria-hidden="true" style={{ border: "1px solid #30424b" }}><Scene level={level} active={training && !reducedMotion} /></div>
}
