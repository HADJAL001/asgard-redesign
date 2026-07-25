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
        distanceFactor={3.4}
        className="platform-hotspot-rise"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        {/* Компактнее и «на поверхности» глобуса: круглый бейдж-иконка + стеклянная
            пилюля, сильнее блюр и тоньше — чипы не выпирают, а будто вписаны в сферу. */}
        <button
          type="button"
          onClick={() => router.push(hotspot.href)}
          className="group flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-semibold backdrop-blur-xl transition-all hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
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
      </Html>
    </group>
  )
}
