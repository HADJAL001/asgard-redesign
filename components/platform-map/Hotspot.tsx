"use client"

import { useMemo, useRef, useState, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import { Group, Mesh, Object3D, Vector3 } from "three"

import type { PlatformHotspot } from "./hotspots"

/** Та же сферическая математика, что и в holographic-globe.tsx::latLonToVec, портированная на THREE.Vector3. */
function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

type HotspotProps = {
  hotspot: PlatformHotspot
  radius: number
  occludeRef: RefObject<Mesh | null>
  delayMs: number
  reducedMotion: boolean
}

export function Hotspot({ hotspot, radius, occludeRef, delayMs, reducedMotion }: HotspotProps) {
  const router = useRouter()
  const orbitRef = useRef<Group>(null)
  const markerRef = useRef<Mesh>(null)
  const [isActive, setIsActive] = useState(false)
  const position = useMemo(() => latLonToVector3(hotspot.lat, hotspot.lon, radius), [hotspot.lat, hotspot.lon, radius])
  const orbitAxis = useMemo(() => new Vector3(0, 1, 0), [])
  const phase = useMemo(() => (hotspot.lat * 0.013 + hotspot.lon * 0.007) % (Math.PI * 2), [hotspot.lat, hotspot.lon])

  useFrame(({ clock }) => {
    if (orbitRef.current) {
      // Each portal is a satellite, not a static map pin. Hovering holds it in
      // place so its preview stays readable before the person chooses a route.
      const angle = phase + (isActive || reducedMotion ? 0 : clock.elapsedTime * 0.045)
      orbitRef.current.position.copy(position).applyAxisAngle(orbitAxis, angle)
    }
    if (!markerRef.current) return
    const pulse = reducedMotion ? 1 : 0.82 + Math.sin(clock.elapsedTime * 2 + hotspot.lon) * 0.18
    markerRef.current.scale.setScalar(pulse)
  })

  const { Icon } = hotspot

  return (
    <group ref={orbitRef} position={position}>
      <mesh ref={markerRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.055, 0.008, 8, 20]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={0.85} />
      </mesh>
      <Html
        transform
        occlude={[occludeRef as unknown as RefObject<Object3D>]}
        distanceFactor={3.4}
        className="platform-hotspot-rise"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        {/* Компактнее и «на поверхности» глобуса: круглый бейдж-иконка + стеклянная
            пилюля, сильнее блюр и тоньше — чипы не выпирают, а будто вписаны в сферу. */}
        <button
          type="button"
          onClick={() => router.push(hotspot.href)}
          onPointerEnter={() => setIsActive(true)}
          onPointerLeave={() => setIsActive(false)}
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          aria-label={`${hotspot.label}: ${hotspot.description}`}
          className="platform-portal group flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-semibold backdrop-blur-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10181d]"
          style={{
            borderColor: `${hotspot.color}55`,
            background: "rgba(8, 10, 18, 0.55)",
            color: "#FFFFFF",
            boxShadow: `0 0 14px ${hotspot.color}2e, inset 0 0 10px ${hotspot.color}1f`,
          }}
        >
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: `radial-gradient(circle at 35% 30%, ${hotspot.color}, ${hotspot.color}55)`, boxShadow: `0 0 8px ${hotspot.color}88` }}
          >
            <Icon className="h-3 w-3" style={{ color: "#0b1020" }} strokeWidth={2.4} />
          </span>
          <span className="whitespace-nowrap tracking-tight">{hotspot.label}</span>
        </button>
        {isActive ? <div className="platform-portal-preview" role="status"><span>ПОРТАЛ</span><strong>{hotspot.label}</strong><p>{hotspot.description}</p></div> : null}
      </Html>
    </group>
  )
}
