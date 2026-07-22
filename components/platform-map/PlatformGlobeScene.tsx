"use client"

import { Suspense, useRef } from "react"
import { Canvas, useFrame, useLoader } from "@react-three/fiber"
import { Environment, Lightformer, OrbitControls, Stars } from "@react-three/drei"
import { TextureLoader, Mesh, SRGBColorSpace } from "three"

import { Hotspot } from "./Hotspot"
import type { PlatformHotspot } from "./hotspots"

const GLOBE_RADIUS = 1.2

/** Тот же премиальный стеклянный материал/подсветка, что и в globe-3d.tsx. */
function PlatformGlobe({ globeRef }: { globeRef: React.RefObject<Mesh | null> }) {
  const texture = useLoader(TextureLoader, "/images/globe-premium-4k.png")
  texture.colorSpace = SRGBColorSpace

  useFrame(() => {
    if (globeRef.current) {
      globeRef.current.rotation.y += 0.0006
    }
  })

  return (
    <mesh ref={globeRef} scale={GLOBE_RADIUS}>
      <sphereGeometry args={[1, 128, 128]} />
      <meshPhysicalMaterial
        map={texture}
        emissiveMap={texture}
        emissive="#4A8AB5"
        emissiveIntensity={0.22}
        metalness={0.4}
        roughness={0.05}
        clearcoat={0.3}
        clearcoatRoughness={0.2}
        reflectivity={0.5}
        envMapIntensity={1.2}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}

const TARGET_DISTANCE = 3.6

/**
 * Кинематографичный докинг камеры при монтировании: только радиальная дистанция
 * плавно уменьшается до целевой, направление не трогаем — чтобы не конфликтовать
 * с OrbitControls (autoRotate/пользовательское вращение меняют угол независимо).
 * Останавливается сама, как только дистанция достигнута — дальше камерой полностью
 * управляет OrbitControls.
 */
function CameraDolly() {
  const doneRef = useRef(false)
  useFrame((state) => {
    if (doneRef.current) return
    const dist = state.camera.position.length()
    if (Math.abs(dist - TARGET_DISTANCE) < 0.01) {
      doneRef.current = true
      return
    }
    state.camera.position.setLength(dist + (TARGET_DISTANCE - dist) * 0.05)
  })
  return null
}

type PlatformGlobeSceneProps = {
  sections: PlatformHotspot[]
}

export function PlatformGlobeScene({ sections }: PlatformGlobeSceneProps) {
  const globeRef = useRef<Mesh>(null)

  return (
    <Canvas
      style={{ width: "100%", height: "100%", background: "transparent" }}
      camera={{ position: [0, 0, 8], fov: 45 }}
      gl={{ alpha: true }}
    >
      <ambientLight intensity={0.5} color="#1A2A4A" />
      <directionalLight position={[5, 10, 7]} intensity={1.2} color="#4A8AB5" />
      <pointLight position={[-5, 0, 5]} intensity={0.8} color="#00D4FF" />
      <pointLight position={[5, -5, -5]} intensity={0.5} color="#7B2FBE" />

      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#05070f"]} />
        <Lightformer form="rect" intensity={1.6} color="#4A8AB5" position={[0, 4, 4]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#00D4FF" position={[-5, 0, 3]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#7B2FBE" position={[5, -2, -3]} scale={[5, 5, 1]} />
        <Lightformer form="circle" intensity={0.6} color="#cfe6ff" position={[0, -4, 2]} scale={[3, 3, 1]} />
      </Environment>

      <Stars radius={60} depth={30} count={2000} factor={2.4} saturation={0} fade speed={0.4} />

      <CameraDolly />

      <Suspense fallback={null}>
        <PlatformGlobe globeRef={globeRef} />
        {sections.map((section, i) => (
          <Hotspot key={section.key} hotspot={section} radius={GLOBE_RADIUS + 0.02} occludeRef={globeRef} delayMs={i * 60} />
        ))}
      </Suspense>

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.35}
        enablePan={false}
        minDistance={2.4}
        maxDistance={6}
        rotateSpeed={0.5}
      />
    </Canvas>
  )
}
