"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber"
import { OrbitControls, Points, PointMaterial } from "@react-three/drei"
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Group, Mesh, ShaderMaterial, SRGBColorSpace, TextureLoader } from "three"
import { Hotspot } from "./Hotspot"
import type { PlatformHotspot } from "./hotspots"

const GLOBE_RADIUS = 5
const seeded = (value: number) => (Math.sin(value * 729.31) + 1) * .5

function Atmosphere() {
  const material = useMemo(() => new ShaderMaterial({ transparent: true, side: BackSide, blending: AdditiveBlending, depthWrite: false, uniforms: { glowColor: { value: new Color("#66829d") } }, vertexShader: `varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(mat3(modelMatrix)*normal);vPosition=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vPosition; void main(){vec3 viewDir=normalize(cameraPosition-vPosition);float rim=pow(1.-max(dot(normalize(vNormal),viewDir),0.),7.);gl_FragColor=vec4(glowColor*.35,rim*.08);}` }), [])
  return <mesh scale={GLOBE_RADIUS * 1.018}><sphereGeometry args={[1, 128, 128]} /><primitive object={material} attach="material" /></mesh>
}

function CityLights() {
  const geometry = useMemo(() => { const positions: number[] = []; for (let i = 0; i < 760; i += 1) { if (seeded(i + 611) < .53) continue; const lat = (seeded(i + 2) - .5) * 2, lon = seeded(i + 199) * Math.PI * 2, r = GLOBE_RADIUS * 1.004; positions.push(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)) } const g = new BufferGeometry(); g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3)); return g }, [])
  return <points geometry={geometry}><pointsMaterial size={.045} sizeAttenuation color="#f5c451" transparent opacity={.46} blending={AdditiveBlending} depthWrite={false} /></points>
}

function Globe({ reducedMotion, worldRef, globeRef }: { reducedMotion: boolean; worldRef: React.RefObject<Group | null>; globeRef: React.RefObject<Mesh | null> }) {
  const rawTexture = useLoader(TextureLoader, "/textures/earth/earth-day.jpg"), rawNight = useLoader(TextureLoader, "/textures/earth/earth-night.jpg"), rawNormal = useLoader(TextureLoader, "/textures/earth/earth_normal_1024.jpg"), rawSpecular = useLoader(TextureLoader, "/textures/earth/earth_specular_1024.jpg")
  const texture = useMemo(() => { const t = rawTexture.clone(); t.colorSpace = SRGBColorSpace; t.needsUpdate = true; return t }, [rawTexture])
  const nightTexture = useMemo(() => { const t = rawNight.clone(); t.colorSpace = SRGBColorSpace; t.needsUpdate = true; return t }, [rawNight])
  const normalMap = useMemo(() => { const t = rawNormal.clone(); t.needsUpdate = true; return t }, [rawNormal])
  const specularMap = useMemo(() => { const t = rawSpecular.clone(); t.needsUpdate = true; return t }, [rawSpecular])
  useFrame((_, delta) => { if (!reducedMotion && worldRef.current) worldRef.current.rotation.y += delta * .014 })
  return <><mesh ref={globeRef} scale={GLOBE_RADIUS}><sphereGeometry args={[1, 128, 128]} /><meshPhysicalMaterial map={texture} normalMap={normalMap} roughnessMap={specularMap} emissiveMap={nightTexture} emissive="#284b72" emissiveIntensity={.12} color="#ffffff" normalScale={[.8, .8]} metalness={0} roughness={.82} clearcoat={.3} clearcoatRoughness={.28} /></mesh><CityLights /><Atmosphere /></>
}

function CloudLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const raw = useLoader(TextureLoader, "/textures/earth/earth_clouds_1024.png"), ref = useRef<Mesh>(null)
  const texture = useMemo(() => { const t = raw.clone(); t.colorSpace = SRGBColorSpace; t.needsUpdate = true; return t }, [raw])
  useFrame((_, delta) => { if (!reducedMotion && ref.current) ref.current.rotation.y += delta * .025 })
  return <mesh ref={ref} scale={GLOBE_RADIUS * 1.014}><sphereGeometry args={[1, 96, 96]} /><meshPhongMaterial map={texture} transparent opacity={.28} depthWrite={false} /></mesh>
}

function SkyParallax({ reducedMotion }: { reducedMotion: boolean }) {
  const refs = [useRef<Group>(null), useRef<Group>(null), useRef<Group>(null)], { pointer } = useThree()
  const layers = useMemo(() => [[360, 32, 20, -12, 8, "#627ca2", .025], [220, 22, 15, -7, 5, "#bbd9ff", .042], [100, 16, 11, -3, 3, "#f5d783", .065]].map(([count, width, height, depth, distance, color, size], layer) => ({ positions: new Float32Array(Array.from({ length: count as number }, (_, i) => [(seeded(i + layer * 480) - .5) * (width as number), (seeded(i + 91 + layer * 480) - .5) * (height as number), (depth as number) - seeded(i + 3) * (distance as number)]).flat()), color: color as string, size: size as number })), [])
  useFrame((_, delta) => { if (reducedMotion) return; refs.forEach((ref, i) => { if (ref.current) { const depth = [.06, .16, .34][i]; ref.current.position.x += (pointer.x * depth - ref.current.position.x) * delta * .65; ref.current.position.y += (pointer.y * depth - ref.current.position.y) * delta * .65 } }) })
  return <>{layers.map((layer, i) => <group key={layer.color} ref={refs[i]}><Points positions={layer.positions} stride={3} frustumCulled><PointMaterial transparent color={layer.color} size={layer.size} sizeAttenuation depthWrite={false} /></Points></group>)}</>
}

function CameraDolly() { const done = useRef(false); useFrame((state) => { if (done.current) return; const dist = state.camera.position.length(); if (Math.abs(dist - 18) < .01) { done.current = true; return }; state.camera.position.setLength(dist + (18 - dist) * .05) }); return null }

export function PlatformGlobeScene({ sections }: { sections: PlatformHotspot[] }) {
  const globeRef = useRef<Mesh>(null), worldRef = useRef<Group>(null), [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"), sync = () => setReducedMotion(q.matches); sync(); q.addEventListener("change", sync); return () => q.removeEventListener("change", sync) }, [])
  return <Canvas style={{ width: "100%", height: "100%", background: "transparent" }} camera={{ position: [0, 0, 18], fov: 30 }} gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} dpr={[1, 1.5]}><SkyParallax reducedMotion={reducedMotion} /><hemisphereLight args={["#d9eaff", "#17283b", .72]} /><directionalLight position={[10, 5, 8]} intensity={2.15} color="#fffaf0" /><ambientLight intensity={.24} color="#9ab6d0" /><CameraDolly /><Suspense fallback={null}><group ref={worldRef} rotation={[0, 0, 23.5 * Math.PI / 180]}><Globe reducedMotion={reducedMotion} worldRef={worldRef} globeRef={globeRef} /><CloudLayer reducedMotion={reducedMotion} />{sections.map((section, i) => <Hotspot key={section.key} hotspot={section} radius={GLOBE_RADIUS + .12} occludeRef={globeRef} delayMs={i * 60} reducedMotion={reducedMotion} />)}</group></Suspense><OrbitControls enableDamping dampingFactor={.075} autoRotate={false} enablePan={false} minDistance={10} maxDistance={24} rotateSpeed={.5} /></Canvas>
}
