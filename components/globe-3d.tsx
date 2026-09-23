'use client'

import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader, Mesh, SRGBColorSpace } from 'three'

function RotatingGlobe() {
  const globeRef = useRef<Mesh>(null)
  const rawTexture = useLoader(TextureLoader, '/images/globe-premium-4k.png')
  // Клонируем текстуру и настраиваем colorSpace на клоне (свой объект, а не
  // возвращённый хуком) — react-hooks/immutability запрещает мутировать значение
  // из useLoader даже в эффекте. clone() не перезагружает изображение повторно.
  const texture = useMemo(() => {
    const t = rawTexture.clone()
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [rawTexture])

  useFrame(() => {
    if (globeRef.current) {
      // Hypnotic self-rotation: one full turn per 90 seconds (linear)
      globeRef.current.rotation.y += 0.001164 // 2π / (90s * 60fps)
    }
  })

  return (
    <group>
      {/* the glassy metallic globe — premium physical material with holographic env reflections */}
      <mesh ref={globeRef} scale={1.2}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshPhysicalMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#101c2b"
          emissiveIntensity={0.08}
          metalness={0}
          roughness={0.78}
          clearcoat={0.12}
          clearcoatRoughness={0.48}
          reflectivity={0.18}
          envMapIntensity={0.35}
        />
      </mesh>
    </group>
  )
}

export default function Globe3D() {
  return (
    <Canvas
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
      }}
      camera={{
        // pulled back so the full sphere always fits — never clipped
        position: [0, 0, 3.6],
        fov: 45,
      }}
      gl={{ alpha: true }}
    >
      {/* exact premium lighting rig */}
      <ambientLight intensity={0.24} color="#9fb8cf" />
      <directionalLight position={[5, 8, 7]} intensity={2.1} color="#fff7e8" />
      <directionalLight position={[-4, -2, -6]} intensity={0.18} color="#6e8eae" />

      {/* procedural holographic environment — colored light panels reflected by the metal */}

      <RotatingGlobe />
    </Canvas>
  )
}
