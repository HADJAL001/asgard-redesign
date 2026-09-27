"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useRef } from "react";
import type { Group } from "three";

function ProductModel({ active }: { active: boolean }) {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!group.current || !active) return;
    group.current.rotation.y += delta * 0.28;
    group.current.rotation.z = Math.sin(Date.now() / 1800) * 0.035;
  });

  return (
    <group ref={group} rotation={[0.28, -0.45, 0]}>
      <mesh>
        <boxGeometry args={[2.3, 1.42, 0.1]} />
        <meshStandardMaterial color="#0b1020" emissive="#d4af37" emissiveIntensity={active ? 0.18 : 0.07} metalness={0.76} roughness={0.22} transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, 0.22, 0.065]}>
        <planeGeometry args={[1.72, 0.24]} />
        <meshBasicMaterial color="#f9e2a6" transparent opacity={0.7} />
      </mesh>
      {[-0.58, 0, 0.58].map((x) => (
        <mesh key={x} position={[x, -0.28, 0.065]}>
          <planeGeometry args={[0.42, 0.42]} />
          <meshBasicMaterial color="#d4af37" transparent opacity={0.28} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -1.08, 0]}>
        <ringGeometry args={[1.05, 1.07, 48]} />
        <meshBasicMaterial color="#d4af37" transparent opacity={0.38} />
      </mesh>
    </group>
  );
}

export function HolographicProductTwin({ active = false }: { active?: boolean }) {
  const reduced = useReducedMotion();

  return (
    <div className="ds-product-twin" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={reduced ? "demand" : "always"}
        camera={{ position: [0, 0, 4.4], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <ambientLight intensity={0.55} />
        <pointLight position={[2, 2, 3]} color="#f9e2a6" intensity={2.4} />
        <pointLight position={[-2, -1, 2]} color="#7f6b43" intensity={0.8} />
        <ProductModel active={active && !reduced} />
      </Canvas>
    </div>
  );
}
