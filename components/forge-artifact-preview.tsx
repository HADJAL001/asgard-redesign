"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Float, Sparkles } from "@react-three/drei"
import { AdditiveBlending, Group } from "three"
import { useRef } from "react"
import type { ArtifactType } from "@/lib/economy"

function Artifact({ type }: { type: ArtifactType }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => { if (ref.current) { ref.current.rotation.y = clock.elapsedTime * .42; ref.current.rotation.x = Math.sin(clock.elapsedTime * .6) * .12 } })
  const crystal = type === "crystal", shield = type === "shield", neural = type === "neural", color = crystal ? "#77dcff" : "#f5c451"
  return <Float speed={1.4} rotationIntensity={.15} floatIntensity={.65}><group ref={ref}>
    {crystal ? <mesh><octahedronGeometry args={[1.05, 2]} /><meshStandardMaterial color="#77dcff" emissive="#167fa8" emissiveIntensity={1.1} metalness={.86} roughness={.12} /></mesh> : shield ? <mesh scale={[.85,1.18,.32]}><dodecahedronGeometry args={[.92,1]} /><meshStandardMaterial color="#a89968" emissive="#654916" emissiveIntensity={.55} metalness={.9} roughness={.17} /></mesh> : neural ? <mesh><icosahedronGeometry args={[.96,3]} /><meshStandardMaterial color="#d7ae57" emissive="#8b5e16" emissiveIntensity={1.15} metalness={.78} roughness={.16} /></mesh> : <mesh rotation={[0,0,Math.PI/4]} scale={[.72,1.32,.24]}><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="#f5c451" emissive="#8b5e16" emissiveIntensity={.75} metalness={.9} roughness={.14} /></mesh>}
    <mesh scale={1.28}><icosahedronGeometry args={[.96,2]} /><meshBasicMaterial color={color} wireframe transparent opacity={.12} blending={AdditiveBlending} /></mesh><Sparkles count={52} scale={3.4} size={1.8} speed={.28} color={crystal ? "#bdf3ff" : "#ffe6a0"} />
  </group></Float>
}

export function ForgeArtifactPreview({ type }: { type: ArtifactType }) {
  return <div className="forge-artifact-preview" aria-label="3D preview of selected artifact"><Canvas camera={{ position:[0,0,4.8], fov:38 }} dpr={[1,1.5]} gl={{ alpha:true, antialias:true }}><ambientLight intensity={.28} /><pointLight position={[3,3,4]} intensity={22} color="#fff1c4" /><pointLight position={[-3,-1,2]} intensity={9} color="#2aaed5" /><Artifact type={type} /></Canvas></div>
}
