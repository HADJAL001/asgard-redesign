"use client"

/* ================================================================
   OSGARD · ВАЛЛИ 3D Avatar
   ----------------------------------------------------------------
   3D-аватар ВАЛЛИ на @react-three/fiber, который отражает текущую
   экипировку пользователя (skin / accessory), приходящую как props
   из JarvisEquipment (lib/jarvis-equipment.ts).

   - skin      → цвет/материал/эмиссия ядра-аватара
   - accessory → доп. 3D-меши поверх аватара (плащ, корона, световое
                 кольцо, наручный проектор, частицы данных)
   - voice     → не влияет на 3D, используется только в чате для TTS

   Компонент лёгкий и самодостаточный: сам создаёт <Canvas>, поэтому
   его можно вставить в любое место интерфейса (JarvisChat, магазин,
   dashboard) — просто передав актуальный объект equipment.
   ================================================================ */

import { Suspense, useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment, Lightformer } from "@react-three/drei"
import * as THREE from "three"
import type { JarvisEquipment } from "@/lib/jarvis-equipment"

type JarvisAvatarProps = {
  equipment: JarvisEquipment
  /** Идёт ли сейчас озвучка ответа — используется для лёгкой пульсации ядра. */
  speaking?: boolean
  /** Высота canvas-области (ширина всегда 100%). */
  height?: number | string
}

/* ----------------------------------------------------------------
   Пресеты скинов: цвет ядра, эмиссия, металличность.
   Ключ — по названию купленного skin-аксессуара (см. migration 006).
   ---------------------------------------------------------------- */
type SkinPreset = { color: string; emissive: string; emissiveIntensity: number; metalness: number; roughness: number }

const DEFAULT_SKIN: SkinPreset = {
  color: "#00D4FF",
  emissive: "#00D4FF",
  emissiveIntensity: 0.6,
  metalness: 0.6,
  roughness: 0.25,
}

function resolveSkinPreset(skinName?: string): SkinPreset {
  if (!skinName) return DEFAULT_SKIN
  const name = skinName.toLowerCase()
  if (name.includes("красн") || name.includes("тревог")) {
    return { color: "#FF3B3B", emissive: "#FF3B3B", emissiveIntensity: 0.75, metalness: 0.5, roughness: 0.2 }
  }
  if (name.includes("золот") || name.includes("старк") || name.includes("gold")) {
    return { color: "#FFC94A", emissive: "#FFA500", emissiveIntensity: 0.55, metalness: 0.9, roughness: 0.12 }
  }
  if (name.includes("син") || name.includes("щит") || name.includes("blue")) {
    return { color: "#3AA8FF", emissive: "#00D4FF", emissiveIntensity: 0.6, metalness: 0.55, roughness: 0.22 }
  }
  return DEFAULT_SKIN
}

/* ----------------------------------------------------------------
   Ядро аватара — вращающаяся сфера с "пульсом" во время озвучки.
   ---------------------------------------------------------------- */
function AvatarCore({ skin, speaking }: { skin: SkinPreset; speaking?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.35
      const pulse = speaking ? 1 + Math.sin(t.current * 10) * 0.06 : 1 + Math.sin(t.current * 1.2) * 0.015
      meshRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 2]} />
      <meshPhysicalMaterial
        color={skin.color}
        emissive={skin.emissive}
        emissiveIntensity={skin.emissiveIntensity}
        metalness={skin.metalness}
        roughness={skin.roughness}
        clearcoat={0.75}
        clearcoatRoughness={0.1}
        iridescence={0.5}
        iridescenceIOR={1.3}
        sheen={0.35}
        sheenColor={skin.color}
        transparent
        opacity={0.92}
        wireframe={false}
      />
    </mesh>
  )
}

/* ----------------------------------------------------------------
   Аксессуары — рендерятся поверх ядра в зависимости от названия.
   ---------------------------------------------------------------- */

/** Плащ / мантия — конус, окружающий нижнюю часть аватара. */
function CapeAccessory() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y -= delta * 0.15
  })
  return (
    <mesh ref={ref} position={[0, -0.35, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[1.35, 1.6, 32, 1, true]} />
      <meshStandardMaterial color="#7B2FBE" emissive="#3A0F66" emissiveIntensity={0.4} side={THREE.DoubleSide} transparent opacity={0.55} />
    </mesh>
  )
}

/** Корона — тор + маленькие "зубцы" сверху аватара. */
function CrownAccessory() {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.4
  })
  const spikes = useMemo(() => new Array(8).fill(0).map((_, i) => (i / 8) * Math.PI * 2), [])
  return (
    <group ref={ref} position={[0, 1.25, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.08, 12, 32]} />
        <meshStandardMaterial color="#FFD700" emissive="#FFC400" emissiveIntensity={0.6} metalness={0.9} roughness={0.15} />
      </mesh>
      {spikes.map((angle, i) => (
        <mesh key={i} position={[Math.cos(angle) * 0.55, 0.18, Math.sin(angle) * 0.55]}>
          <coneGeometry args={[0.07, 0.28, 6]} />
          <meshStandardMaterial color="#FFD700" emissive="#FFC400" emissiveIntensity={0.6} metalness={0.9} roughness={0.15} />
        </mesh>
      ))}
    </group>
  )
}

/** Световое кольцо — светящееся тонкое кольцо вокруг ядра. */
function ArcRingAccessory() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.6
  })
  return (
    <mesh ref={ref}>
      <torusGeometry args={[1.35, 0.035, 16, 64]} />
      <meshStandardMaterial color="#00D4FF" emissive="#00D4FF" emissiveIntensity={1.2} metalness={0.3} roughness={0.1} />
    </mesh>
  )
}

/** Наручный проектор — маленькая орбитальная сфера-спутник рядом с ядром. */
function WristProjectorAccessory() {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime()
      ref.current.position.set(Math.cos(t * 1.4) * 1.6, Math.sin(t * 2.2) * 0.3, Math.sin(t * 1.4) * 1.6)
    }
  })
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#00D4FF" emissive="#00D4FF" emissiveIntensity={1.4} />
      </mesh>
    </group>
  )
}

/** Частицы данных — облако мелких точек вокруг ядра. */
function DataParticlesAccessory() {
  const ref = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const count = 120
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 1.6 + Math.random() * 0.6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.12
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#00D4FF" size={0.035} sizeAttenuation transparent opacity={0.85} />
    </points>
  )
}

/** Выбирает конкретный 3D-компонент аксессуара по названию из каталога. */
function AccessoryMesh({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n.includes("плащ") || n.includes("cape") || n.includes("мантия")) return <CapeAccessory />
  if (n.includes("корон") || n.includes("crown")) return <CrownAccessory />
  if (n.includes("реактор") || n.includes("кольцо") || n.includes("arc")) return <ArcRingAccessory />
  if (n.includes("проектор") || n.includes("наручн") || n.includes("wrist")) return <WristProjectorAccessory />
  if (n.includes("частиц") || n.includes("particle")) return <DataParticlesAccessory />
  // Неизвестный аксессуар — по умолчанию показываем кольцо арк-реактора как fallback-визуализацию.
  return <ArcRingAccessory />
}

/* ----------------------------------------------------------------
   Сцена
   ---------------------------------------------------------------- */
function AvatarScene({ equipment, speaking }: { equipment: JarvisEquipment; speaking?: boolean }) {
  const skin = useMemo(() => resolveSkinPreset(equipment.skin?.name), [equipment.skin?.name])

  return (
    <>
      <ambientLight intensity={0.5} color="#1A2A4A" />
      <directionalLight position={[4, 6, 5]} intensity={1.1} color="#4A8AB5" />
      <pointLight position={[-4, 0, 4]} intensity={0.7} color={skin.color} />
      <pointLight position={[0, -3, -3]} intensity={0.9} color="#ffffff" distance={8} />{/* тонкий rim-свет для премиального контура */}

      <Environment resolution={128} frames={1}>
        <color attach="background" args={["#05070f"]} />
        <Lightformer form="rect" intensity={1.2} color={skin.color} position={[0, 3, 3]} scale={[6, 3, 1]} />
        <Lightformer form="circle" intensity={0.5} color="#7B2FBE" position={[0, -3, 2]} scale={[3, 3, 1]} />
      </Environment>

      <group>
        <AvatarCore skin={skin} speaking={speaking} />
        {equipment.accessory && <AccessoryMesh name={equipment.accessory.name} />}
      </group>
    </>
  )
}

export function JarvisAvatar({ equipment, speaking, height = 220 }: JarvisAvatarProps) {
  return (
    <div className="jarvis-avatar" style={{ width: "100%", height }}>
      <Canvas
        style={{ width: "100%", height: "100%", background: "transparent" }}
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ alpha: true }}
      >
        <Suspense fallback={null}>
          <AvatarScene equipment={equipment} speaking={speaking} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default JarvisAvatar
