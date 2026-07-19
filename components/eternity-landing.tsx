"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import * as THREE from "three"
import {
  Infinity as InfinityIcon,
  ArrowRight,
  Crown,
  Gem,
  Shield,
  Award,
  Star,
  BarChart2,
  Users,
  LogIn,
} from "lucide-react"

export function EternityLanding() {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [counter, setCounter] = useState(0)

  const bubbleRef = useRef<HTMLDivElement>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const bubblePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const bubbleVisibleRef = useRef(false)

  const [particles, setParticles] = useState<
    { left: string; top: string; duration: string; delay: string }[]
  >([])
  useEffect(() => {
    setParticles(
      Array.from({ length: 40 }).map(() => ({
        left: `${Math.random() * 100}vw`,
        top: `${Math.random() * 100}vh`,
        duration: `${Math.random() * 20 + 15}s`,
        delay: `${Math.random() * 10}s`,
      })),
    )
  }, [])

  // Animated counter → 12 847
  useEffect(() => {
    const target = 12847
    const duration = 2000
    const start = performance.now() + 600
    let raf = 0
    const tick = (now: number) => {
      if (now < start) {
        raf = requestAnimationFrame(tick)
        return
      }
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setCounter(Math.floor(eased * target))
      if (progress < 1) raf = requestAnimationFrame(tick)
      else setCounter(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Three.js globe scene
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020408)

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 500)
    camera.position.set(0, 0.8, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.85
    container.appendChild(renderer.domElement)

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin("anonymous")
    const mapUrl = "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
    const normalUrl = "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg"
    const specularUrl = "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg"
    const cloudUrl = "https://threejs.org/examples/textures/planets/earth_clouds_1024.png"

    const mapTexture = loader.load(mapUrl)
    mapTexture.anisotropy = 8
    const normalTexture = loader.load(normalUrl)
    const specularTexture = loader.load(specularUrl)
    const cloudTexture = loader.load(cloudUrl)

    const earthMaterial = new THREE.MeshPhysicalMaterial({
      map: mapTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: specularTexture,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new THREE.Color(0x0a1a2a),
      emissiveIntensity: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.8,
      color: new THREE.Color(0xccddff),
    })

    const earthGeometry = new THREE.SphereGeometry(1.26, 128, 128)
    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    const orbitGroup = new THREE.Group()
    orbitGroup.add(earth)

    const cloudMaterial = new THREE.MeshPhongMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const cloudGeometry = new THREE.SphereGeometry(1.27, 96, 96)
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial)
    orbitGroup.add(clouds)

    const atmosphereVS = `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
    const atmosphereFS = `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
        gl_FragColor = vec4(0.3, 0.6, 1.0, intensity * 0.7);
      }
    `
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVS,
      fragmentShader: atmosphereFS,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    })
    const atmosphereGeometry = new THREE.SphereGeometry(1.3, 64, 64)
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    orbitGroup.add(atmosphere)

    scene.add(orbitGroup)

    const ambient = new THREE.AmbientLight(0x2a3a5a, 0.5)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0x8ab0ff, 1.8)
    keyLight.position.set(5, 7, 10)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x8a7a5a, 0.25)
    fillLight.position.set(-4, 2, -3)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0x4a7a9a, 0.9)
    rimLight.position.set(-2, -6, -7)
    scene.add(rimLight)

    const starCount = 4000
    const starGeometry = new THREE.BufferGeometry()
    const positions = new Float32Array(starCount * 3)
    const colors = new Float32Array(starCount * 3)
    const sizes = new Float32Array(starCount)
    for (let i = 0; i < starCount; i++) {
      const radius = 80 + Math.random() * 200
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
      const cr = Math.random()
      if (cr < 0.6) {
        colors[i * 3] = 0.9 + 0.1 * Math.random()
        colors[i * 3 + 1] = 0.9 + 0.1 * Math.random()
        colors[i * 3 + 2] = 1.0
      } else if (cr < 0.8) {
        colors[i * 3] = 0.6 + 0.3 * Math.random()
        colors[i * 3 + 1] = 0.7 + 0.3 * Math.random()
        colors[i * 3 + 2] = 1.0
      } else if (cr < 0.95) {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 0.8 + 0.2 * Math.random()
        colors[i * 3 + 2] = 0.5 + 0.3 * Math.random()
      } else {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 0.4 + 0.2 * Math.random()
        colors[i * 3 + 2] = 0.2 + 0.2 * Math.random()
      }
      sizes[i] = 0.2 + Math.random() * 0.9
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    starGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1))
    const starMaterial = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const stars = new THREE.Points(starGeometry, starMaterial)
    scene.add(stars)

    const starCount2 = 2000
    const starGeo2 = new THREE.BufferGeometry()
    const pos2 = new Float32Array(starCount2 * 3)
    for (let i = 0; i < starCount2; i++) {
      const radius = 120 + Math.random() * 300
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      pos2[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      pos2[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      pos2[i * 3 + 2] = radius * Math.cos(phi)
    }
    starGeo2.setAttribute("position", new THREE.BufferAttribute(pos2, 3))
    const starMat2 = new THREE.PointsMaterial({
      color: 0x446688,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const stars2 = new THREE.Points(starGeo2, starMat2)
    scene.add(stars2)

    orbitGroup.rotation.x = 0.2
    orbitGroup.rotation.z = -0.1

    // =============================================
    // ДЖАРВИС — полноценный 3D-робот на поверхности глобуса
    // =============================================
    const GLOBE_R = 1.26

    // --- Материалы ---
    const goldMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xFFD700),
      metalness: 0.9,
      roughness: 0.2,
      envMapIntensity: 1.2,
    })
    const goldDarkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xB8860B),
      metalness: 0.92,
      roughness: 0.28,
    })
    const goldAccentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xFFA500),
      metalness: 0.88,
      roughness: 0.22,
      emissive: new THREE.Color(0xCC6600),
      emissiveIntensity: 0.12,
    })
    const eyeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x00D4FF),
      emissive: new THREE.Color(0x00D4FF),
      emissiveIntensity: 2.0,
      metalness: 0.05,
      roughness: 0.05,
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x001830),
      metalness: 0.5,
      roughness: 0.6,
    })
    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x333300),
      metalness: 0.7,
      roughness: 0.5,
    })

    // ---- ГОЛОВА ----
    const headGroup = new THREE.Group()

    const headGeo = new THREE.BoxGeometry(0.22, 0.24, 0.18)
    const head = new THREE.Mesh(headGeo, goldMat)
    headGroup.add(head)

    // Лобная пластина
    const forehead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.022), goldDarkMat)
    forehead.position.set(0, 0.06, 0.1)
    headGroup.add(forehead)

    // Боковые щёки
    const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.12), goldDarkMat)
    cheekL.position.set(-0.115, -0.01, 0)
    const cheekR = cheekL.clone()
    cheekR.position.set(0.115, -0.01, 0)
    headGroup.add(cheekL, cheekR)

    // Глазные ободки
    const eyeRimGeo = new THREE.BoxGeometry(0.066, 0.042, 0.018)
    const eyeRimL = new THREE.Mesh(eyeRimGeo, darkMat)
    eyeRimL.position.set(-0.056, 0.01, 0.089)
    const eyeRimR = new THREE.Mesh(eyeRimGeo, darkMat)
    eyeRimR.position.set(0.056, 0.01, 0.089)
    headGroup.add(eyeRimL, eyeRimR)

    // Глаза (светящиеся)
    const eyeGeo = new THREE.BoxGeometry(0.056, 0.033, 0.026)
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
    eyeL.position.set(-0.056, 0.01, 0.093)
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
    eyeR.position.set(0.056, 0.01, 0.093)
    headGroup.add(eyeL, eyeR)

    // Световая полоска между глаз
    const eyeBar = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.009, 0.022), eyeMat)
    eyeBar.position.set(0, 0.01, 0.093)
    headGroup.add(eyeBar)

    // Антенна на макушке
    const antennaBase = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), goldDarkMat)
    antennaBase.position.set(0, 0.135, 0)
    const antennaPole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.012), goldMat)
    antennaPole.position.set(0, 0.195, 0)
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMat)
    antennaTip.position.set(0, 0.243, 0)
    headGroup.add(antennaBase, antennaPole, antennaTip)

    // Вентиляционные пазы на подбородке
    const slotGeo = new THREE.BoxGeometry(0.1, 0.008, 0.022)
    const slotYs = [-0.065, -0.08, -0.095]
    slotYs.forEach(y => {
      const s = new THREE.Mesh(slotGeo, darkMat)
      s.position.set(0, y, 0.09)
      headGroup.add(s)
    })

    // Подбородок
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.14), goldDarkMat)
    chin.position.set(0, -0.14, 0)
    headGroup.add(chin)

    headGroup.position.set(0, 0.48, 0) // центр головы от начала координат группы

    // ---- ШЕЯ ----
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), goldDarkMat)
    neck.position.set(0, 0.36, 0)

    // ---- ТОРС ----
    const torsoGroup = new THREE.Group()

    // Основа торса
    const torsoMain = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.22), goldMat)
    torsoMain.position.set(0, 0.16, 0)
    torsoGroup.add(torsoMain)

    // Грудная пластина (центральная)
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.026), goldDarkMat)
    chestPlate.position.set(0, 0.18, 0.122)
    torsoGroup.add(chestPlate)

    // Дуговой реактор (светящийся)
    const reactorRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 8, 16), eyeMat)
    reactorRing.position.set(0, 0.22, 0.138)
    const reactorCore = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), eyeMat)
    reactorCore.position.set(0, 0.22, 0.136)
    torsoGroup.add(reactorRing, reactorCore)

    // Боковые панели торса
    const sidePanelGeo = new THREE.BoxGeometry(0.04, 0.28, 0.18)
    const sidePanelL = new THREE.Mesh(sidePanelGeo, goldDarkMat)
    sidePanelL.position.set(-0.19, 0.16, 0)
    const sidePanelR = sidePanelL.clone()
    sidePanelR.position.set(0.19, 0.16, 0)
    torsoGroup.add(sidePanelL, sidePanelR)

    // Нижняя юбка торса (переход к тазу)
    const hipBridge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.18), goldAccentMat)
    hipBridge.position.set(0, -0.03, 0)
    torsoGroup.add(hipBridge)

    torsoGroup.position.set(0, 0, 0)

    // ---- ТАЗ ----
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), goldDarkMat)
    pelvis.position.set(0, -0.1, 0)

    // ---- ЛЕВАЯ РУКА ----
    const armLGroup = new THREE.Group()

    // Плечо
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), goldMat)
    shoulderL.position.set(0, 0, 0)

    // Плечевой сустав
    const shoulderJointL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), jointMat)
    shoulderJointL.position.set(0, 0, 0)

    // Верхняя рука
    const upperArmL = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.22, 0.085), goldMat)
    upperArmL.position.set(0, -0.13, 0)

    // Локтевой сустав
    const elbowL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), jointMat)
    elbowL.position.set(0, -0.26, 0)

    // Предплечье
    const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.19, 0.075), goldDarkMat)
    forearmL.position.set(0, -0.38, 0)

    // Запястье
    const wristL = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.045, 0.065), goldAccentMat)
    wristL.position.set(0, -0.5, 0)

    // Кисть (держится за глобус)
    const handBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.045), goldMat)
    handBodyL.position.set(0, -0.57, 0)

    // Пальцы (3 пальца)
    for (let f = -1; f <= 1; f++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.06, 0.016), goldDarkMat)
      finger.position.set(f * 0.022, -0.628, 0)
      armLGroup.add(finger)
    }

    armLGroup.add(shoulderL, shoulderJointL, upperArmL, elbowL, forearmL, wristL, handBodyL)
    // Левая рука: позиция от торса, повёрнута вниз-вперёд (держится за глобус)
    armLGroup.position.set(-0.225, 0.16, 0)
    armLGroup.rotation.z = 0.35  // отведена слегка в сторону
    armLGroup.rotation.x = 0.4   // наклонена вперёд

    // ---- ПРАВАЯ РУКА ----
    const armRGroup = armLGroup.clone()
    armRGroup.position.set(0.225, 0.16, 0)
    armRGroup.rotation.z = -0.35
    armRGroup.rotation.x = 0.4

    // ---- ЛЕВАЯ НОГА ----
    const legLGroup = new THREE.Group()

    // Бедро
    const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), goldMat)
    thighL.position.set(0, -0.12, 0)

    // Коленный сустав
    const kneeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), jointMat)
    kneeL.position.set(0, -0.26, 0)

    // Голень
    const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.22, 0.1), goldDarkMat)
    shinL.position.set(0, -0.39, 0)

    // Лодыжка
    const ankleL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.075), goldAccentMat)
    ankleL.position.set(0, -0.515, 0)

    // Ступня
    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.045, 0.14), goldMat)
    footL.position.set(0, -0.548, 0.025)

    legLGroup.add(thighL, kneeL, shinL, ankleL, footL)
    legLGroup.position.set(-0.1, -0.12, 0)
    legLGroup.rotation.x = -0.15  // слегка согнуты (стоят на поверхности)

    // ---- ПРАВАЯ НОГА ----
    const legRGroup = legLGroup.clone()
    legRGroup.position.set(0.1, -0.12, 0)
    legRGroup.rotation.x = -0.15

    // ---- Сборка всего тела ----
    const jarvisGroup = new THREE.Group()
    jarvisGroup.add(headGroup, neck, torsoGroup, pelvis, armLGroup, armRGroup, legLGroup, legRGroup)
    jarvisGroup.scale.setScalar(0.42)
    jarvisGroup.visible = false
    scene.add(jarvisGroup)

    // Свечение от реактора
    const reactorLight = new THREE.PointLight(0x00D4FF, 0.4, 0.6)
    scene.add(reactorLight)

    // Свечение глаз
    const eyeLight = new THREE.PointLight(0x00D4FF, 0.6, 0.8)
    scene.add(eyeLight)

    // Параметры карабкания
    const J_START_SEC = 1.5   // задержка перед появлением
    const J_CLIMB_DUR = 2.5   // длительность карабкания
    const J_THETA     = -0.55 // азимут (правая сторона глобуса)
    const J_PHI_FROM  = 1.78  // старт: низ-правая сторона (за горизонтом)
    const J_PHI_TO    = 1.08  // финиш: чуть выше экватора
    const J_SURFACE_R = GLOBE_R + 0.16 // стоит на поверхности

    function easeInOut(t: number): number {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    }

    let time = 0
    const radiusOrbit = 3.0
    const speedOrbit = 0.08
    let raf = 0

    function animate() {
      raf = requestAnimationFrame(animate)
      time += 0.005

      earth.rotation.y += 0.0025
      clouds.rotation.y += 0.0035
      atmosphere.rotation.y = earth.rotation.y
      orbitGroup.rotation.y += 0.0012

      const offsetX = Math.sin(time * speedOrbit) * radiusOrbit
      const offsetY = Math.cos(time * speedOrbit * 0.8) * radiusOrbit * 0.6
      orbitGroup.position.x = offsetX
      orbitGroup.position.y = offsetY + Math.sin(time * 0.6) * 0.04

      stars.rotation.y += 0.0001
      stars2.rotation.y -= 0.00005

      // Время в секундах (каждый тик +0.005, ~60fps → 0.005*60/1 = 0.3 units/sec)
      const tSec = time / 0.3

      if (tSec < J_START_SEC) {
        jarvisGroup.visible = false
      } else {
        jarvisGroup.visible = true

        const climbRaw = (tSec - J_START_SEC) / J_CLIMB_DUR
        const climbT   = Math.min(climbRaw, 1)
        const eased    = easeInOut(climbT)

        // Полярная позиция на поверхности глобуса
        const phi   = J_PHI_FROM + (J_PHI_TO - J_PHI_FROM) * eased
        const theta = J_THETA

        // Локальная позиция относительно центра глобуса
        const lx = J_SURFACE_R * Math.sin(phi) * Math.cos(theta)
        const ly = J_SURFACE_R * Math.cos(phi)
        const lz = J_SURFACE_R * Math.sin(phi) * Math.sin(theta)

        // Мировая позиция = orbitGroup + локальная
        // Учитываем вращение orbitGroup
        const localVec = new THREE.Vector3(lx, ly, lz)
        localVec.applyEuler(orbitGroup.rotation)

        jarvisGroup.position.set(
          orbitGroup.position.x + localVec.x,
          orbitGroup.position.y + localVec.y,
          orbitGroup.position.z + localVec.z,
        )

        // Ориентация: "вверх" — нормаль к поверхности глобуса
        const normalWorld = localVec.clone().normalize()
        const upWorld = new THREE.Vector3(0, 1, 0)
        // Матрица поворота: local Y -> normalWorld
        const crossAxis = new THREE.Vector3().crossVectors(upWorld, normalWorld)
        if (crossAxis.lengthSq() > 1e-6) {
          const crossAngle = Math.acos(Math.max(-1, Math.min(1, upWorld.dot(normalWorld))))
          const orientQ = new THREE.Quaternion().setFromAxisAngle(crossAxis.normalize(), crossAngle)
          // Поворачиваем лицом к камере по азимуту
          const faceQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + theta + 0.3, 0))
          jarvisGroup.quaternion.copy(orientQ).multiply(faceQ)
        }

        // Покачивание после приземления
        if (climbT >= 1) {
          const bob = Math.sin(tSec * 1.5) * 0.03
          jarvisGroup.position.y += bob

          // Проецируем позицию ДЖАРВИСА на экран и показываем пузырь
          const screenPos = jarvisGroup.position.clone().project(camera)
          const rect = container!.getBoundingClientRect()
          const sx = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left
          const sy = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top
          bubblePosRef.current = { x: sx, y: sy - 20 }
          if (!bubbleVisibleRef.current) {
            bubbleVisibleRef.current = true
            setBubbleVisible(true)
          }
          // Обновляем позицию пузыря напрямую через DOM (без перерендера)
          if (bubbleRef.current) {
            bubbleRef.current.style.left = `${sx}px`
            bubbleRef.current.style.top  = `${sy - 20}px`
          }
        }

        // Пульсация глаз и реактора
        const pulse = 1.0 + 0.6 * Math.sin(tSec * 3.8)
        ;(eyeL.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse
        ;(eyeR.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse
        ;(eyeBar.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse * 0.7
        ;(antennaTip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + 0.5 * Math.sin(tSec * 2.1)
        ;(reactorRing.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse * 0.9
        ;(reactorCore.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse * 1.1
        eyeLight.position.copy(jarvisGroup.position)
        eyeLight.intensity = 0.25 + 0.25 * Math.sin(tSec * 3.8)
        reactorLight.position.copy(jarvisGroup.position)
        reactorLight.intensity = 0.2 + 0.2 * Math.sin(tSec * 3.8)

        // Плавное появление (fade-in первые 0.5s карабкания)
        const fadeIn = Math.min(climbRaw * 4, 1)
        jarvisGroup.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (!m.transparent) m.transparent = true
            m.opacity = fadeIn
          }
        })
      }

      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w > 0 && h > 0) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
      renderer.dispose()
      earthGeometry.dispose()
      cloudGeometry.dispose()
      atmosphereGeometry.dispose()
      starGeometry.dispose()
      starGeo2.dispose()
      earthMaterial.dispose()
      cloudMaterial.dispose()
      atmosphereMaterial.dispose()
      starMaterial.dispose()
      starMat2.dispose()
      mapTexture.dispose()
      normalTexture.dispose()
      specularTexture.dispose()
      cloudTexture.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = inputRef.current
    if (!el) return
    const query = el.value.trim()
    if (!query) {
      el.style.borderColor = "#FF6B6B"
      setTimeout(() => {
        el.style.borderColor = ""
      }, 1500)
      return
    }
    // eslint-disable-next-line no-alert
    alert(`Ваш запрос принят:\n\n"${query}"\n\nСкоро ваш артефакт появится в Зале Славы!`)
    el.value = ""
  }

  return (
    <div className="eternity-page">
      {/* Глобус и частицы */}
      <div id="globe-bg">
        <div id="three-container" ref={containerRef} />
      </div>
      <div id="particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className="particle"
            style={{
              left: p.left,
              top: p.top,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Основной контент */}
      <div className="container">
        <header className="hero-content">
          <h1>
            Преврати идею
            <br />в вечность
          </h1>
          <p className="hero-subtitle">
            Создавай артефакты, продавай за <InfinityIcon className="ico gold" size={20} aria-hidden="true" /> TimeCoin,
            становись легендой
          </p>

          {/* Миниатюрное окно ввода (всегда видимо) */}
          <form className="artifact-form" onSubmit={handleSubmit}>
            <input ref={inputRef} type="text" placeholder="Опиши свой артефакт..." autoComplete="off" aria-label="Опиши свой артефакт" />
            <button type="submit">
              Создать <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>

          <div className="counter-box">
            <InfinityIcon className="ico gold" size={16} aria-hidden="true" /> Уже создано артефактов:{" "}
            <span id="counter-val">{counter.toLocaleString("ru-RU")}</span>
          </div>

          {/* Кнопки авторизации */}
          <div className="auth-buttons">
            <Link href="/login" className="auth-btn auth-btn-primary">
              <LogIn size={16} strokeWidth={2} aria-hidden="true" />
              Войти
            </Link>
            <Link href="/register" className="auth-btn auth-btn-secondary">
              Регистрация <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </header>
        <div className="hero-visual" />

        <section className="architects-section">
          <h2>Архитекторы вселенной</h2>
          <div className="cards-container">
            <article className="card gold">
              <div className="card-avatar">
                <Crown size={28} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="card-name">OSGARD_ORIGIN</div>
              <div className="card-level">ELYSIAN GRANDMASTER</div>
              <div className="card-rating">
                <InfinityIcon size={16} strokeWidth={1.2} aria-hidden="true" /> (1st)
              </div>
              <div className="card-achievements">
                HALL OF FAME LEADER
                <br />
                12 ARTIFICIAL WONDERS
              </div>
              <div className="card-icons">
                <Award size={18} strokeWidth={1.2} aria-hidden="true" />
                <Star size={18} strokeWidth={1.2} aria-hidden="true" />
                <Crown size={18} strokeWidth={1.2} aria-hidden="true" />
              </div>
            </article>

            <article className="card silver">
              <div className="card-avatar">
                <Gem size={28} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="card-name">MEDUSA_CODE</div>
              <div className="card-level">CYBER-ORACLE</div>
              <div className="card-rating">Top 2</div>
              <div className="card-achievements">
                MASTER OF ALGORITHMS
                <br />9 ARTIFICIAL WONDERS
              </div>
              <div className="card-icons">
                <Award size={18} strokeWidth={1.2} aria-hidden="true" />
                <Star size={18} strokeWidth={1.2} aria-hidden="true" />
                <Crown size={18} strokeWidth={1.2} aria-hidden="true" />
              </div>
            </article>

            <article className="card bronze">
              <div className="card-avatar">
                <Shield size={28} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="card-name">ASSARD1_VALKYRIE</div>
              <div className="card-level">WAR-FORGED ARTISAN</div>
              <div className="card-rating">Top 3</div>
              <div className="card-achievements">
                COMBAT ARTIFACT PIONEER
                <br />7 ARTIFICIAL WONDERS
              </div>
              <div className="card-icons">
                <Award size={18} strokeWidth={1.2} aria-hidden="true" />
                <Star size={18} strokeWidth={1.2} aria-hidden="true" />
                <Crown size={18} strokeWidth={1.2} aria-hidden="true" />
              </div>
            </article>
          </div>
        </section>

        <section className="values-section">
          <h2>Почему OSGARD?</h2>
          <div className="values-container">
            <div className="value-item">
              <div className="value-icon">
                <InfinityIcon size={32} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="value-title">Твоя вечность</div>
              <div className="value-desc">Создай наследие, которое останется в Зале Славы навсегда.</div>
            </div>
            <div className="value-item">
              <div className="value-icon">
                <BarChart2 size={32} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="value-title">Экономика артефактов</div>
              <div className="value-desc">Торгуй, зарабатывай, инвестируй в цифровое будущее.</div>
            </div>
            <div className="value-item">
              <div className="value-icon">
                <Users size={32} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="value-title">Сообщество</div>
              <div className="value-desc">Присоединяйся к элите архитекторов и развивай вселенную.</div>
            </div>
          </div>
        </section>
      </div>

      {/* Речевой пузырь ДЖАРВИСА — HTML-оверлей, позиция обновляется из Three.js */}
      {bubbleVisible && (
        <div
          ref={bubbleRef}
          className="jarvis-bubble"
          aria-live="polite"
          style={{
            position: "fixed",
            left: bubblePosRef.current.x,
            top: bubblePosRef.current.y,
            zIndex: 10,
            pointerEvents: "none",
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="jarvis-text">Привет, архитектор!<br />Я — ДЖАРВИС.</span>
          <div className="jarvis-cursor" />
        </div>
      )}

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.eternity-page {
  position: relative;
  min-height: 100vh;
  background: #020408;
  color: #fff;
  font-family: var(--font-inter), 'Inter', 'Helvetica Neue', sans-serif;
  font-weight: 400;
  letter-spacing: 0.02em;
  overflow-x: hidden;
}
.eternity-page *{ box-sizing: border-box; }

.eternity-page #globe-bg {
  position: fixed; top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: 0; pointer-events: none; overflow: hidden;
}
.eternity-page #three-container { width: 100%; height: 100%; display: block; }

.eternity-page #particles {
  position: fixed; top: 0; left: 0;
  width: 100vw; height: 100vh; pointer-events: none; z-index: 1;
}
.eternity-page .particle {
  position: absolute; width: 1.5px; height: 1.5px;
  background: rgba(160, 200, 255, 0.15); border-radius: 50%;
  animation: eternity-float 30s infinite linear; opacity: 0;
}
@keyframes eternity-float {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-100vh) translateX(40px); opacity: 0; }
}

.eternity-page .container {
  max-width: 1440px; margin: 0 auto; padding: 80px;
  position: relative; z-index: 2;
  display: grid; grid-template-columns: 1fr 1fr; gap: 100px 40px;
  min-height: 100vh;
}

.eternity-page .hero-content {
  display: flex; flex-direction: column; justify-content: center;
  align-items: flex-start; gap: 24px;
}
.eternity-page h1 {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 76px; font-weight: 700; color: #fff;
  letter-spacing: 4px; line-height: 1.1;
  text-shadow: 0 0 80px rgba(70, 150, 255, 0.06);
  animation: eternity-rise 1s ease-out forwards;
}
.eternity-page .hero-subtitle {
  font-size: 18px; font-weight: 300; color: #B0C0D8;
  max-width: 560px; line-height: 1.6; letter-spacing: 0.03em;
  animation: eternity-rise 1s ease-out 0.2s forwards; opacity: 0;
}
.eternity-page .ico { display: inline-block; vertical-align: middle; }
.eternity-page .hero-subtitle .ico.gold {
  color: #FFD700; stroke-width: 1.2;
  filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.3));
}

.eternity-page .artifact-form {
  display: flex; align-items: center; gap: 12px;
  width: 100%; max-width: 560px;
  animation: eternity-rise 1s ease-out 0.4s forwards; opacity: 0; margin-top: 4px;
}
.eternity-page .artifact-form input {
  flex: 1; background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 40px;
  padding: 10px 18px; font-size: 14px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  color: #fff; outline: none;
  transition: border-color 0.3s, box-shadow 0.3s;
  height: 44px; letter-spacing: 0.02em;
}
.eternity-page .artifact-form input::placeholder { color: #4A5A6A; font-weight: 300; }
.eternity-page .artifact-form input:focus {
  border-color: #FFD700; box-shadow: 0 0 20px rgba(255, 215, 0, 0.05);
}
.eternity-page .artifact-form button {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: none; border-radius: 40px; padding: 10px 24px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-weight: 600; font-size: 14px; color: #0A0D14; cursor: pointer;
  transition: all 0.3s ease; white-space: nowrap; height: 44px;
  display: flex; align-items: center; gap: 8px; letter-spacing: 0.04em;
}
.eternity-page .artifact-form button:hover {
  transform: scale(1.03); box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
}
.eternity-page .artifact-form button svg { stroke: #0A0D14; stroke-width: 2; }

.eternity-page .counter-box {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #6A7A8A;
  background: rgba(255, 255, 255, 0.02); padding: 6px 16px;
  border-radius: 20px; border: 1px solid rgba(255, 215, 0, 0.1);
  animation: eternity-rise 1s ease-out 0.6s forwards; opacity: 0; letter-spacing: 0.02em;
}
.eternity-page .counter-box .ico.gold {
  color: #FFD700; stroke-width: 1.2;
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.3));
}

.eternity-page .architects-section h2,
.eternity-page .values-section h2 {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 32px; text-align: center; color: #fff;
  grid-column: 1/-1; margin-bottom: 40px; letter-spacing: 6px;
  text-shadow: 0 0 40px rgba(255, 215, 0, 0.05);
}
.eternity-page .architects-section { grid-column: 1/-1; margin-top: 40px; }
.eternity-page .values-section { grid-column: 1/-1; margin-top: 20px; }

.eternity-page .cards-container,
.eternity-page .values-container {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
}

.eternity-page .card,
.eternity-page .value-item {
  background: transparent; border: none; border-radius: 0; padding: 0;
  box-shadow: none; opacity: 0;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  letter-spacing: 0.02em; width: 100%; max-width: 280px; text-align: center;
}
.eternity-page .card.gold { --card-color: #FFD700; animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards; }
.eternity-page .card.silver { --card-color: #E0E0E0; animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s forwards; }
.eternity-page .card.bronze { --card-color: #CD7F32; animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s forwards; }

.eternity-page .card-avatar {
  width: 64px; height: 64px;
  background: radial-gradient(circle at 30% 30%, #1A2A4A, #0A0E1A 80%);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px; color: var(--card-color, #fff);
  box-shadow: inset 0 0 20px rgba(0, 212, 255, 0.15), 0 0 30px rgba(255, 215, 0, 0.1);
  transition: all 0.4s ease; border: 1px solid rgba(255, 255, 255, 0.08);
}
.eternity-page .card:hover .card-avatar {
  box-shadow: inset 0 0 30px rgba(0, 212, 255, 0.3), 0 0 60px rgba(255, 215, 0, 0.3);
  transform: scale(1.05); border-color: var(--card-color);
}
.eternity-page .card-avatar svg {
  stroke-width: 1.2; filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.3));
}

.eternity-page .card-name { font-size: 24px; font-weight: 600; color: #fff; letter-spacing: 1px; }
.eternity-page .card-level { font-size: 14px; font-weight: 500; color: var(--card-color, #6A8A9A); letter-spacing: 2px; }
.eternity-page .card-rating {
  font-size: 14px; color: #A0B0C8; display: flex; align-items: center; gap: 6px;
  background: rgba(0, 0, 0, 0.3); padding: 4px 14px; border-radius: 20px; letter-spacing: 0.05em;
}
.eternity-page .card-rating svg { stroke-width: 1.2; color: var(--card-color, #FFD700); }
.eternity-page .card-achievements {
  font-size: 12px; color: #6A7A8A; line-height: 1.6; margin-top: 8px; letter-spacing: 0.02em;
}
.eternity-page .card-icons {
  display: flex; gap: 12px; margin-top: 16px; color: var(--card-color, #6A8A9A);
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.2));
}
.eternity-page .card-icons svg { stroke-width: 1.2; transition: all 0.3s ease; }
.eternity-page .card:hover .card-icons svg { filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.5)); }

.eternity-page .value-item {
  max-width: 280px; animation: eternity-rise 0.8s ease-out 0.8s forwards; gap: 16px; --card-color: #7AACFF;
}
.eternity-page .value-icon {
  color: #FFD700; background: rgba(255, 215, 0, 0.05); padding: 16px; border-radius: 50%;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.05); border: 1px solid rgba(255, 215, 0, 0.1);
}
.eternity-page .value-icon svg {
  stroke-width: 1.2; color: #FFD700; filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.2));
}
.eternity-page .value-title { font-size: 18px; font-weight: 600; color: #fff; letter-spacing: 1px; }
.eternity-page .value-desc { font-size: 14px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

.eternity-page .auth-buttons {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  animation: eternity-rise 1s ease-out 0.8s forwards; opacity: 0; margin-top: 4px;
}
.eternity-page .auth-btn {
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 24px; border-radius: 40px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-size: 14px; font-weight: 600; letter-spacing: 0.04em;
  text-decoration: none; cursor: pointer; transition: all 0.3s ease;
  white-space: nowrap;
}
.eternity-page .auth-btn-primary {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: #0A0D14;
}
.eternity-page .auth-btn-primary:hover {
  transform: scale(1.03); box-shadow: 0 0 30px rgba(255, 215, 0, 0.35);
}
.eternity-page .auth-btn-secondary {
  background: rgba(255, 255, 255, 0.04);
  color: #B0C0D8;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.eternity-page .auth-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 215, 0, 0.3);
  color: #fff;
}

@keyframes eternity-rise {
  0% { opacity: 0; transform: translateY(30px); }
  100% { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1100px) {
  .eternity-page .container { grid-template-columns: 1fr; gap: 60px; }
  .eternity-page .hero-content { align-items: center; text-align: center; }
  .eternity-page h1 { font-size: 48px; }
  .eternity-page .artifact-form { max-width: 100%; }
}
@media (max-width: 600px) {
  .eternity-page h1 { font-size: 36px; }
  .eternity-page .artifact-form { flex-direction: column; gap: 10px; }
  .eternity-page .artifact-form input,
  .eternity-page .artifact-form button { width: 100%; height: 44px; }
}

/* ===================== ДЖАРВИС ОВЕРЛЕЙ ===================== */

/*
  z-index: 10 — поверх глобуса (z-index: 0) и частиц (z-index: 1)
  Позиция: правая сторона экрана, центр по вертикали — там где глобус
*/
.eternity-page .jarvis-overlay {
  position: fixed;
  right: 18%;
  bottom: 26%;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  /* Стартовая позиция: скрыт снизу */
  transform: translateY(160px) scale(0.92);
  opacity: 0;
  transition:
    transform 1.5s cubic-bezier(0.22, 1, 0.36, 1),
    opacity   0.8s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, opacity;
}

/* Фаза 1: выглядывает — видна только верхняя часть головы */
.eternity-page .jarvis-overlay.jarvis-peeking {
  transform: translateY(72px) scale(0.96);
  opacity: 0.85;
}

/* Фаза 2: занял позицию на глобусе — лёгкое покачивание */
.eternity-page .jarvis-overlay.jarvis-settled {
  transform: translateY(0) scale(1);
  opacity: 1;
  animation: jarvis-bob 5s ease-in-out infinite;
}

@keyframes jarvis-bob {
  0%,  100% { transform: translateY(0px)   rotate(-0.5deg); }
  25%        { transform: translateY(-5px)  rotate(0.3deg);  }
  50%        { transform: translateY(-9px)  rotate(-0.3deg); }
  75%        { transform: translateY(-4px)  rotate(0.5deg);  }
}

/* --- SVG-голова --- */
.eternity-page .jarvis-head {
  position: relative;
  width: 92px;
  height: 100px;
}

.eternity-page .jarvis-svg {
  width: 92px;
  height: 100px;
  display: block;
  /* Мягкое золотое свечение вокруг головы */
  filter:
    drop-shadow(0 0 6px rgba(255, 215, 0, 0.55))
    drop-shadow(0 0 18px rgba(255, 180, 0, 0.28))
    drop-shadow(0 4px 12px rgba(0, 0, 0, 0.7));
}

/* Пульсация глаз — плавная, без рывков */
.eternity-page .jarvis-eye-left,
.eternity-page .jarvis-eye-right {
  animation: jarvis-eye-pulse 3s ease-in-out infinite;
}
.eternity-page .jarvis-eye-right {
  animation-delay: 0.4s;
}
@keyframes jarvis-eye-pulse {
  0%,  100% { opacity: 1;    filter: drop-shadow(0 0 4px #00D4FF); }
  50%        { opacity: 0.65; filter: drop-shadow(0 0 10px #00D4FF) drop-shadow(0 0 20px rgba(0,212,255,0.6)); }
}

/* Орбитальное кольцо вокруг головы */
.eternity-page .jarvis-halo {
  position: absolute;
  top:    -10px;
  left:   -10px;
  right:  -10px;
  bottom: -10px;
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 0, 0.3);
  animation: jarvis-halo-spin 8s linear infinite;
  pointer-events: none;
}
.eternity-page .jarvis-halo::before {
  content: '';
  position: absolute;
  top: 18%; left: -3px;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #FFD700;
  box-shadow: 0 0 8px #FFD700, 0 0 16px rgba(255, 215, 0, 0.6);
}
@keyframes jarvis-halo-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* --- Речевой пузырь — появляется через 1.5s после settled --- */
.eternity-page .jarvis-bubble {
  position: relative;
  background: rgba(2, 8, 18, 0.88);
  border: 1px solid rgba(255, 215, 0, 0.35);
  border-radius: 12px 12px 12px 4px;
  padding: 10px 16px;
  max-width: 200px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow:
    0 0 16px rgba(255, 215, 0, 0.1),
    0 4px 20px rgba(0, 0, 0, 0.5),
    inset 0 0 8px rgba(255, 215, 0, 0.04);
  /* Задержка 1.5s = время появления + небольшой буфер */
  animation: jarvis-bubble-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 1.5s both;
}

/* Стрелка пузыря вниз к голове */
.eternity-page .jarvis-bubble::after {
  content: '';
  position: absolute;
  bottom: -7px;
  left: 28px;
  width: 12px;
  height: 12px;
  background: rgba(2, 8, 18, 0.88);
  border-right: 1px solid rgba(255, 215, 0, 0.35);
  border-bottom: 1px solid rgba(255, 215, 0, 0.35);
  transform: rotate(45deg);
}

@keyframes jarvis-bubble-in {
  from { opacity: 0; transform: scale(0.88) translateY(-6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}

.eternity-page .jarvis-text {
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #e8d880;
  line-height: 1.55;
  letter-spacing: 0.04em;
  display: inline;
}

/* Мигающий курсор */
.eternity-page .jarvis-cursor {
  display: inline-block;
  width: 2px;
  height: 13px;
  background: #FFD700;
  margin-left: 3px;
  vertical-align: middle;
  animation: jarvis-cursor-blink 1s step-end infinite;
}
@keyframes jarvis-cursor-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

@media (max-width: 1100px) {
  .eternity-page .jarvis-overlay {
    right: 8%;
    bottom: 22%;
  }
}
@media (max-width: 768px) {
  .eternity-page .jarvis-overlay {
    right: 4%;
    bottom: 18%;
  }
  .eternity-page .jarvis-head  { width: 72px; height: 78px; }
  .eternity-page .jarvis-svg   { width: 72px; height: 78px; }
  .eternity-page .jarvis-bubble { max-width: 170px; }
}
`
