"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export default function GlobeScene() {
  const containerRef = useRef<HTMLDivElement>(null)

  // Three.js globe scene
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const width = container.clientWidth
    const height = container.clientHeight
    const compactScene = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const quality = compactScene
      ? { pixelRatio: 1.25, earthSegments: 56, cloudSegments: 40, atmosphereSegments: 32, starLayers: [900, 540, 360] }
      : { pixelRatio: 1.5, earthSegments: 96, cloudSegments: 64, atmosphereSegments: 48, starLayers: [5000, 3000, 2000] }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020408)

    // The three star bands live at z=-1000/-500/-100. Keep them inside the
    // frustum; the previous 500-unit far plane silently clipped the backdrop.
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1800)
    camera.position.set(0, 0.8, 10)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      // Keep the local fallback visible when WebGL is unavailable or blocked.
      container.style.background = "#020408 url('/earth-realistic.png') center 70% / min(80vw, 620px) auto no-repeat"
      return
    }
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.8
    container.appendChild(renderer.domElement)

    const showFallback = () => {
      container.style.background = "#020408 url('/earth-realistic.png') center 70% / min(80vw, 620px) auto no-repeat"
    }


    const loader = new THREE.TextureLoader()
    const textureTier = compactScene ? "compact" : "full"
    const textures = textureTier === "compact"
      ? {
          map: "/textures/earth/earth-day.jpg",
          night: "/textures/earth/earth-night.jpg",
          normal: "/textures/earth/earth_normal_1024.jpg",
          specular: "/textures/earth/earth_specular_1024.jpg",
          clouds: "/textures/earth/earth_clouds_512.png",
        }
      : {
          map: "/textures/earth/earth-day.jpg",
          night: "/textures/earth/earth-night.jpg",
          normal: "/textures/earth/earth_normal_2048.jpg",
          specular: "/textures/earth/earth_specular_2048.jpg",
          clouds: "/textures/earth/earth_clouds_1024.png",
        }

    const mapTexture = loader.load(textures.map)
    mapTexture.anisotropy = 8
    const nightTexture = loader.load(textures.night)
    const normalTexture = loader.load(textures.normal)
    const specularTexture = loader.load(textures.specular)
    const cloudTexture = loader.load(textures.clouds)

    const earthMaterial = new THREE.MeshPhysicalMaterial({
      map: mapTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: specularTexture,
      roughness: 0.4,
      metalness: 0.1,
      emissiveMap: nightTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.6,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.8,
      color: new THREE.Color(0xccddff),
    })

    const earthGeometry = new THREE.SphereGeometry(1.26, quality.earthSegments, quality.earthSegments)
    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    const orbitGroup = new THREE.Group()
    if (compactScene) orbitGroup.scale.setScalar(0.52)
    orbitGroup.add(earth)

    const cloudMaterial = new THREE.MeshPhongMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const cloudGeometry = new THREE.SphereGeometry(1.27, quality.cloudSegments, quality.cloudSegments)
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
    const atmosphereGeometry = new THREE.SphereGeometry(1.3, quality.atmosphereSegments, quality.atmosphereSegments)
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

    const createStarLayer = (count: number, depth: number, size: number, opacity: number) => {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const radius = 100 + Math.random() * 260
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
        positions[i * 3 + 2] = depth + radius * Math.cos(phi)
        const warmth = Math.random()
        colors[i * 3] = warmth > 0.88 ? 1 : 0.68 + Math.random() * 0.32
        colors[i * 3 + 1] = warmth > 0.88 ? 0.78 : 0.78 + Math.random() * 0.22
        colors[i * 3 + 2] = warmth > 0.88 ? 0.46 : 0.9 + Math.random() * 0.1
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      const material = new THREE.PointsMaterial({ color: 0xffffff, size, vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
      return new THREE.Points(geometry, material)
    }

    // Three physical depth bands keep the backdrop a scene, not a flat video plate.
    const farStars = createStarLayer(quality.starLayers[0], -1000, 0.42, 0.52)
    const midStars = createStarLayer(quality.starLayers[1], -500, 0.58, 0.66)
    const nearStars = createStarLayer(quality.starLayers[2], -100, 0.82, 0.88)
    scene.add(farStars, midStars, nearStars)
    const pointerTarget = new THREE.Vector2()
    const pointerPosition = new THREE.Vector2()
    const onPointerMove = (event: PointerEvent) => {
      pointerTarget.set((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * -2)
    }
    if (!compactScene && !reducedMotion) window.addEventListener("pointermove", onPointerMove, { passive: true })

    orbitGroup.rotation.x = 0.2
    orbitGroup.rotation.z = -0.1

    // Timer is the supported Three.js clock. Connecting it also prevents a
    // hidden tab from producing a large animation jump when it becomes visible.
    const timer = new THREE.Timer()
    timer.connect(document)
    let rafId = 0
    let sceneActive = !document.hidden

    function animate(timestamp?: number) {
      rafId = 0
      if (!sceneActive) return
      if (!reducedMotion) {
        timer.update(timestamp)
        const elapsed = timer.getElapsed()
        // Time-based movement stays smooth across monitors and makes the hero feel alive.
        earth.rotation.y = elapsed * 0.24
        clouds.rotation.y = elapsed * 0.34
        orbitGroup.rotation.y = elapsed * 0.1
        const ox = Math.sin(elapsed * 0.2) * 0.34
        const oy = Math.cos(elapsed * 0.16) * 0.2
        orbitGroup.position.x = ox
        orbitGroup.position.y = (compactScene ? -2.15 : 0) + oy + Math.sin(elapsed * 1.2) * 0.025
        farStars.rotation.y = elapsed * 0.0018
        midStars.rotation.y = -elapsed * 0.0045
        nearStars.rotation.y = elapsed * 0.009
        pointerPosition.lerp(pointerTarget, 0.035)
        nearStars.position.set(pointerPosition.x * 3.4, pointerPosition.y * 2.2, 0)
      }

      renderer.render(scene, camera)
      if (!reducedMotion) rafId = requestAnimationFrame(animate)
    }
    if (compactScene) orbitGroup.position.y = -2.15
    animate()

    const onVisibilityChange = () => {
      sceneActive = !document.hidden
      if (sceneActive) {
        timer.reset()
        if (!rafId) animate()
      } else {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      sceneActive = false
      cancelAnimationFrame(rafId)
      rafId = 0
      showFallback()
    }

    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w > 0 && h > 0) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio))
        renderer.setSize(w, h)
      }
    }
    window.addEventListener("resize", onResize)
    document.addEventListener("visibilitychange", onVisibilityChange)
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost, false)
      timer.dispose()
      earthGeometry.dispose()
      earthMaterial.dispose()
      cloudGeometry.dispose()
      cloudMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      ;[farStars, midStars, nearStars].forEach((stars) => {
        stars.geometry.dispose()
        ;(stars.material as THREE.PointsMaterial).dispose()
      })
      mapTexture.dispose()
      nightTexture.dispose()
      normalTexture.dispose()
      specularTexture.dispose()
      cloudTexture.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      id="three-container"
      ref={containerRef}
      aria-hidden="true"
      style={{ background: "#020408" }}
    />
  )
}
