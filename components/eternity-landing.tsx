"use client"

import { useEffect, useRef, useState, type FormEvent, useCallback } from "react"
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
  LogIn,
  CheckCircle,
  Sparkles,
  X,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { Reveal } from "@/components/landing/Reveal"
import {
  IconIdea,
  IconCreate,
  IconLegend,
  IconMarket,
  IconDialogue,
  IconDashboard,
  IconCommunity,
  IconTrade,
  IconEarn,
  IconInvest,
} from "@/components/icons/premium"

// ─── Кастомный модальный компонент ─────────────────────────────────────
function ArtifactSuccessModal({
  artifactName,
  onClose,
}: {
  artifactName: string
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const confetti: {
      x: number; y: number; vx: number; vy: number
      color: string; size: number; rotation: number; rotSpeed: number; opacity: number
    }[] = []

    const colors = ["#FFD700", "#FFA500", "#FF6B6B", "#7AACFF", "#A855F7", "#34D399", "#F472B6"]

    for (let i = 0; i < 120; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        opacity: 1,
      })
    }

    let rafId = 0
    let t = 0
    const animate = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let allDone = true
      for (const p of confetti) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.08
        p.rotation += p.rotSpeed
        if (t > 80) p.opacity -= 0.012
        if (p.opacity > 0) allDone = false
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.opacity)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (!allDone) rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(rafId)
  }, [])

  // закрытие по Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className="artifact-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Артефакт создан">
      <canvas ref={canvasRef} className="artifact-confetti-canvas" />
      <div className="artifact-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="artifact-modal-close" onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
        <div className="artifact-modal-icon">
          <div className="artifact-modal-icon-ring" />
          <CheckCircle size={40} strokeWidth={1.5} />
        </div>
        <div className="artifact-modal-title">Запрос принят!</div>
        <div className="artifact-modal-subtitle">
          Твой артефакт
        </div>
        <div className="artifact-modal-name">
          <Sparkles size={14} strokeWidth={1.5} />
          &ldquo;{artifactName}&rdquo;
          <Sparkles size={14} strokeWidth={1.5} />
        </div>
        <div className="artifact-modal-desc">
          скоро появится в <span className="artifact-modal-highlight">Зале Славы</span>
        </div>
        <button className="artifact-modal-btn" onClick={onClose}>
          Отлично! <ArrowRight size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export function EternityLanding() {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [counter, setCounter] = useState(0)
  const [modalArtifact, setModalArtifact] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeModal = useCallback(() => setModalArtifact(null), [])

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
      el.style.boxShadow = "0 0 20px rgba(255, 107, 107, 0.3)"
      setTimeout(() => {
        el.style.borderColor = ""
        el.style.boxShadow = ""
      }, 1500)
      return
    }
    setIsSubmitting(true)
    setTimeout(() => {
      setModalArtifact(query)
      setIsSubmitting(false)
      el.value = ""
    }, 400)
  }

  const scrollToForm = () => {
    const el = inputRef.current
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.focus()
  }

  return (
    <div className="eternity-page">
      {/* Глобус и частицы */}
      <div id="globe-bg">
        <div id="three-container" ref={containerRef} />
        <div id="globe-vignette" aria-hidden="true" />
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

      {/* Модальное окно успеха */}
      {modalArtifact && (
        <ArtifactSuccessModal artifactName={modalArtifact} onClose={closeModal} />
      )}

      {/* Основной контент */}
      <div className="container">
        <header className="hero-content">
          <h1>
            Преврати идею
            <br />в вечность
          </h1>
          <div className="tc-badge">
            <InfinityIcon size={14} strokeWidth={1.4} aria-hidden="true" />
            Цифровое золото нового поколения
            <span className="tc-badge-dot" aria-hidden="true" />
          </div>
          <p className="hero-subtitle">
            Создавай артефакты, продавай за <InfinityIcon className="ico gold" size={20} aria-hidden="true" /> TimeCoin,
            становись легендой
          </p>

          {/* Миниатюрное окно ввода (всегда видимо) */}
          <form className="artifact-form" onSubmit={handleSubmit}>
            <input ref={inputRef} type="text" placeholder="Опиши свой артефакт..." autoComplete="off" aria-label="Опиши свой артефакт" />
            <button type="submit" disabled={isSubmitting} className={isSubmitting ? "submitting" : ""}>
              {isSubmitting ? (
                <><span className="btn-spinner" /> Создаём...</>
              ) : (
                <>Создать <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></>
              )}
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
        <div className="hero-visual">
          <WalleOnGlobe />
        </div>

        <section className="how-section">
          <Reveal><h2>Как это работает</h2></Reveal>
          <div className="how-container">
            <Reveal delay={0} className="how-item">
              <div className="how-step">01</div>
              <IconIdea size={36} />
              <div className="how-title">Задумай идею</div>
              <div className="how-desc">Опиши концепцию будущего артефакта — от киберпанк-клинка до древнего свитка.</div>
            </Reveal>
            <Reveal delay={0.12} className="how-item">
              <div className="how-step">02</div>
              <IconCreate size={36} />
              <div className="how-title">Создай артефакт</div>
              <div className="how-desc">AI воплощает идею в уникальный цифровой артефакт за считаные секунды.</div>
            </Reveal>
            <Reveal delay={0.24} className="how-item">
              <div className="how-step">03</div>
              <IconLegend size={36} />
              <div className="how-title">Стань легендой</div>
              <div className="how-desc">Продай за TimeCoin, поднимись в Зале Славы, войди в историю OSGARD.</div>
            </Reveal>
          </div>
        </section>

        <section className="examples-section">
          <Reveal><h2>Примеры проектов</h2></Reveal>
          <div className="examples-container">
            <Reveal delay={0} className="example-card">
              <div className="example-preview example-preview-1" />
              <div className="example-body">
                <IconMarket size={28} />
                <div className="example-title">Магазин артефактов</div>
                <div className="example-desc">Витрина для продажи уникальных артефактов сообществу.</div>
              </div>
            </Reveal>
            <Reveal delay={0.12} className="example-card">
              <div className="example-preview example-preview-2" />
              <div className="example-body">
                <IconDialogue size={28} />
                <div className="example-title">Живой диалог</div>
                <div className="example-desc">Интерактивные истории и сюжетные миры с AI-персонажами.</div>
              </div>
            </Reveal>
            <Reveal delay={0.24} className="example-card">
              <div className="example-preview example-preview-3" />
              <div className="example-body">
                <IconDashboard size={28} />
                <div className="example-title">Личный дашборд</div>
                <div className="example-desc">Аналитика роста твоей вселенной и коллекции артефактов.</div>
              </div>
            </Reveal>
          </div>
        </section>

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

        <section className="economy-section">
          <Reveal><h2>Экономика артефактов</h2></Reveal>
          <div className="values-container">
            <Reveal delay={0} className="value-item">
              <IconTrade size={32} />
              <div className="value-title">Торгуй</div>
              <div className="value-desc">Продавай и покупай артефакты на открытом рынке TimeCoin.</div>
            </Reveal>
            <Reveal delay={0.12} className="value-item">
              <IconEarn size={32} />
              <div className="value-title">Зарабатывай</div>
              <div className="value-desc">Получай TimeCoin за каждый созданный шедевр.</div>
            </Reveal>
            <Reveal delay={0.24} className="value-item">
              <IconInvest size={32} />
              <div className="value-title">Инвестируй</div>
              <div className="value-desc">Вкладывай накопленное в новые вселенные и расти вместе с платформой.</div>
            </Reveal>
          </div>
        </section>

        <section className="community-section">
          <Reveal className="community-inner">
            <IconCommunity size={40} />
            <h2>Сообщество</h2>
            <p className="community-desc">Присоединяйся к элите архитекторов и развивай вселенную вместе с ними.</p>
          </Reveal>
        </section>

        <section className="final-cta-section">
          <Reveal className="final-cta-inner">
            <h2>Готов оставить свой след в вечности?</h2>
            <button type="button" className="final-cta-btn" onClick={scrollToForm}>
              Создать артефакт <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </Reveal>
        </section>
      </div>

      <style>{CSS}</style>
    </div>
  )
}

const WM_CSS = `.wm-scene{position:absolute;bottom:32px;right:6%;z-index:10;pointer-events:none;display:flex;flex-direction:column;align-items:center}.wm-svg{width:180px;height:252px;image-rendering:crisp-edges;shape-rendering:geometricPrecision;filter:drop-shadow(0 12px 32px rgba(120,70,20,0.55)) drop-shadow(0 3px 8px rgba(0,0,0,0.9));animation:wm-bob 6s cubic-bezier(0.45,0.05,0.55,0.95) infinite;will-change:transform}.wm-echo-badge{margin-top:8px;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:#8A7050;opacity:0.75;font-family:monospace}.wm-bubble{margin-top:6px;background:rgba(4,5,10,0.97);border:1px solid rgba(180,140,80,0.3);border-radius:6px;padding:7px 16px;font-size:11px;font-weight:400;color:#A08A60;white-space:nowrap;letter-spacing:0.06em;font-family:monospace}@keyframes wm-bob{0%,100%{transform:translateY(0) rotate(-0.4deg)}45%{transform:translateY(-9px) rotate(0.25deg)}75%{transform:translateY(-4px) rotate(-0.15deg)}}@media(max-width:600px){.wm-scene{right:4%;bottom:16px}.wm-svg{width:140px;height:196px}.wm-bubble{font-size:10px;padding:6px 12px}.wm-echo-badge{font-size:8px}}`

// ─── ВАЛЛИ минималистичный ──────────────────────────────────────────
function WalleOnGlobe() {
  const { t } = useTranslation()
  return (
    <div className="wm-scene" aria-label={t("walli.echoAriaLabel")}>
      <svg className="wm-svg" viewBox="-10 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Антенна */}
        <line x1="50" y1="10" x2="50" y2="2" stroke="#8A7050" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="50" cy="1.5" r="2.5" fill="#6A5030"/>
        <circle cx="50" cy="1.5" r="1" fill="#C8A870" opacity="0.7"/>

        {/* Голова — тёмная бронза */}
        <rect x="20" y="10" width="60" height="30" rx="3" fill="#3C2E1E"/>
        <rect x="21" y="11" width="58" height="5" rx="2" fill="#5A4530" opacity="0.7"/>
        <rect x="20" y="36" width="60" height="4" rx="0" fill="#2A1E10" opacity="0.6"/>

        {/* Глаз левый — тёплый янтарь */}
        <circle cx="34" cy="25" r="10" fill="#1C140A"/>
        <circle cx="34" cy="25" r="7.5" fill="#2C1E10"/>
        <circle cx="34" cy="25" r="5" fill="#6B4820"/>
        <circle cx="34" cy="25" r="2.8" fill="#C09050"/>
        <circle cx="35.5" cy="23" r="1.5" fill="#E8C880" opacity="0.6"/>
        <circle cx="34" cy="25" r="1" fill="#0A0806"/>

        {/* Глаз правый */}
        <circle cx="66" cy="25" r="10" fill="#1C140A"/>
        <circle cx="66" cy="25" r="7.5" fill="#2C1E10"/>
        <circle cx="66" cy="25" r="5" fill="#6B4820"/>
        <circle cx="66" cy="25" r="2.8" fill="#C09050"/>
        <circle cx="67.5" cy="23" r="1.5" fill="#E8C880" opacity="0.6"/>
        <circle cx="66" cy="25" r="1" fill="#0A0806"/>

        {/* Шея */}
        <rect x="44" y="40" width="12" height="12" rx="2" fill="#2A1E10"/>

        {/* Тело */}
        <rect x="18" y="52" width="64" height="42" rx="3" fill="#3C2E1E"/>
        <rect x="18" y="52" width="5" height="42" fill="#1A1008" opacity="0.6"/>
        <rect x="77" y="52" width="5" height="42" fill="#1A1008" opacity="0.6"/>
        <rect x="23" y="53" width="54" height="3" rx="1" fill="#5A4530" opacity="0.4"/>

        {/* Панель — благородная медь */}
        <rect x="26" y="60" width="32" height="20" rx="2" fill="#241A0C"/>
        <rect x="28" y="62" width="28" height="7" rx="1" fill="#8A6030" opacity="0.3"/>
        <text x="42" y="75" textAnchor="middle" fontFamily="monospace" fontWeight="600" fontSize="5.5" fill="#8A6830" opacity="0.8" letterSpacing="1.2">WALL·E</text>

        {/* LED индикатор — тёплый */}
        <rect x="66" y="62" width="6" height="12" rx="1.5" fill="#180E06"/>
        <rect x="67" y="63.5" width="4" height="1.8" rx="0.5" fill="#C07820" opacity="0.7"/>
        <rect x="67" y="67" width="4" height="1.8" rx="0.5" fill="#A06018" opacity="0.5"/>
        <rect x="67" y="70.5" width="4" height="1.8" rx="0.5" fill="#803010" opacity="0.3"/>

        {/* Рука левая */}
        <rect x="0" y="58" width="18" height="6" rx="3" fill="#3C2E1E"/>
        <rect x="-6" y="62" width="12" height="12" rx="2" fill="#2A1E10"/>
        <rect x="-5" y="63" width="10" height="3" rx="1" fill="#5A4030" opacity="0.4"/>

        {/* Рука правая */}
        <rect x="82" y="58" width="18" height="6" rx="3" fill="#3C2E1E"/>
        <line x1="100" y1="60" x2="105" y2="55" stroke="#2A1E10" strokeWidth="2" strokeLinecap="round"/>
        <line x1="100" y1="63" x2="105" y2="68" stroke="#2A1E10" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="106" cy="54.5" r="1.8" fill="#1A1008"/>
        <circle cx="106" cy="68.5" r="1.8" fill="#1A1008"/>

        {/* Гусеницы — тёмная сталь */}
        <rect x="12" y="94" width="28" height="14" rx="7" fill="#1C1408"/>
        <rect x="14" y="100" width="5" height="5" rx="1" fill="#2C2018" opacity="0.9"/>
        <rect x="21" y="100" width="5" height="5" rx="1" fill="#2C2018" opacity="0.9"/>
        <rect x="28" y="100" width="5" height="5" rx="1" fill="#2C2018" opacity="0.9"/>
        <ellipse cx="14.5" cy="101" rx="5" ry="6" fill="#241608"/>
        <ellipse cx="37.5" cy="101" rx="5" ry="6" fill="#241608"/>

        <rect x="60" y="94" width="28" height="14" rx="7" fill="#1C1408"/>
        <rect x="62" y="100" width="5" height="5" rx="1" fill="#2C2018" opacity="0.9"/>
        <rect x="69" y="100" width="5" height="5" rx="1" fill="#2C2018" opacity="0.9"/>
        <rect x="76" y="100" width="5" height="5" rx="1" fill="#2C2018" opacity="0.9"/>
        <ellipse cx="62.5" cy="101" rx="5" ry="6" fill="#241608"/>
        <ellipse cx="85.5" cy="101" rx="5" ry="6" fill="#241608"/>

        {/* Тень */}
        <ellipse cx="50" cy="118" rx="36" ry="3" fill="rgba(0,0,0,0.35)"/>
      </svg>
      <div className="wm-echo-badge">{t("walli.echoBadge")}</div>
      <div className="wm-bubble" role="status">
        {t("walli.echoBubble")}
      </div>
      <style>{WM_CSS}</style>
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
  position: absolute; top: 0; left: 0;
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
.eternity-page .hero-visual { position: relative; }
.eternity-page h1 {
  font-family: var(--font-space), 'Playfair Display', serif;
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
.eternity-page .how-section h2,
.eternity-page .examples-section h2,
.eternity-page .economy-section h2 {
  font-family: var(--font-space), 'Playfair Display', serif;
  font-size: 32px; text-align: center; color: #fff;
  grid-column: 1/-1; margin-bottom: 40px; letter-spacing: 6px;
  text-shadow: 0 0 40px rgba(255, 215, 0, 0.05);
}
.eternity-page .architects-section { grid-column: 1/-1; margin-top: 100px; }
.eternity-page .how-section { grid-column: 1/-1; margin-top: 60px; }
.eternity-page .examples-section { grid-column: 1/-1; margin-top: 100px; }
.eternity-page .economy-section { grid-column: 1/-1; margin-top: 100px; }

.eternity-page .cards-container,
.eternity-page .values-container {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
}

.eternity-page .card,
.eternity-page .value-item {
  position: relative;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 16px; padding: 32px 24px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: none; opacity: 0;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  letter-spacing: 0.02em; width: 100%; max-width: 280px; text-align: center;
  transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
}
.eternity-page .card::before,
.eternity-page .value-item::before {
  content: ""; position: absolute; inset: 0; border-radius: 16px; padding: 1px;
  background: linear-gradient(150deg, var(--eg-gold-1), var(--eg-gold-3) 60%, transparent);
  opacity: 0.35;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none;
}
.eternity-page .card:hover,
.eternity-page .value-item:hover {
  transform: translateY(-4px);
  border-color: rgba(212, 175, 55, 0.3);
  box-shadow: var(--eg-glow-gold);
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

.eternity-page .economy-section .value-item {
  max-width: 280px; opacity: 1; animation: none; gap: 16px; --card-color: #7AACFF;
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
  .eternity-page .hero-visual { min-height: 340px; }
  .eternity-page h1 { font-size: 48px; }
  .eternity-page .artifact-form { max-width: 100%; }
}
@media (max-width: 600px) {
  .eternity-page .hero-visual { min-height: 260px; }
  .eternity-page h1 { font-size: 36px; }
  .eternity-page .artifact-form { flex-direction: column; gap: 10px; }
  .eternity-page .artifact-form input,
  .eternity-page .artifact-form button { width: 100%; height: 44px; }
}

/* ─── Spinner на кнопке ─── */
.eternity-page .artifact-form button.submitting {
  opacity: 0.85; cursor: wait;
}
.btn-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid rgba(10,13,20,0.3);
  border-top-color: #0A0D14;
  border-radius: 50%;
  animation: btn-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes btn-spin {
  to { transform: rotate(360deg); }
}

/* ─── Модальное окно ─── */
.artifact-modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(2, 4, 8, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: modal-fade-in 0.25s ease-out forwards;
}
@keyframes modal-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.artifact-confetti-canvas {
  position: fixed; inset: 0;
  pointer-events: none; z-index: 10000;
}

.artifact-modal-card {
  position: relative; z-index: 10001;
  background: linear-gradient(145deg, #0E1420, #0A0D18);
  border: 1px solid rgba(255, 215, 0, 0.18);
  border-radius: 20px;
  padding: 48px 40px 40px;
  max-width: 420px; width: calc(100% - 32px);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  text-align: center;
  box-shadow: 0 0 80px rgba(255, 215, 0, 0.08), 0 32px 64px rgba(0,0,0,0.6);
  animation: modal-card-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes modal-card-in {
  from { opacity: 0; transform: scale(0.88) translateY(20px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.artifact-modal-close {
  position: absolute; top: 16px; right: 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 50%; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  color: #6A7A8A; cursor: pointer; transition: all 0.2s;
}
.artifact-modal-close:hover {
  background: rgba(255,255,255,0.1); color: #fff;
  border-color: rgba(255,215,0,0.3);
}

.artifact-modal-icon {
  position: relative; width: 80px; height: 80px;
  display: flex; align-items: center; justify-content: center;
  color: #FFD700; margin-bottom: 4px;
}
.artifact-modal-icon-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(255,215,0,0.3);
  animation: icon-ring-pulse 2s ease-in-out infinite;
}
@keyframes icon-ring-pulse {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50%       { transform: scale(1.15); opacity: 0.9; }
}
.artifact-modal-icon svg {
  filter: drop-shadow(0 0 20px rgba(255,215,0,0.5));
  animation: icon-appear 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.15s both;
}
@keyframes icon-appear {
  from { transform: scale(0) rotate(-20deg); opacity: 0; }
  to   { transform: scale(1) rotate(0deg); opacity: 1; }
}

.artifact-modal-title {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 28px; font-weight: 700; color: #fff;
  letter-spacing: 2px;
}
.artifact-modal-subtitle {
  font-size: 14px; color: #6A7A8A; letter-spacing: 0.04em;
}
.artifact-modal-name {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 600; color: #FFD700;
  background: rgba(255,215,0,0.06);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 12px; padding: 10px 20px;
  letter-spacing: 0.02em; word-break: break-word;
  max-width: 100%;
}
.artifact-modal-name svg { flex-shrink: 0; color: #FFA500; }
.artifact-modal-desc {
  font-size: 14px; color: #8090A8; letter-spacing: 0.03em;
}
.artifact-modal-highlight {
  color: #FFD700; font-weight: 600;
  filter: drop-shadow(0 0 8px rgba(255,215,0,0.3));
}
.artifact-modal-btn {
  margin-top: 12px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: none; border-radius: 40px; padding: 12px 32px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-weight: 700; font-size: 15px; color: #0A0D14;
  cursor: pointer; transition: all 0.3s ease;
  display: flex; align-items: center; gap: 8px;
  letter-spacing: 0.04em;
  box-shadow: 0 0 30px rgba(255,215,0,0.2);
}
.artifact-modal-btn:hover {
  transform: scale(1.04);
  box-shadow: 0 0 50px rgba(255,215,0,0.4);
}
.artifact-modal-btn svg { stroke: #0A0D14; }

/* ─── TimeCoin-бейдж ─── */
.eternity-page .tc-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; color: var(--eg-gold-1);
  background: rgba(212, 175, 55, 0.08); border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 20px; padding: 6px 14px; letter-spacing: 0.06em; text-transform: uppercase;
  animation: eternity-rise 1s ease-out 0.1s forwards; opacity: 0;
}
.eternity-page .tc-badge svg { color: var(--eg-gold-1); filter: drop-shadow(0 0 6px rgba(212, 175, 55, 0.5)); }
.eternity-page .tc-badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--eg-gold-1); box-shadow: 0 0 8px rgba(247, 224, 94, 0.8);
  animation: eg-pulse-dot 2s ease-in-out infinite;
}

/* ─── Виньетка вокруг глобуса ─── */
.eternity-page #globe-vignette {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(circle at center, transparent 35%, rgba(6, 6, 11, 0.85) 90%);
}

/* ─── Премиум-иконки: hover glow ─── */
.eternity-page .eg-icon-svg {
  filter: drop-shadow(0 0 8px rgba(212, 175, 55, 0.3));
  transition: transform 0.3s ease;
}
.eternity-page .how-item:hover .eg-icon-svg,
.eternity-page .example-body:hover .eg-icon-svg,
.eternity-page .value-item:hover .eg-icon-svg,
.eternity-page .community-inner:hover .eg-icon-svg {
  animation: eg-icon-glow 1.6s ease-in-out infinite;
  transform: scale(1.08);
}

/* ─── «Как это работает» ─── */
.eternity-page .how-container {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
}
.eternity-page .how-item {
  position: relative;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 16px; padding: 32px 24px; width: 100%; max-width: 300px;
  display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
}
.eternity-page .how-item:hover {
  transform: translateY(-4px); border-color: rgba(212, 175, 55, 0.3); box-shadow: var(--eg-glow-gold);
}
.eternity-page .how-step {
  font-family: var(--font-space), sans-serif; font-size: 13px; font-weight: 700;
  color: var(--eg-gold-2); letter-spacing: 0.1em; opacity: 0.7;
}
.eternity-page .how-title { font-size: 18px; font-weight: 600; color: #fff; letter-spacing: 0.5px; margin-top: 4px; }
.eternity-page .how-desc { font-size: 14px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

/* ─── «Примеры проектов» ─── */
.eternity-page .examples-container {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
}
.eternity-page .example-card {
  position: relative; overflow: hidden;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 16px; width: 100%; max-width: 320px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
}
.eternity-page .example-card:hover {
  transform: translateY(-4px); border-color: rgba(212, 175, 55, 0.3); box-shadow: var(--eg-glow-gold);
}
.eternity-page .example-preview { height: 140px; width: 100%; }
.eternity-page .example-preview-1 { background: radial-gradient(circle at 30% 30%, rgba(212,175,55,0.35), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-2 { background: radial-gradient(circle at 70% 40%, rgba(106,90,205,0.35), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-3 { background: radial-gradient(circle at 50% 70%, rgba(45,125,210,0.3), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-body {
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
  padding: 24px;
}
.eternity-page .example-title { font-size: 16px; font-weight: 600; color: #fff; letter-spacing: 0.5px; }
.eternity-page .example-desc { font-size: 13px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

/* ─── «Сообщество» ─── */
.eternity-page .community-section { grid-column: 1/-1; margin-top: 100px; display: flex; justify-content: center; }
.eternity-page .community-inner {
  position: relative; text-align: center; max-width: 560px; width: 100%;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 20px; padding: 48px 32px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.eternity-page .community-inner h2 {
  font-family: var(--font-space), 'Playfair Display', serif;
  font-size: 28px; color: #fff; letter-spacing: 4px; margin: 0;
}
.eternity-page .community-desc { font-size: 15px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

/* ─── Финальный CTA ─── */
.eternity-page .final-cta-section { grid-column: 1/-1; margin-top: 100px; margin-bottom: 40px; display: flex; justify-content: center; }
.eternity-page .final-cta-inner {
  text-align: center; display: flex; flex-direction: column; align-items: center; gap: 24px;
}
.eternity-page .final-cta-inner h2 {
  font-family: var(--font-space), 'Playfair Display', serif;
  font-size: 30px; color: #fff; letter-spacing: 3px; max-width: 560px; margin: 0;
}
.eternity-page .final-cta-btn {
  display: inline-flex; align-items: center; gap: 10px;
  background: linear-gradient(135deg, var(--eg-gold-1), var(--eg-gold-3));
  border: none; border-radius: 40px; padding: 14px 32px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-weight: 700; font-size: 15px; color: #0A0D14; cursor: pointer;
  transition: all 0.3s ease; letter-spacing: 0.04em;
}
.eternity-page .final-cta-btn:hover {
  transform: scale(1.03); box-shadow: var(--eg-glow-gold);
}

/* ─── Float-анимация лидерборд-карточек (не пересекается с framer-motion Reveal, т.к. .card не обёрнут в Reveal) ─── */
@media (prefers-reduced-motion: no-preference) {
  .eternity-page .card { will-change: transform; }
  .eternity-page .card.gold { animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards, eg-float 6s ease-in-out 1.2s infinite; }
  .eternity-page .card.silver { animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s forwards, eg-float 6.6s ease-in-out 1.4s infinite; }
  .eternity-page .card.bronze { animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s forwards, eg-float 7.2s ease-in-out 1.6s infinite; }
}
@media (max-width: 600px) {
  .eternity-page .card.gold,
  .eternity-page .card.silver,
  .eternity-page .card.bronze {
    animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
  }
}

@media (max-width: 1100px) {
  .eternity-page .how-container,
  .eternity-page .examples-container,
  .eternity-page .values-container { flex-direction: column; align-items: center; }
  .eternity-page .community-inner { padding: 36px 24px; }
}

`
