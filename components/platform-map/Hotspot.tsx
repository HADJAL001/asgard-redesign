"use client"

import { useMemo, useRef, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import { Mesh, Object3D, Vector3 } from "three"

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
}

export function Hotspot({ hotspot, radius, occludeRef, delayMs }: HotspotProps) {
  const router = useRouter()
  const markerRef = useRef<Mesh>(null)
  const position = useMemo(() => latLonToVector3(hotspot.lat, hotspot.lon, radius), [hotspot.lat, hotspot.lon, radius])

  useFrame(({ clock }) => {
    if (!markerRef.current) return
    const pulse = 0.75 + Math.sin(clock.elapsedTime * 2 + hotspot.lon) * 0.25
    markerRef.current.scale.setScalar(pulse)
  })

  const { Icon } = hotspot

  return (
    <group position={position}>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={0.85} />
      </mesh>
      <Html
        transform
        occlude={[occludeRef as unknown as RefObject<Object3D>]}
        distanceFactor={2.6}
        className="platform-hotspot-rise"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <button
          type="button"
          onClick={() => router.push(hotspot.href)}
          className="group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-all hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
          style={{
            borderColor: `${hotspot.color}66`,
            background: "rgba(10, 10, 15, 0.72)",
            color: "#FFFFFF",
            boxShadow: `0 0 16px ${hotspot.color}33`,
          }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: hotspot.color }} />
          <span className="whitespace-nowrap">{hotspot.label}</span>
        </button>
      </Html>
    </group>
  )
}
