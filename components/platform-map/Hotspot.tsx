"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, Object3D, Sprite, Vector3 } from "three"
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
  const spriteRef = useRef<Sprite>(null)
  const pulseRef = useRef<Mesh>(null)
  const [isActive, setIsActive] = useState(false)
  const position = useMemo(() => latLonToVector3(hotspot.lat, hotspot.lon, radius), [hotspot.lat, hotspot.lon, radius])
  useEffect(() => {
    if (!groupRef.current) return
    const normal = position.clone().normalize()
    groupRef.current.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), normal)
  }, [position])
  const glowTexture = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext("2d")
    if (!context) return null
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32)
    gradient.addColorStop(0, `${hotspot.color}cc`)
    gradient.addColorStop(.3, `${hotspot.color}4d`)
    gradient.addColorStop(1, `${hotspot.color}00`)
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    return new CanvasTexture(canvas)
  }, [hotspot.color])
  useFrame(({ clock }) => {
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * Math.PI + hotspot.lon) * .08
    if (markerRef.current) markerRef.current.scale.setScalar(pulse)
    if (spriteRef.current) spriteRef.current.scale.setScalar(.15 + (pulse - 1) * .05)
    if (pulseRef.current) {
      const phase = (clock.elapsedTime * 0.9 + hotspot.lon) % 2
      pulseRef.current.scale.setScalar(1 + phase * 1.4)
      const material = pulseRef.current.material as MeshBasicMaterial
      material.opacity = Math.max(0, .55 - phase * .27)
    }
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
        <sphereGeometry args={[.03, 16, 16]} />
        <meshBasicMaterial color={hotspot.color} />
      </mesh>
      <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[.04, .05, 32]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={.55} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      {glowTexture ? <sprite ref={spriteRef} scale={[.15, .15, 1]}><spriteMaterial map={glowTexture} color={hotspot.color} transparent opacity={.6} blending={AdditiveBlending} depthWrite={false} /></sprite> : null}
      <Html transform occlude={[occludeRef as unknown as RefObject<Object3D>]} distanceFactor={.85} className="platform-hotspot-rise" style={{ animationDelay: `${delayMs}ms`, pointerEvents: "none" }}>
        <div className="platform-hotspot-badge" style={{ "--hotspot-color": hotspot.color } as React.CSSProperties}><Icon size={15} strokeWidth={2.2} /><span>{hotspot.label}</span></div>
        {isActive ? <div className="platform-portal-preview" role="status"><span><Icon size={12} /> ПОРТАЛ</span><strong>{hotspot.label}</strong><p>{hotspot.description}</p></div> : null}
      </Html>
    </group>
  )
}
