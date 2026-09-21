"use client"

import { useMemo, useRef, useState, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { AdditiveBlending, CanvasTexture, Mesh, Object3D, Sprite, Vector3 } from "three"
import type { PlatformHotspot } from "./hotspots"

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
}

type HotspotProps = { hotspot: PlatformHotspot; radius: number; occludeRef: RefObject<Mesh | null>; delayMs: number; reducedMotion: boolean }

export function Hotspot({ hotspot, radius, occludeRef, delayMs, reducedMotion }: HotspotProps) {
  const router = useRouter()
  const markerRef = useRef<Mesh>(null)
  const spriteRef = useRef<Sprite>(null)
  const [isActive, setIsActive] = useState(false)
  const position = useMemo(() => latLonToVector3(hotspot.lat, hotspot.lon, radius), [hotspot.lat, hotspot.lon, radius])
  const glowTexture = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext("2d")
    if (!context) return null
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32)
    gradient.addColorStop(0, "rgba(255,255,255,.95)")
    gradient.addColorStop(.18, `${hotspot.color}cc`)
    gradient.addColorStop(1, `${hotspot.color}00`)
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    return new CanvasTexture(canvas)
  }, [hotspot.color])
  useFrame(({ clock }) => {
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * Math.PI + hotspot.lon) * .2
    if (markerRef.current) markerRef.current.scale.setScalar(pulse)
    if (spriteRef.current) spriteRef.current.scale.setScalar(.32 + (pulse - 1) * .2)
  })
  const open = () => router.push(hotspot.href)
  const Icon = hotspot.Icon
  return (
    <group position={position} onPointerEnter={() => setIsActive(true)} onPointerLeave={() => setIsActive(false)} onClick={open}>
      <mesh position={[0, .15, 0]}>
        <cylinderGeometry args={[.006, .006, .3, 8]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={.62} />
      </mesh>
      <mesh ref={markerRef} onClick={(event) => { event.stopPropagation(); open() }}>
        <sphereGeometry args={[.05, 16, 16]} />
        <meshBasicMaterial color={hotspot.color} />
      </mesh>
      {glowTexture ? <sprite ref={spriteRef} scale={[.32, .32, 1]}><spriteMaterial map={glowTexture} color={hotspot.color} transparent blending={AdditiveBlending} depthWrite={false} /></sprite> : null}
      <Html transform occlude={[occludeRef as unknown as RefObject<Object3D>]} distanceFactor={.85} className="platform-hotspot-rise" style={{ animationDelay: `${delayMs}ms`, pointerEvents: "none" }}>
        {isActive ? <div className="platform-portal-preview" role="status"><span><Icon size={12} /> ПОРТАЛ</span><strong>{hotspot.label}</strong><p>{hotspot.description}</p></div> : null}
      </Html>
    </group>
  )
}
