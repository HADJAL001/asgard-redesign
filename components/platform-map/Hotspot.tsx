"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { AdditiveBlending, Group, Mesh, Vector3 } from "three"
import type { PlatformHotspot } from "./hotspots"

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
}

type HotspotProps = { hotspot: PlatformHotspot; radius: number; occludeRef: RefObject<Mesh | null>; delayMs: number; reducedMotion: boolean }

export function Hotspot({ hotspot, radius, occludeRef, delayMs, reducedMotion }: HotspotProps) {
  const router = useRouter()
  const groupRef = useRef<Group>(null)
  const markerRef = useRef<Mesh>(null)
  const [isActive, setIsActive] = useState(false)
  const position = useMemo(() => latLonToVector3(hotspot.lat, hotspot.lon, radius), [hotspot.lat, hotspot.lon, radius])
  useEffect(() => {
    if (!groupRef.current) return
    const normal = position.clone().normalize()
    groupRef.current.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), normal)
  }, [position])
  useFrame(({ clock }) => {
    if (!reducedMotion && markerRef.current) markerRef.current.rotation.y = clock.elapsedTime * .35
  })
  const open = () => router.push(hotspot.href)
  const Icon = hotspot.Icon
  return (
    <group ref={groupRef} position={position} onPointerEnter={() => setIsActive(true)} onPointerLeave={() => setIsActive(false)} onClick={open}>
      <mesh position={[0, .175, 0]}>
        <cylinderGeometry args={[.002, .002, .35, 6]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={.3} blending={AdditiveBlending} />
      </mesh>
      <mesh ref={markerRef} onClick={(event) => { event.stopPropagation(); open() }}>
        <sphereGeometry args={[.14, 24, 24]} />
        <meshBasicMaterial color={hotspot.color} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[.17, .2, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={.92} depthWrite={false} />
      </mesh>
      <Html center className="platform-hotspot-rise" style={{ animationDelay: `${delayMs}ms`, pointerEvents: "none" }}>
        <div className="platform-hotspot-badge" style={{ "--hotspot-color": hotspot.color } as React.CSSProperties}><Icon size={15} strokeWidth={2.2} /><span>{hotspot.label}</span></div>
        {isActive ? <div className="platform-portal-preview" role="status"><span><Icon size={12} /> ПОРТАЛ</span><strong>{hotspot.label}</strong><p>{hotspot.description}</p></div> : null}
      </Html>
    </group>
  )
}
