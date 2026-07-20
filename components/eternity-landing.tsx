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

const WM_CSS = `.wm-scene{position:fixed;bottom:40px;right:5vw;z-index:10;pointer-events:none;display:flex;flex-direction:column;align-items:center}.wm-svg{width:140px;height:195px;filter:drop-shadow(0 6px 20px rgba(212,160,23,0.6)) drop-shadow(0 2px 8px rgba(0,0,0,0.9))}.wm-bubble{margin-top:10px;background:rgba(8,12,22,0.97);border:1.5px solid #F5C842;border-radius:12px;padding:9px 16px;font-size:12px;font-weight:600;color:#F5C842;white-space:nowrap;letter-spacing:0.03em;box-shadow:0 2px 20px rgba(245,200,66,0.15)}@media(max-width:600px){.wm-scene{right:2vw;bottom:20px}.wm-svg{width:110px;height:154px}.wm-bubble{font-size:11px;padding:7px 12px}}`

// ─── ВАЛЛИ минималистичный ──────────────────────────────────────────
function WalleOnGlobe() {
  return (
    <div className="wm-scene" aria-label="ВАЛЛИ на глобусе">
      <svg className="wm-svg" viewBox="-10 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Антенна */}
        <line x1="50" y1="10" x2="50" y2="2" stroke="#F5C842" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="50" cy="1" r="3.5" fill="#F5C842"/>
        <circle cx="50" cy="1" r="1.5" fill="#fff"/>

        {/* Голова — бинокль */}
        <rect x="20" y="10" width="60" height="30" rx="5" fill="#D4A017" stroke="#5C3A21" strokeWidth="1.5"/>
        {/* Подсветка головы */}
        <rect x="22" y="12" width="56" height="8" rx="3" fill="#F5C842" opacity="0.25"/>

        {/* Глаз левый */}
        <circle cx="34" cy="25" r="10" fill="#1A1A2E" stroke="#F5C842" strokeWidth="2"/>
        <circle cx="34" cy="25" r="6" fill="#1A4A8A"/>
        <circle cx="34" cy="25" r="3" fill="#0A2A5A"/>
        <circle cx="36" cy="22" r="2" fill="#4A9AFF" opacity="0.8"/>
        <circle cx="37" cy="21" r="1" fill="#fff" opacity="0.9"/>

        {/* Глаз правый */}
        <circle cx="66" cy="25" r="10" fill="#1A1A2E" stroke="#F5C842" strokeWidth="2"/>
        <circle cx="66" cy="25" r="6" fill="#1A4A8A"/>
        <circle cx="66" cy="25" r="3" fill="#0A2A5A"/>
        <circle cx="68" cy="22" r="2" fill="#4A9AFF" opacity="0.8"/>
        <circle cx="69" cy="21" r="1" fill="#fff" opacity="0.9"/>

        {/* Шея */}
        <rect x="43" y="40" width="14" height="12" rx="3" fill="#B8860B" stroke="#5C3A21" strokeWidth="1"/>
        <rect x="44" y="42" width="12" height="4" rx="1" fill="#F5C842" opacity="0.3"/>

        {/* Тело */}
        <rect x="18" y="52" width="64" height="42" rx="5" fill="#D4A017" stroke="#5C3A21" strokeWidth="2"/>
        {/* Боковые тени */}
        <rect x="18" y="52" width="8" height="42" rx="0" fill="#5C3A21" opacity="0.4"/>
        <rect x="74" y="52" width="8" height="42" rx="0" fill="#5C3A21" opacity="0.4"/>
        {/* Верхняя полоса (светлая) */}
        <rect x="20" y="54" width="60" height="6" rx="2" fill="#F5C842" opacity="0.2"/>

        {/* WALL·E надпись */}
        <text x="50" y="72" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="7" fill="#F5C842" letterSpacing="1">WALL·E</text>
        <text x="50" y="71.5" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="7" fill="#5C3A21" opacity="0.5" letterSpacing="1">WALL·E</text>

        {/* LED полоса (зелёная) */}
        <rect x="68" y="76" width="8" height="14" rx="2" fill="#0A0F0A" stroke="#1A2A1A" strokeWidth="0.5"/>
        <rect x="69.5" y="77.5" width="5" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="69.5" y="81" width="5" height="2" rx="0.5" fill="#00FF44"/>
        <rect x="69.5" y="84.5" width="5" height="2" rx="0.5" fill="#00CC33"/>
        <rect x="69.5" y="88" width="5" height="2" rx="0.5" fill="#005A15" opacity="0.6"/>

        {/* Дверца компрессора */}
        <rect x="24" y="76" width="40" height="16" rx="2" fill="#5C3A21" stroke="#3A2010" strokeWidth="1"/>
        <rect x="26" y="78" width="36" height="8" rx="1" fill="#3A2010"/>
        <rect x="28" y="80" width="32" height="3" rx="1" fill="#B8860B" opacity="0.5"/>

        {/* Рука ЛЕВАЯ — широкий отступ */}
        <rect x="-2" y="56" width="22" height="8" rx="4" fill="#D4A017" stroke="#5C3A21" strokeWidth="1.5"/>
        {/* Кубик */}
        <rect x="-8" y="60" width="14" height="14" rx="2" fill="#8A7050" stroke="#F5C842" strokeWidth="1.5"/>
        <rect x="-7" y="61" width="12" height="4" rx="1" fill="#F5C842" opacity="0.25"/>
        <rect x="-6" y="66" width="4" height="4" rx="1" fill="#5C3A21" opacity="0.6"/>
        <rect x="0" y="65" width="3" height="5" rx="1" fill="#7A6040" opacity="0.7"/>

        {/* Рука ПРАВАЯ — широкий отступ, яркий цвет */}
        <rect x="80" y="56" width="22" height="8" rx="4" fill="#D4A017" stroke="#F5C842" strokeWidth="2"/>
        {/* Клешня — видная */}
        <line x1="102" y1="58" x2="108" y2="52" stroke="#F5C842" strokeWidth="3" strokeLinecap="round"/>
        <line x1="102" y1="62" x2="108" y2="68" stroke="#F5C842" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="109" cy="51" r="2.5" fill="#F5C842"/>
        <circle cx="109" cy="69" r="2.5" fill="#F5C842"/>

        {/* Гусеница левая */}
        <rect x="12" y="94" width="28" height="14" rx="7" fill="#2A2A2A" stroke="#444" strokeWidth="1.5"/>
        <rect x="14" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="21" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="28" y="101" width="5" height="5" rx="1" fill="#555"/>
        <ellipse cx="14" cy="101" rx="5" ry="6" fill="#383838"/>
        <ellipse cx="38" cy="101" rx="5" ry="6" fill="#383838"/>

        {/* Гусеница правая */}
        <rect x="60" y="94" width="28" height="14" rx="7" fill="#2A2A2A" stroke="#444" strokeWidth="1.5"/>
        <rect x="62" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="69" y="101" width="5" height="5" rx="1" fill="#555"/>
        <rect x="76" y="101" width="5" height="5" rx="1" fill="#555"/>
        <ellipse cx="62" cy="101" rx="5" ry="6" fill="#383838"/>
        <ellipse cx="86" cy="101" rx="5" ry="6" fill="#383838"/>

        {/* Тень */}
        <ellipse cx="50" cy="118" rx="40" ry="4" fill="rgba(0,0,0,0.35)"/>
      </svg>
      <div className="wm-bubble" role="status">
        Привет, архитектор! Я — ВАЛЛИ.
      </div>
      <style dangerouslySetInnerHTML={{__html: WM_CSS}} />
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

`
