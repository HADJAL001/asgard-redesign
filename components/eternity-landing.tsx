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

    let t2 = 0
    let rafId = 0

    function animate() {
      rafId = requestAnimationFrame(animate)
      t2 += 0.01

      earth.rotation.y += 0.0025
      clouds.rotation.y += 0.0035
      orbitGroup.rotation.y += 0.0012
      const ox = Math.sin(t2 * 0.08) * 3.0
      const oy = Math.cos(t2 * 0.064) * 1.8
      orbitGroup.position.x = ox
      orbitGroup.position.y = oy + Math.sin(t2 * 0.6) * 0.04
      stars.rotation.y += 0.0001
      stars2.rotation.y -= 0.00005

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
      cancelAnimationFrame(rafId)
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

      {/* ВАЛЛИ на глобусе */}
      <WalleOnGlobe />

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

      <style>{CSS}</style>
    </div>
  )
}

// ─── ВАЛЛИ на глобусе ────────────────────────────────────────────────────────
function WalleOnGlobe() {
  const [dustParticles] = useState(() =>
    Array.from({ length: 28 }).map((_, i) => ({
      id: i,
      x: 40 + Math.random() * 220,
      y: 60 + Math.random() * 120,
      size: 1 + Math.random() * 3,
      dur: 2.5 + Math.random() * 4,
      delay: Math.random() * 5,
      drift: (Math.random() - 0.5) * 40,
    }))
  )
  const [trashPieces] = useState(() =>
    Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      x: 20 + Math.random() * 260,
      y: 120 + Math.random() * 60,
      rot: Math.random() * 360,
      size: 4 + Math.random() * 8,
    }))
  )

  return (
    <div className="walle-scene" aria-label="ВАЛЛИ стоит на глобусе">
      {/* Атмосфера тёплого света */}
      <div className="walle-warm-glow" />

      {/* Частицы пыли */}
      <svg className="walle-dust-svg" viewBox="0 0 300 200" aria-hidden="true">
        {dustParticles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.size}
            fill="rgba(210,160,80,0.35)"
            style={{
              animation: `walleDustFloat ${p.dur}s ${p.delay}s infinite ease-in-out`,
              transformOrigin: `${p.x}px ${p.y}px`,
            }}
          />
        ))}
        {/* Мусор на земле */}
        {trashPieces.map((t) => (
          <g key={t.id} transform={`translate(${t.x},${t.y}) rotate(${t.rot})`}>
            <rect
              x={-t.size / 2}
              y={-t.size / 4}
              width={t.size}
              height={t.size / 2}
              rx="1"
              fill={`hsl(${20 + Math.random() * 30},40%,${25 + Math.random() * 20}%)`}
              opacity="0.7"
            />
          </g>
        ))}
      </svg>

      {/* ВАЛЛИ SVG */}
      <svg
        className="walle-svg"
        viewBox="0 0 120 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Ржавый оранжево-жёлтый металл */}
          <linearGradient id="wBodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C8861A" />
            <stop offset="40%" stopColor="#A86A10" />
            <stop offset="100%" stopColor="#7A4A08" />
          </linearGradient>
          <linearGradient id="wBodyFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4920E" />
            <stop offset="60%" stopColor="#B07010" />
            <stop offset="100%" stopColor="#804808" />
          </linearGradient>
          {/* Гусеница */}
          <linearGradient id="wTrackGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3A2A18" />
            <stop offset="100%" stopColor="#1A1008" />
          </linearGradient>
          {/* Линза */}
          <radialGradient id="wLensL" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#C8E8FF" />
            <stop offset="40%" stopColor="#6AACDF" />
            <stop offset="100%" stopColor="#1A3A5A" />
          </radialGradient>
          <radialGradient id="wLensR" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#C8E8FF" />
            <stop offset="40%" stopColor="#6AACDF" />
            <stop offset="100%" stopColor="#1A3A5A" />
          </radialGradient>
          {/* Свечение LED */}
          <filter id="ledGlow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="bodyGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Ржавчина */}
          <filter id="rust">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
            <feColorMatrix type="matrix"
              values="0.3 0 0 0 0.5
                      0 0.2 0 0 0.2
                      0 0 0.1 0 0
                      0 0 0 0.4 0"
              result="rustColor" />
            <feBlend in="SourceGraphic" in2="rustColor" mode="multiply" />
          </filter>
          <clipPath id="lensClipL">
            <ellipse cx="36" cy="50" rx="13" ry="12" />
          </clipPath>
          <clipPath id="lensClipR">
            <ellipse cx="84" cy="50" rx="13" ry="12" />
          </clipPath>
        </defs>

        {/* ── ГУСЕНИЦЫ ── */}
        {/* Левая гусеница */}
        <ellipse cx="30" cy="148" rx="22" ry="9" fill="url(#wTrackGrad)" />
        <rect x="10" y="140" width="40" height="16" rx="8" fill="url(#wTrackGrad)" />
        {/* Зубья гусеницы */}
        {[14, 20, 26, 32, 38, 44].map((x, i) => (
          <rect key={i} x={x} y="153" width="4" height="5" rx="1" fill="#2A1A0A" />
        ))}
        {/* Колёса */}
        {[16, 26, 36].map((x, i) => (
          <circle key={i} cx={x} cy="148" r="5" fill="#4A3010" stroke="#2A1A08" strokeWidth="1" />
        ))}
        {[16, 26, 36].map((x, i) => (
          <circle key={i} cx={x} cy="148" r="2" fill="#1A0A04" />
        ))}

        {/* Правая гусеница */}
        <ellipse cx="90" cy="148" rx="22" ry="9" fill="url(#wTrackGrad)" />
        <rect x="70" y="140" width="40" height="16" rx="8" fill="url(#wTrackGrad)" />
        {[74, 80, 86, 92, 98, 104].map((x, i) => (
          <rect key={i} x={x} y="153" width="4" height="5" rx="1" fill="#2A1A0A" />
        ))}
        {[76, 86, 96].map((x, i) => (
          <circle key={i} cx={x} cy="148" r="5" fill="#4A3010" stroke="#2A1A08" strokeWidth="1" />
        ))}
        {[76, 86, 96].map((x, i) => (
          <circle key={i} cx={x} cy="148" r="2" fill="#1A0A04" />
        ))}

        {/* ── ОСНОВНОЕ ТЕЛО ── */}
        <rect x="22" y="90" width="76" height="55" rx="6" fill="url(#wBodyGrad)" filter="url(#rust)" />
        {/* Передняя панель */}
        <rect x="22" y="90" width="76" height="55" rx="6" fill="url(#wBodyFront)" opacity="0.85" />
        {/* Тёмные грани */}
        <rect x="22" y="90" width="76" height="3" rx="2" fill="rgba(0,0,0,0.4)" />
        <rect x="22" y="142" width="76" height="3" rx="2" fill="rgba(0,0,0,0.5)" />

        {/* Надпись WALL•E */}
        <text x="60" y="108" textAnchor="middle" fontFamily="monospace" fontWeight="bold"
          fontSize="7.5" fill="rgba(0,0,0,0.7)" letterSpacing="0.5">WALL•E</text>
        <text x="60" y="107.5" textAnchor="middle" fontFamily="monospace" fontWeight="bold"
          fontSize="7.5" fill="rgba(255,200,80,0.5)" letterSpacing="0.5">WALL•E</text>

        {/* Компрессор — дверца (приоткрыта) */}
        <rect x="30" y="113" width="44" height="26" rx="3" fill="#6A4008" stroke="#3A2004" strokeWidth="1" />
        <rect x="32" y="115" width="40" height="12" rx="2" fill="#3A2004" opacity="0.8" />
        {/* Внутренний пресс */}
        <rect x="34" y="118" width="36" height="5" rx="1" fill="#5A3A0A" />
        <rect x="36" y="120" width="32" height="2" rx="1" fill="#8A6020" />

        {/* LED полоса (зелёная) */}
        <rect x="78" y="113" width="12" height="26" rx="3" fill="#0A1A0A" filter="url(#ledGlow)" />
        {[116, 120, 124, 126, 128, 130, 132, 134].map((y, i) => (
          <rect key={i} x="80" y={y} width="8" height="2" rx="1"
            fill={i < 6 ? "#00FF44" : "#004A10"}
            opacity={i < 6 ? 0.9 : 0.4}
            filter={i < 6 ? "url(#ledGlow)" : undefined}
          />
        ))}

        {/* Боковые направляющие */}
        <rect x="18" y="95" width="6" height="45" rx="2" fill="#8A5A10" />
        <rect x="96" y="95" width="6" height="45" rx="2" fill="#8A5A10" />
        {/* Заклёпки */}
        {[98, 108, 118, 128].map((y, i) => (
          <circle key={i} cx="21" cy={y} r="1.5" fill="#A07020" />
        ))}
        {[98, 108, 118, 128].map((y, i) => (
          <circle key={i} cx="99" cy={y} r="1.5" fill="#A07020" />
        ))}

        {/* ── РУКА ЛЕВАЯ (с кубиком) ── */}
        <rect x="2" y="100" width="8" height="28" rx="3" fill="#9A6810" />
        <rect x="0" y="122" width="12" height="6" rx="2" fill="#7A5008" />
        {/* Кубик металлолома */}
        <rect x="-4" y="124" width="14" height="14" rx="2" fill="#8A7050"
          stroke="#5A4030" strokeWidth="1" />
        {/* Текстура кубика */}
        <rect x="-2" y="126" width="4" height="4" rx="1" fill="#6A5040" opacity="0.7" />
        <rect x="4" y="128" width="3" height="5" rx="1" fill="#7A6050" opacity="0.6" />
        <rect x="-1" y="132" width="5" height="3" rx="1" fill="#5A4030" opacity="0.8" />
        {/* Отблеск */}
        <rect x="-3" y="124" width="14" height="2" rx="1" fill="rgba(255,220,120,0.2)" />

        {/* ── РУКА ПРАВАЯ ── */}
        <rect x="110" y="100" width="8" height="28" rx="3" fill="#9A6810" />
        {/* Клешня */}
        <line x1="114" y1="128" x2="108" y2="136" stroke="#7A5008" strokeWidth="3" strokeLinecap="round" />
        <line x1="114" y1="128" x2="120" y2="136" stroke="#7A5008" strokeWidth="3" strokeLinecap="round" />
        <line x1="114" y1="128" x2="114" y2="138" stroke="#7A5008" strokeWidth="3" strokeLinecap="round" />

        {/* ── ШЕЯ (телескопическая) ── */}
        <rect x="48" y="65" width="10" height="28" rx="3" fill="#8A6010" />
        <rect x="51" y="60" width="7" height="32" rx="3" fill="#A07818" />
        <rect x="53" y="55" width="5" height="35" rx="2" fill="#B88A20" />
        {/* Сегменты шеи */}
        {[68, 74, 80].map((y, i) => (
          <rect key={i} x="47" y={y} width="12" height="3" rx="1" fill="#6A4808" opacity="0.6" />
        ))}

        {/* Второй сегмент шеи (правая сторона) */}
        <rect x="62" y="65" width="10" height="28" rx="3" fill="#8A6010" />
        <rect x="63" y="60" width="7" height="32" rx="3" fill="#A07818" />
        <rect x="64" y="55" width="5" height="35" rx="2" fill="#B88A20" />

        {/* ── ГОЛОВА ("бинокль") ── */}
        {/* Корпус головы */}
        <rect x="26" y="28" width="68" height="38" rx="8" fill="url(#wBodyGrad)" />
        <rect x="26" y="28" width="68" height="38" rx="8" fill="url(#wBodyFront)" opacity="0.9" />

        {/* Левый "бинокль" — корпус */}
        <ellipse cx="36" cy="50" rx="15" ry="14" fill="#6A4808" stroke="#3A2404" strokeWidth="1.5" />
        {/* Левая линза */}
        <ellipse cx="36" cy="50" rx="13" ry="12" fill="url(#wLensL)" />
        {/* Механическая диафрагма — кольца */}
        <ellipse cx="36" cy="50" rx="13" ry="12" fill="none" stroke="#1A3A5A" strokeWidth="1" opacity="0.6" />
        <ellipse cx="36" cy="50" rx="9" ry="8" fill="none" stroke="#2A5A8A" strokeWidth="0.8" opacity="0.5" />
        {/* Лепестки диафрагмы */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
          <line key={i}
            x1={36 + 5 * Math.cos(deg * Math.PI / 180)}
            y1={50 + 4.5 * Math.sin(deg * Math.PI / 180)}
            x2={36 + 11 * Math.cos(deg * Math.PI / 180)}
            y2={50 + 10 * Math.sin(deg * Math.PI / 180)}
            stroke="rgba(40,80,120,0.5)" strokeWidth="1.2" strokeLinecap="round"
          />
        ))}
        {/* Блик линзы */}
        <ellipse cx="30" cy="44" rx="3" ry="2.5" fill="rgba(255,255,255,0.35)" transform="rotate(-20,30,44)" />
        <circle cx="31" cy="43" r="1" fill="rgba(255,255,255,0.5)" />
        {/* Зрачок (активен, смотрит на зрителя) */}
        <circle cx="36" cy="50" r="4" fill="#0A1A2A" />
        <circle cx="36" cy="50" r="2.5" fill="#1A2A3A" />
        <circle cx="37.5" cy="48.5" r="1" fill="rgba(255,255,255,0.7)" />

        {/* Правый "бинокль" — корпус */}
        <ellipse cx="84" cy="50" rx="15" ry="14" fill="#6A4808" stroke="#3A2404" strokeWidth="1.5" />
        {/* Правая линза */}
        <ellipse cx="84" cy="50" rx="13" ry="12" fill="url(#wLensR)" />
        <ellipse cx="84" cy="50" rx="13" ry="12" fill="none" stroke="#1A3A5A" strokeWidth="1" opacity="0.6" />
        <ellipse cx="84" cy="50" rx="9" ry="8" fill="none" stroke="#2A5A8A" strokeWidth="0.8" opacity="0.5" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
          <line key={i}
            x1={84 + 5 * Math.cos(deg * Math.PI / 180)}
            y1={50 + 4.5 * Math.sin(deg * Math.PI / 180)}
            x2={84 + 11 * Math.cos(deg * Math.PI / 180)}
            y2={50 + 10 * Math.sin(deg * Math.PI / 180)}
            stroke="rgba(40,80,120,0.5)" strokeWidth="1.2" strokeLinecap="round"
          />
        ))}
        <ellipse cx="78" cy="44" rx="3" ry="2.5" fill="rgba(255,255,255,0.35)" transform="rotate(-20,78,44)" />
        <circle cx="79" cy="43" r="1" fill="rgba(255,255,255,0.5)" />
        <circle cx="84" cy="50" r="4" fill="#0A1A2A" />
        <circle cx="84" cy="50" r="2.5" fill="#1A2A3A" />
        <circle cx="85.5" cy="48.5" r="1" fill="rgba(255,255,255,0.7)" />

        {/* Перемычка между глазами */}
        <rect x="50" y="44" width="20" height="12" rx="3" fill="#7A5010" />
        <rect x="52" y="46" width="16" height="3" rx="1" fill="#5A3808" opacity="0.6" />

        {/* Мелкие детали головы */}
        <rect x="28" y="30" width="64" height="8" rx="4" fill="rgba(0,0,0,0.15)" />
        {/* Антенна */}
        <line x1="60" y1="28" x2="60" y2="16" stroke="#8A6010" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="14" r="3" fill="#FFD700" filter="url(#ledGlow)" />
        <circle cx="60" cy="14" r="1.5" fill="#FFF8A0" />

        {/* Ушные крепления */}
        <rect x="22" y="38" width="6" height="14" rx="3" fill="#7A5010" />
        <rect x="92" y="38" width="6" height="14" rx="3" fill="#7A5010" />

        {/* Тёплый свет на теле снизу */}
        <ellipse cx="60" cy="160" rx="45" ry="6" fill="rgba(220,150,50,0.12)" />
      </svg>

      {/* Речевой пузырь */}
      <div className="walle-bubble" role="status" aria-live="polite">
        <span className="walle-bubble-text">Привет, архитектор! Я — ВАЛЛИ.</span>
        <div className="walle-bubble-tail" />
      </div>

      <style>{WALLE_CSS}</style>
    </div>
  )
}

const WALLE_CSS = `
.walle-scene {
  position: fixed;
  bottom: 60px;
  right: 6vw;
  width: 220px;
  z-index: 10;
  pointer-events: none;
  animation: walleEntrance 1.2s cubic-bezier(0.2,0.8,0.2,1) 0.5s both;
}

@keyframes walleEntrance {
  0%   { opacity: 0; transform: translateY(60px) scale(0.7); }
  60%  { transform: translateY(-10px) scale(1.04); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* Тёплое кинематографическое свечение */
.walle-warm-glow {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 180px;
  height: 80px;
  background: radial-gradient(ellipse, rgba(230,160,60,0.22) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  animation: walleGlowPulse 3s ease-in-out infinite;
}

@keyframes walleGlowPulse {
  0%, 100% { opacity: 0.7; transform: translateX(-50%) scale(1); }
  50% { opacity: 1; transform: translateX(-50%) scale(1.1); }
}

/* SVG пыль */
.walle-dust-svg {
  position: absolute;
  bottom: -10px;
  left: -40px;
  width: 300px;
  height: 200px;
  pointer-events: none;
  z-index: 1;
  opacity: 0.6;
}

@keyframes walleDustFloat {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.1; }
  25%  { transform: translate(var(--drift, 8px), -18px) scale(1.2); opacity: 0.5; }
  50%  { transform: translate(calc(var(--drift, 8px) * 0.5), -35px) scale(0.9); opacity: 0.3; }
  75%  { transform: translate(0, -50px) scale(0.6); opacity: 0.15; }
  100% { transform: translate(0, -60px) scale(0.3); opacity: 0; }
}

/* ВАЛЛИ SVG */
.walle-svg {
  position: relative;
  z-index: 2;
  width: 140px;
  height: 210px;
  margin: 0 auto;
  display: block;
  filter: drop-shadow(0 8px 24px rgba(180,100,20,0.45)) drop-shadow(0 2px 8px rgba(0,0,0,0.6));
  animation: walleBob 3.5s ease-in-out infinite;
}

@keyframes walleBob {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  30%       { transform: translateY(-6px) rotate(0.8deg); }
  60%       { transform: translateY(-3px) rotate(-0.5deg); }
}

/* Речевой пузырь */
.walle-bubble {
  position: absolute;
  top: -10px;
  right: 130px;
  background: rgba(15, 20, 30, 0.92);
  border: 1px solid rgba(255, 200, 80, 0.4);
  border-radius: 16px 16px 4px 16px;
  padding: 10px 14px;
  min-width: 170px;
  max-width: 200px;
  backdrop-filter: blur(8px);
  box-shadow:
    0 4px 24px rgba(0,0,0,0.5),
    0 0 20px rgba(255,200,80,0.08),
    inset 0 1px 0 rgba(255,255,255,0.06);
  z-index: 3;
  pointer-events: none;
  animation: walleBubblePop 0.6s cubic-bezier(0.2,0.8,0.2,1) 1.5s both;
}

@keyframes walleBubblePop {
  0%   { opacity: 0; transform: scale(0.6) translateX(20px); }
  70%  { transform: scale(1.05) translateX(-2px); }
  100% { opacity: 1; transform: scale(1) translateX(0); }
}

.walle-bubble-text {
  font-family: var(--font-inter, 'Inter', sans-serif);
  font-size: 12px;
  font-weight: 500;
  color: #E8D080;
  line-height: 1.5;
  letter-spacing: 0.02em;
  display: block;
}

.walle-bubble-tail {
  position: absolute;
  bottom: -8px;
  right: 16px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 0;
  border-top: 8px solid rgba(255,200,80,0.4);
}

@media (max-width: 700px) {
  .walle-scene {
    bottom: 40px;
    right: 2vw;
    width: 160px;
  }
  .walle-svg { width: 110px; height: 165px; }
  .walle-bubble {
    right: 100px;
    min-width: 140px;
    font-size: 11px;
  }
}
`

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

`
