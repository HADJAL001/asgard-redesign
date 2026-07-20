"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
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
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [counter, setCounter] = useState(0)

  // Речевой пузырь ДЖАРВИСА
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const bubbleReadyRef = useRef(false)

  // Mouse tracking для взгляда ДЖАРВИСА
  const mouseRef = useRef({ x: 0, y: 0 })
  // Hover/click state
  const [jarvisHovered, setJarvisHovered] = useState(false)

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
    renderer.toneMappingExposure = 1.8
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

    // ── ДЖАРВИС — простая цельная яркая фигура ──
    const jarvisGroup = new THREE.Group()

    // ── МОЩНОЕ ОСВЕЩЕНИЕ СПЕРЕДИ ──
    const jLight1 = new THREE.PointLight(0xFFFFFF, 6.0, 30)
    jLight1.position.set(0, 4, 8)
    scene.add(jLight1)
    const jLight2 = new THREE.DirectionalLight(0xFFEEDD, 5.0)
    jLight2.position.set(0, 3, 10)
    scene.add(jLight2)
    const jLight3 = new THREE.DirectionalLight(0xFFD700, 3.5)
    jLight3.position.set(-4, 2, 6)
    scene.add(jLight3)
    const jLight4 = new THREE.DirectionalLight(0xFF6600, 3.0)
    jLight4.position.set(4, 0, 6)
    scene.add(jLight4)

    // ── МАТЕРИАЛЫ: ЯРКО-КРАСНЫЙ + ЗОЛОТО ──
    const MAT_RED = new THREE.MeshStandardMaterial({
      color: 0xFF1111,
      metalness: 0.7,
      roughness: 0.1,
      emissive: new THREE.Color(0x660000),
      emissiveIntensity: 0.6,
    })
    const MAT_GOLD = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      metalness: 0.85,
      roughness: 0.05,
      emissive: new THREE.Color(0xAA7700),
      emissiveIntensity: 0.5,
    })
    const MAT_EYE = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      emissive: new THREE.Color(0x44CCFF),
      emissiveIntensity: 15.0,
      metalness: 0,
      roughness: 0,
    })
    const MAT_ARC = new THREE.MeshStandardMaterial({
      color: 0xAAEEFF,
      emissive: new THREE.Color(0x00CCFF),
      emissiveIntensity: 18.0,
      metalness: 0,
      roughness: 0,
    })

    // ── ГОЛОВА (отдельная группа для слежения за мышью) ──
    const headGroup = new THREE.Group()

    // Шлем — золотой купол
    const helmetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 20, 16),
      MAT_GOLD
    )
    helmetMesh.scale.set(1.0, 1.2, 1.0)
    headGroup.add(helmetMesh)

    // Лицевая пластина — красная
    const facePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.16, 0.07),
      MAT_RED
    )
    facePlate.position.set(0, -0.02, 0.15)
    headGroup.add(facePlate)

    // Глаза — светящиеся щели
    const eyeGeo = new THREE.BoxGeometry(0.072, 0.022, 0.02)
    const leftEyeM = new THREE.Mesh(eyeGeo, MAT_EYE)
    leftEyeM.position.set(-0.062, 0.024, 0.185)
    headGroup.add(leftEyeM)
    const rightEyeM = new THREE.Mesh(eyeGeo.clone(), MAT_EYE)
    rightEyeM.position.set(0.062, 0.024, 0.185)
    headGroup.add(rightEyeM)

    headGroup.position.y = 0.90
    jarvisGroup.add(headGroup)

    // ── ШЕЯ ──
    const neckM = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.080, 0.10, 12),
      MAT_GOLD
    )
    neckM.position.y = 0.775
    jarvisGroup.add(neckM)

    // ── ТОРС — цельный, широкий, заметный ──
    // Основа торса (красный)
    const torsoMain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.58, 16),
      MAT_RED
    )
    torsoMain.position.y = 0.20
    jarvisGroup.add(torsoMain)

    // Нагрудные пластины (золотые) — левая и правая полосы
    ;[-1, 1].forEach(s => {
      const chest = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.28, 0.10),
        MAT_GOLD
      )
      chest.position.set(s * 0.14, 0.24, 0.17)
      jarvisGroup.add(chest)
    })

    // Поясная пластина (золотая)
    const waist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.17, 0.08, 14),
      MAT_GOLD
    )
    waist.position.y = -0.10
    jarvisGroup.add(waist)

    // Arc Reactor — сердцевина
    const arcCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.042, 24),
      MAT_ARC
    )
    arcCore.position.set(0, 0.22, 0.225)
    jarvisGroup.add(arcCore)

    // Arc Reactor — кольцо
    const arcRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.010, 10, 28),
      MAT_ARC
    )
    arcRing.position.set(0, 0.22, 0.224)
    jarvisGroup.add(arcRing)

    // ── ПЛЕЧИ — золотые купола ──
    ;[-1, 1].forEach(s => {
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 14, 10),
        MAT_GOLD
      )
      shoulder.position.set(s * 0.33, 0.38, 0)
      shoulder.scale.set(1.0, 0.9, 0.9)
      jarvisGroup.add(shoulder)
    })

    // ── РУКИ — цельные (плечо + предплечье + рука как один цилиндр) ──
    ;[-1, 1].forEach(s => {
      // Верхняя рука
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.060, 0.052, 0.30, 12),
        MAT_RED
      )
      upperArm.position.set(s * 0.34, 0.16, 0)
      upperArm.rotation.z = s * 0.15
      jarvisGroup.add(upperArm)

      // Нижняя рука
      const lowerArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.040, 0.28, 12),
        MAT_RED
      )
      lowerArm.position.set(s * 0.38, -0.12, 0)
      lowerArm.rotation.z = s * 0.18
      jarvisGroup.add(lowerArm)

      // Кисть
      const hand = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.070, 0.055),
        MAT_GOLD
      )
      hand.position.set(s * 0.41, -0.30, 0)
      jarvisGroup.add(hand)
    })

    // ── НОГИ — цельные ──
    ;[-1, 1].forEach(s => {
      // Бедро
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.080, 0.068, 0.28, 12),
        MAT_RED
      )
      thigh.position.set(s * 0.115, -0.30, 0)
      jarvisGroup.add(thigh)

      // Колено — золотая пластина
      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.072, 12, 10),
        MAT_GOLD
      )
      knee.position.set(s * 0.115, -0.50, 0)
      knee.scale.set(1.0, 0.65, 0.85)
      jarvisGroup.add(knee)

      // Голень
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.052, 0.28, 12),
        MAT_RED
      )
      shin.position.set(s * 0.115, -0.70, 0)
      jarvisGroup.add(shin)

      // Ступня
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.096, 0.040, 0.18),
        MAT_GOLD
      )
      foot.position.set(s * 0.115, -0.88, 0.030)
      jarvisGroup.add(foot)
    })

    // Arc Reactor свет
    const arcLight = new THREE.PointLight(0x00CCFF, 4.0, 5.0)
    arcLight.position.set(0, 0.22, 0.60)
    jarvisGroup.add(arcLight)

    // Начинаем невидимым — появится плавно
    jarvisGroup.scale.setScalar(0.0)
    scene.add(jarvisGroup)

    // ── ОРБИТАЛЬНАЯ АНИМАЦИЯ ──────────────────────────────────
    // Параметры орбиты
    const ORBIT_RADIUS = 2.8       // радиус орбиты вокруг глобуса
    const ORBIT_HEIGHT = 0.7       // высота над экватором
    const ORBIT_SPEED = (2 * Math.PI) / 12  // 1 оборот за 12 секунд

    let orbitTime = 0
    let jarvisVisible = false

    // Раскастер для клика/ховера
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const jarvisMeshes: THREE.Mesh[] = []
    jarvisGroup.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) jarvisMeshes.push(obj as THREE.Mesh)
    })

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      }
      ndc.set(mouseRef.current.x, mouseRef.current.y)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(jarvisMeshes, false)
      setJarvisHovered(hits.length > 0)
      container.style.cursor = hits.length > 0 ? "pointer" : ""
    }

    const onMouseClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(jarvisMeshes, false)
      if (hits.length > 0) router.push("/jarvis")
    }

    let t2 = 0
    let rafId = 0
    const DELTA = 1 / 60

    // Пузырь через 2 секунды после старта
    setTimeout(() => {
      if (!bubbleReadyRef.current) {
        bubbleReadyRef.current = true
        setBubbleVisible(true)
      }
    }, 2000)

    function animate() {
      rafId = requestAnimationFrame(animate)
      t2 += 0.01
      orbitTime += DELTA

      // Глобус — без изменений
      earth.rotation.y += 0.0025
      clouds.rotation.y += 0.0035
      orbitGroup.rotation.y += 0.0012
      const ox = Math.sin(t2 * 0.08) * 3.0
      const oy = Math.cos(t2 * 0.064) * 1.8
      orbitGroup.position.x = ox
      orbitGroup.position.y = oy + Math.sin(t2 * 0.6) * 0.04
      stars.rotation.y += 0.0001
      stars2.rotation.y -= 0.00005

      // Появление Джарвиса (первые 1.5 секунды)
      if (!jarvisVisible) {
        const scaleT = Math.min(orbitTime / 1.5, 1.0)
        const eased = 1 - Math.pow(1 - scaleT, 3)
        jarvisGroup.scale.setScalar(eased * 1.3)
        if (scaleT >= 1.0) jarvisVisible = true
      }

      // Орбитальный полёт вокруг глобуса
      // Глобус перемещается вместе с orbitGroup, поэтому следим за его позицией
      const globeCenter = new THREE.Vector3(
        orbitGroup.position.x,
        orbitGroup.position.y,
        orbitGroup.position.z
      )

      const angle = orbitTime * ORBIT_SPEED
      // Позиция на орбите относительно центра глобуса
      const orbitX = globeCenter.x + Math.cos(angle) * ORBIT_RADIUS
      const orbitY = globeCenter.y + ORBIT_HEIGHT + Math.sin(orbitTime * 0.4) * 0.15 // лёгкое покачивание
      const orbitZ = globeCenter.z + Math.sin(angle) * ORBIT_RADIUS

      jarvisGroup.position.set(orbitX, orbitY, orbitZ)

      // Поворот к центру глобуса (анализирует Землю)
      const toGlobe = new THREE.Vector3(
        globeCenter.x - orbitX,
        globeCenter.y - orbitY,
        globeCenter.z - orbitZ
      ).normalize()

      // lookAt с сохранением "верха"
      const targetQuat = new THREE.Quaternion()
      const lookMat = new THREE.Matrix4()
      const up = new THREE.Vector3(0, 1, 0)
      lookMat.lookAt(
        new THREE.Vector3(orbitX, orbitY, orbitZ),
        new THREE.Vector3(globeCenter.x, globeCenter.y, globeCenter.z),
        up
      )
      targetQuat.setFromRotationMatrix(lookMat)
      jarvisGroup.quaternion.slerp(targetQuat, 0.08)

      // Пульс Arc Reactor
      const pulse = 0.7 + 0.3 * Math.sin(orbitTime * 3.5)
      ;(arcCore.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse * 14.0
      ;(arcRing.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse * 9.0
      arcLight.intensity = pulse * 4.0

      // Голова следит за мышью (лёгкий поворот)
      const tRX = mouseRef.current.y * 0.15
      const tRY = mouseRef.current.x * 0.20
      headGroup.rotation.x += (tRX - headGroup.rotation.x) * 0.05
      headGroup.rotation.y += (tRY - headGroup.rotation.y) * 0.05

      renderer.render(scene, camera)
    }
    animate()

    container.addEventListener("mousemove", onMouseMove)
    container.addEventListener("click", onMouseClick)

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
      cancelAnimationFrame(rafId)
      container.removeEventListener("mousemove", onMouseMove)
      container.removeEventListener("click", onMouseClick)
      window.removeEventListener("resize", onResize)
      renderer.dispose()
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

      {/* Речевой пузырь ДЖАРВИСА — HTML-оверлей поверх Three.js */}
      {bubbleVisible && (
        <div
          ref={bubbleRef}
          className="jarvis-speech-bubble"
          aria-live="polite"
          style={{ position: "fixed", zIndex: 20, pointerEvents: "none", transform: "translate(-50%, calc(-100% - 20px))" }}
        >
          <span className="jarvis-speech-text">
            Привет, архитектор!<br />Я — ДЖАРВИС.<br />Анализирую Землю...
          </span>
          <div className="jarvis-speech-arrow" />
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
  z-index: 0; pointer-events: auto; overflow: hidden;
}
.eternity-page #three-container { width: 100%; height: 100%; display: block; cursor: default; }

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

/* ── РЕЧЕВОЙ ПУЗЫРЬ ДЖАРВИСА ─────────────────────────────── */
.jarvis-speech-bubble {
  /* позиция задаётся через style={{ left, top }} из animate() */
  background: rgba(4, 10, 20, 0.82);
  border: 2px solid #FFD700;
  border-radius: 14px 14px 14px 4px;
  padding: 12px 18px;
  min-width: 200px;
  max-width: 240px;
  text-align: center;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
    0 0 24px rgba(255, 215, 0, 0.18),
    0 0 6px rgba(255, 215, 0, 0.35),
    0 6px 28px rgba(0, 0, 0, 0.6),
    inset 0 0 12px rgba(255, 215, 0, 0.05);
  animation: jarvis-bubble-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes jarvis-bubble-pop {
  0%   { opacity: 0; transform: translate(-50%, -100%) scale(0.82); }
  100% { opacity: 1; transform: translate(-50%, -100%) scale(1);    }
}

.jarvis-speech-text {
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: #FFE566;
  line-height: 1.55;
  letter-spacing: 0.03em;
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.4), 0 1px 3px rgba(0,0,0,0.7);
  display: block;
}

/* Стрелка вниз к голове */
.jarvis-speech-arrow {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 10px solid #FFD700;
}
.jarvis-speech-arrow::after {
  content: '';
  position: absolute;
  top: -12px;
  left: -7px;
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 8px solid rgba(4, 10, 20, 0.82);
}
`
