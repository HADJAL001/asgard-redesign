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

  return <div id="three-container" ref={containerRef} />
}
