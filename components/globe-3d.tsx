'use client'

import { useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { TextureLoader, Mesh, SRGBColorSpace } from 'three'

function RotatingGlobe() {
  const globeRef = useRef<Mesh>(null)
  const texture = useLoader(TextureLoader, '/images/globe-premium-4k.png')
  texture.colorSpace = SRGBColorSpace

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
      <ambientLight intensity={0.5} color="#1A2A4A" />
      <directionalLight position={[5, 10, 7]} intensity={1.2} color="#4A8AB5" />
      <pointLight position={[-5, 0, 5]} intensity={0.8} color="#00D4FF" />
      <pointLight position={[5, -5, -5]} intensity={0.5} color="#7B2FBE" />

      {/* procedural holographic environment — colored light panels reflected by the metal */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#05070f']} />
        <Lightformer form="rect" intensity={1.6} color="#4A8AB5" position={[0, 4, 4]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#00D4FF" position={[-5, 0, 3]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#7B2FBE" position={[5, -2, -3]} scale={[5, 5, 1]} />
        <Lightformer form="circle" intensity={0.6} color="#cfe6ff" position={[0, -4, 2]} scale={[3, 3, 1]} />
      </Environment>

      <RotatingGlobe />
    </Canvas>
  )
}
