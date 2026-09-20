"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Box3, Group, Vector3 } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export type SecretRoomItem = { type: string; x: number; y: number }
type Theme = { floor: string; wall: string; accent: string; fill: string }

function playRoomTone(kind: string) {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = kind === "crystal" || kind === "trophy" ? "sine" : "triangle"
  oscillator.frequency.setValueAtTime(kind === "lamp" ? 740 : 440, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(kind === "crystal" ? 990 : 330, context.currentTime + 0.16)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.19)
  oscillator.addEventListener("ended", () => void context.close())
}

const THEMES: Record<string, Theme> = {
  nebula: { floor: "#090919", wall: "#1c1438", accent: "#9e7bff", fill: "#4a2a86" }, noir: { floor: "#09090b", wall: "#1a1a1e", accent: "#d6d7df", fill: "#3a3b45" },
  gold: { floor: "#100e09", wall: "#2a2213", accent: "#e6c868", fill: "#8a6824" }, matrix: { floor: "#030a06", wall: "#062114", accent: "#5df09a", fill: "#16633b" },
  sunset: { floor: "#120a17", wall: "#35182e", accent: "#ff8bb8", fill: "#8d365d" }, aurora: { floor: "#041116", wall: "#073339", accent: "#59e4dd", fill: "#16716f" },
}

function RoomProp({ item, accent, fill, index, isOwner, onRemove }: { item: SecretRoomItem; accent: string; fill: string; index: number; isOwner: boolean; onRemove: (index: number) => void }) {
  const pos: [number, number, number] = [((item.x - 50) / 50) * 4.5, 0, ((item.y - 50) / 50) * 2.45]
  const click = { onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation(); playRoomTone(item.type); if (isOwner) onRemove(index) } }
  const base = <meshStandardMaterial color={fill} metalness={0.58} roughness={0.3} />
  const glow = <meshBasicMaterial color={accent} transparent opacity={0.78} />
  if (item.type === "lamp") return <group position={pos} {...click}><mesh position={[0, 0.92, 0]}>{base}<cylinderGeometry args={[0.06, 0.08, 1.84, 12]} /></mesh><mesh position={[0, 1.92, 0]}>{glow}<sphereGeometry args={[0.23, 16, 12]} /></mesh></group>
  if (item.type === "plant") return <group position={pos} {...click}><mesh position={[0, 0.18, 0]}>{base}<cylinderGeometry args={[0.24, 0.19, 0.36, 12]} /></mesh><mesh position={[0, 0.69, 0]}>{glow}<coneGeometry args={[0.48, 0.95, 10]} /></mesh></group>
  if (item.type === "painting") return <group position={[pos[0], 1.4, -2.94]} {...click}><mesh>{base}<boxGeometry args={[1.15, 0.78, 0.09]} /></mesh><mesh position={[0, 0, 0.055]}>{glow}<planeGeometry args={[0.93, 0.56]} /></mesh></group>
  if (item.type === "rug") return <group position={pos} {...click}><mesh rotation={[-Math.PI / 2, 0, 0]}>{glow}<circleGeometry args={[0.72, 32]} /></mesh></group>
  if (item.type === "throne") return <group position={pos} {...click}><mesh position={[0, 0.54, 0]}>{base}<boxGeometry args={[0.7, 0.48, 0.65]} /></mesh><mesh position={[0, 1.06, 0.23]}>{base}<boxGeometry args={[0.7, 0.75, 0.18]} /></mesh><mesh position={[0, 1.46, 0.33]}>{glow}<sphereGeometry args={[0.1, 12, 8]} /></mesh></group>
  if (item.type === "aquarium") return <group position={pos} {...click}><mesh position={[0, 0.68, 0]}>{base}<boxGeometry args={[1.05, 1.25, 0.38]} /></mesh><mesh position={[0, 0.72, 0.205]}>{glow}<planeGeometry args={[0.82, 0.85]} /></mesh></group>
  if (item.type === "piano") return <group position={pos} {...click}><mesh position={[0, 0.62, 0]}>{base}<boxGeometry args={[1.25, 0.22, 0.65]} /></mesh><mesh position={[0, 0.77, 0.13]}><meshBasicMaterial color="#ecf4ff" /><boxGeometry args={[0.86, 0.04, 0.25]} /></mesh></group>
  if (item.type === "safe") return <group position={pos} {...click}><mesh position={[0, 0.45, 0]}>{base}<boxGeometry args={[0.72, 0.9, 0.58]} /></mesh><mesh position={[0, 0.45, 0.3]}>{glow}<torusGeometry args={[0.15, 0.035, 8, 18]} /></mesh></group>
  if (item.type === "trophy" || item.type === "crystal") return <group position={pos} {...click}><mesh position={[0, 0.55, 0]}>{glow}<octahedronGeometry args={[0.47, 0]} /></mesh></group>
  return <group position={pos} {...click}><mesh position={[0, 0.58, 0]}>{base}<boxGeometry args={item.type === "shelf" ? [0.82, 1.16, 0.34] : [0.88, 1.16, 0.68]} /></mesh><mesh position={[0, 0.78, 0.36]}>{glow}<boxGeometry args={[0.52, 0.05, 0.03]} /></mesh></group>
}

function HoloTable({ accent, reducedMotion }: { accent: string; reducedMotion: boolean }) {
  const ring = useRef<Group>(null)
  useFrame((_, delta) => { if (!reducedMotion && ring.current) ring.current.rotation.y += delta * 0.17 })
  return <group position={[0, 0.55, 0]}><mesh rotation={[-Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.22, 1.22, 0.1, 48]} /><meshStandardMaterial color="#162b35" metalness={0.9} roughness={0.17} /></mesh><group ref={ring}><mesh rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.92, 0.032, 8, 48]} /><meshBasicMaterial color={accent} transparent opacity={0.92} /></mesh><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.32, 0.34, 32]} /><meshBasicMaterial color={accent} transparent opacity={0.72} /></mesh></group><mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.34, 0.74, 1.25, 28, 1, true]} /><meshBasicMaterial color={accent} transparent opacity={0.1} side={2} /></mesh><pointLight position={[0, 1.1, 0]} color={accent} intensity={7} distance={4} /><mesh position={[0, -0.45, 0]}><cylinderGeometry args={[0.1, 0.42, 0.9, 20]} /><meshStandardMaterial color="#11151b" metalness={0.9} roughness={0.25} /></mesh></group>
}

function BunkerShell({ accent, wall, reducedMotion }: { accent: string; wall: string; reducedMotion: boolean }) {
  const beacon = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!reducedMotion && beacon.current) {
      beacon.current.rotation.y = clock.elapsedTime * 0.28
      beacon.current.position.y = 2.55 + Math.sin(clock.elapsedTime * 1.4) * 0.05
    }
  })
  const panelMaterial = <meshStandardMaterial color="#121820" metalness={0.86} roughness={0.23} />
  return <group>
    {/* A rear command wall frames the scene without putting geometry in front of the camera. */}
    <mesh position={[0, 2.5, -3.15]}>{panelMaterial}<boxGeometry args={[10.2, 5.1, 0.24]} /></mesh>
    {[-3.7, -1.85, 1.85, 3.7].map((x) => <mesh key={`wall-rib-${x}`} position={[x, 2.45, -2.98]}>{panelMaterial}<boxGeometry args={[0.18, 4.75, 0.3]} /></mesh>)}
    {[-2.75, 2.75].map((x) => <mesh key={`console-${x}`} position={[x, 1.3, -2.9]}><meshBasicMaterial color={accent} transparent opacity={0.2} /><boxGeometry args={[1.15, 1.45, 0.04]} /></mesh>)}
    <mesh position={[0, 2.45, -3.03]}>{panelMaterial}<boxGeometry args={[2.2, 4.7, 0.22]} /></mesh>
    <mesh position={[0, 2.45, -3.035]}><meshBasicMaterial color={accent} transparent opacity={0.23} /><circleGeometry args={[0.82, 40]} /></mesh>
    <mesh position={[0, 2.45, -3.06]}><meshBasicMaterial color={accent} transparent opacity={0.88} /><torusGeometry args={[0.84, 0.022, 8, 40]} /></mesh>
    {[-4.55, 4.55].map((x) => <group key={`light-${x}`} position={[x, 2.65, -2.82]}><mesh><meshBasicMaterial color={accent} transparent opacity={0.7} /><planeGeometry args={[0.42, 3.8]} /></mesh><pointLight color={accent} intensity={11} distance={5} /></group>)}
    <group ref={beacon}><mesh><meshBasicMaterial color={accent} transparent opacity={0.24} /><octahedronGeometry args={[0.3, 0]} /></mesh><mesh rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color={accent} transparent opacity={0.72} /><torusGeometry args={[0.52, 0.014, 8, 36]} /></mesh></group>
    <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}><meshBasicMaterial color={accent} transparent opacity={0.2} /><ringGeometry args={[1.52, 1.57, 48]} /></mesh>
    <mesh position={[0, 4.85, -0.7]} rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color={wall} /><planeGeometry args={[9.8, 5.2]} /></mesh>
  </group>
}

function CustomAvatar({ gltf }: { gltf: string | null }) {
  const [avatar, setAvatar] = useState<Group | null>(null)
  useEffect(() => {
    if (!gltf) return
    let active = true
    new GLTFLoader().parse(gltf, "", (loaded) => {
      if (!active) return
      const scene = loaded.scene
      const bounds = new Box3().setFromObject(scene)
      const size = bounds.getSize(new Vector3())
      const largest = Math.max(size.x, size.y, size.z, 0.01)
      scene.scale.setScalar(1.35 / largest)
      scene.position.y -= bounds.min.y * scene.scale.y
      setAvatar(scene)
    }, () => { if (active) setAvatar(null) })
    return () => { active = false }
  }, [gltf])
  return gltf && avatar ? <primitive object={avatar} position={[2.6, 0, -1.8]} rotation={[0, -0.45, 0]} /> : null
}

function Headquarters({ items, avatarGltf, background, isOwner, onRemove }: { items: SecretRoomItem[]; avatarGltf: string | null; background: string; isOwner: boolean; onRemove: (index: number) => void }) {
  const [reducedMotion, setReducedMotion] = useState(false)
  const theme = THEMES[background] || THEMES.nebula
  useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(query.matches); sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync) }, [])
  const props = useMemo(() => items.map((item, index) => <RoomProp key={`${item.type}-${index}-${item.x}-${item.y}`} item={item} accent={theme.accent} fill={theme.fill} index={index} isOwner={isOwner} onRemove={onRemove} />), [items, theme.accent, theme.fill, isOwner, onRemove])
  return <Canvas camera={{ position: [5.45, 3.15, 8.9], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}><color attach="background" args={[theme.wall]} /><fog attach="fog" args={[theme.wall, 10, 19]} /><ambientLight intensity={0.68} color="#dbeeff" /><directionalLight position={[3, 7, 4]} intensity={2.1} color={theme.accent} /><pointLight position={[-4, 2.5, 2]} intensity={20} distance={8} color={theme.accent} /><pointLight position={[0, 3.8, -1.5]} intensity={11} distance={6} color="#dce9ff" /><mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[12, 10]} /><meshStandardMaterial color={theme.floor} metalness={0.82} roughness={0.27} /></mesh><BunkerShell accent={theme.accent} wall={theme.wall} reducedMotion={reducedMotion} /><HoloTable accent={theme.accent} reducedMotion={reducedMotion} /><CustomAvatar gltf={avatarGltf} />{props}<OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.85} maxPolarAngle={1.35} autoRotate={!reducedMotion} autoRotateSpeed={0.25} target={[0, 0.9, 0]} /></Canvas>
}

export function SecretRoomScene(props: { items: SecretRoomItem[]; avatarGltf: string | null; background: string; isOwner: boolean; onRemove: (index: number) => void }) { return <Headquarters {...props} /> }
