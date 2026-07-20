const fs = require('fs');
const filePath = 'A:\\HADJAL\\Рабочий стол\\asgard-redesign\\components\\eternity-landing.tsx';

let src = fs.readFileSync(filePath, 'utf8');

// Маркеры
const START = '    // ── ДЖАРВИС — Iron Man (с анимацией карабкания) ──';
const END   = '    container.addEventListener("mousemove", onMouseMove)';

const si = src.indexOf(START);
const ei = src.indexOf(END);

if (si === -1 || ei === -1) {
  console.error('Markers not found! si=' + si + ' ei=' + ei);
  process.exit(1);
}

const newBlock = `    // ── ДЖАРВИС — Iron Man v2 (ЯРКИЙ) ──
    const jarvisGroup = new THREE.Group()

    // ── МОЩНОЕ ОСВЕЩЕНИЕ СПЕРЕДИ ──
    const jLight1 = new THREE.PointLight(0xFFFFFF, 5.0, 25)
    jLight1.position.set(0, 4, 8)
    scene.add(jLight1)
    const jLight2 = new THREE.DirectionalLight(0xFFEEDD, 4.0)
    jLight2.position.set(0, 3, 10)
    scene.add(jLight2)
    const jLight3 = new THREE.DirectionalLight(0xFFD700, 2.5)
    jLight3.position.set(-4, 2, 6)
    scene.add(jLight3)
    const jLight4 = new THREE.DirectionalLight(0xFF4400, 2.0)
    jLight4.position.set(4, 0, 6)
    scene.add(jLight4)

    // ── МАТЕРИАЛЫ: ЯРКИЙ КРАСНЫЙ + ЧИСТОЕ ЗОЛОТО ──
    const MAT_RED = new THREE.MeshStandardMaterial({
      color: 0xCC0000, metalness: 0.75, roughness: 0.12,
      emissive: new THREE.Color(0x440000), emissiveIntensity: 0.4,
    })
    const MAT_GOLD = new THREE.MeshStandardMaterial({
      color: 0xFFD700, metalness: 0.8, roughness: 0.08,
      emissive: new THREE.Color(0x886600), emissiveIntensity: 0.25,
    })
    const MAT_DARK = new THREE.MeshStandardMaterial({
      color: 0x991100, metalness: 0.7, roughness: 0.2,
    })
    const MAT_EYE = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF, emissive: new THREE.Color(0x44AAFF), emissiveIntensity: 10.0, metalness: 0, roughness: 0,
    })
    const MAT_ARC = new THREE.MeshStandardMaterial({
      color: 0x88EEFF, emissive: new THREE.Color(0x00AAFF), emissiveIntensity: 12.0, metalness: 0, roughness: 0,
    })

    // ── ГОЛОВА ──
    const headGroup = new THREE.Group()
    const helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), MAT_GOLD)
    helmetMesh.scale.set(1, 1.15, 0.95)
    headGroup.add(helmetMesh)
    const faceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.055), MAT_RED)
    faceMesh.position.set(0, -0.02, 0.13)
    headGroup.add(faceMesh)
    const eyeGeoS = new THREE.BoxGeometry(0.068, 0.020, 0.018)
    const leftEyeM = new THREE.Mesh(eyeGeoS, MAT_EYE)
    leftEyeM.position.set(-0.058, 0.022, 0.16)
    headGroup.add(leftEyeM)
    const rightEyeM = new THREE.Mesh(eyeGeoS.clone(), MAT_EYE)
    rightEyeM.position.set(0.058, 0.022, 0.16)
    headGroup.add(rightEyeM)
    headGroup.position.y = 0.82
    jarvisGroup.add(headGroup)

    // ── ШЕЯ ──
    const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.076, 0.09, 10), MAT_DARK)
    neckM.position.y = 0.715
    jarvisGroup.add(neckM)

    // ── ТОРС ──
    const torsoGroup = new THREE.Group()
    torsoGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.155, 0.52, 14), MAT_RED))
    ;[-1, 1].forEach(s => {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.115, 0.135), MAT_GOLD)
      sh.position.set(s * 0.365, 0.20, 0)
      torsoGroup.add(sh)
    })
    const arcCore = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), MAT_ARC)
    arcCore.position.set(0, 0.10, 0.192)
    torsoGroup.add(arcCore)
    const arcRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 24), MAT_ARC)
    arcRing.position.set(0, 0.10, 0.191)
    torsoGroup.add(arcRing)
    torsoGroup.position.y = 0.19
    jarvisGroup.add(torsoGroup)

    // ── РУКИ ──
    const makeArm2 = (side) => {
      const g = new THREE.Group()
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.28, 10), MAT_RED)
      upper.position.y = -0.14
      g.add(upper)
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.062, 0.040), MAT_RED)
      hand.position.y = -0.30
      g.add(hand)
      g.position.set(side * 0.285, 0.375, 0)
      g.rotation.z = side * 0.13
      return g
    }
    jarvisGroup.add(makeArm2(-1))
    jarvisGroup.add(makeArm2(1))

    // ── НОГИ ──
    const makeLeg2 = (side) => {
      const g = new THREE.Group()
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.060, 0.25, 10), MAT_RED)
      thigh.position.y = -0.125
      g.add(thigh)
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.046, 0.24, 10), MAT_RED)
      shin.position.y = -0.425
      g.add(shin)
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.036, 0.160), MAT_GOLD)
      foot.position.set(0, -0.585, 0.028)
      g.add(foot)
      g.position.set(side * 0.112, -0.13, 0)
      return g
    }
    jarvisGroup.add(makeLeg2(-1))
    jarvisGroup.add(makeLeg2(1))

    // Arc Reactor свет
    const arcLight = new THREE.PointLight(0x00AAFF, 3.0, 4.0)
    arcLight.position.set(0, 0.285, 0.55)
    jarvisGroup.add(arcLight)

    jarvisGroup.scale.setScalar(1.2)
    scene.add(jarvisGroup)

    // ── АНИМАЦИЯ: 4 ФАЗЫ ──────────────────────────────────────
    const startPos = new THREE.Vector3(1.8, -1.8, 0.5)
    const globePos = new THREE.Vector3(1.2, 0.3, 0.8)
    const flyPos = new THREE.Vector3(1.5, 0.2, 2.8)

    jarvisGroup.position.copy(startPos)
    jarvisGroup.scale.setScalar(0.0)

    const globeNormal = globePos.clone().normalize()

    const eio3 = (t) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2
    const eioQuad = (t) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2

    let animTime = 0
    let phase = 0
    const PH0 = 1.5
    const PH1 = 2.5
    const PH2 = 2.0
    let idleTime = 0

    const boltCount = 48
    const boltGeo = new THREE.BufferGeometry()
    const boltPositions = new Float32Array(boltCount * 3)
    const boltPhases = new Float32Array(boltCount)
    for (let i = 0; i < boltCount; i++) {
      boltPhases[i] = Math.random() * Math.PI * 2
      boltPositions[i*3] = 0; boltPositions[i*3+1] = 0; boltPositions[i*3+2] = 0
    }
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3))
    const boltMat = new THREE.PointsMaterial({
      color: 0x44DDFF, size: 0.035, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const bolts = new THREE.Points(boltGeo, boltMat)
    jarvisGroup.add(bolts)

    const coreCount = 12
    const coreGeo = new THREE.BufferGeometry()
    const corePos = new Float32Array(coreCount * 3)
    const corePhases = new Float32Array(coreCount)
    for (let i = 0; i < coreCount; i++) {
      corePhases[i] = Math.random() * Math.PI * 2
      corePos[i*3] = 0; corePos[i*3+1] = 0; corePos[i*3+2] = 0
    }
    coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3))
    const coreMat = new THREE.PointsMaterial({
      color: 0xAAFFFF, size: 0.065, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const boltCore = new THREE.Points(coreGeo, coreMat)
    jarvisGroup.add(boltCore)

    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const jarvisMeshes = []
    jarvisGroup.traverse(obj => { if (obj.isMesh) jarvisMeshes.push(obj) })

    const onMouseMove = (e) => {
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

    const onMouseClick = (e) => {
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
    const DELTA = 1/60

    function animate() {
      rafId = requestAnimationFrame(animate)
      t2 += 0.01
      animTime += DELTA

      earth.rotation.y += 0.0025
      clouds.rotation.y += 0.0035
      orbitGroup.rotation.y += 0.0012
      const ox = Math.sin(t2 * 0.08) * 3.0
      const oy = Math.cos(t2 * 0.064) * 1.8
      orbitGroup.position.x = ox
      orbitGroup.position.y = oy + Math.sin(t2 * 0.6) * 0.04
      stars.rotation.y += 0.0001
      stars2.rotation.y -= 0.00005

      if (phase === 0) {
        const tp = Math.min(animTime / PH0, 1.0)
        const te = eioQuad(tp)
        jarvisGroup.position.lerpVectors(startPos, globePos, te * 0.3)
        jarvisGroup.scale.setScalar(te * 1.2)
        if (tp >= 1.0) { phase = 1; animTime = 0 }
      }
      else if (phase === 1) {
        const tp = Math.min(animTime / PH1, 1.0)
        const te = eio3(tp)
        jarvisGroup.position.lerpVectors(
          new THREE.Vector3(startPos.x, startPos.y + 0.8, startPos.z + 0.3),
          globePos, te
        )
        const up = new THREE.Vector3(0, 1, 0)
        const q = new THREE.Quaternion().setFromUnitVectors(up, globeNormal.clone().lerp(up, 1 - te))
        jarvisGroup.quaternion.slerp(q, 0.05)
        if (tp >= 1.0) { phase = 2; animTime = 0 }
      }
      else if (phase === 2) {
        const tp = Math.min(animTime / PH2, 1.0)
        const te = eio3(tp)
        const arc = Math.sin(te * Math.PI) * 0.5
        jarvisGroup.position.lerpVectors(globePos, flyPos, te)
        jarvisGroup.position.y += arc
        const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
        jarvisGroup.quaternion.slerp(targetQ, te * 0.1)
        boltMat.opacity = te * 0.8
        coreMat.opacity = te * 1.0
        if (tp >= 1.0) {
          phase = 3; animTime = 0
          if (!bubbleReadyRef.current) {
            bubbleReadyRef.current = true
            setTimeout(() => setBubbleVisible(true), 400)
          }
        }
      }
      else if (phase === 3) {
        idleTime += DELTA
        jarvisGroup.position.y = flyPos.y + Math.sin(idleTime * 1.2) * 0.05
        jarvisGroup.position.x = flyPos.x + Math.sin(idleTime * 0.7) * 0.02
        const tRX = mouseRef.current.y * 0.2
        const tRY = mouseRef.current.x * 0.25
        headGroup.rotation.x += (tRX - headGroup.rotation.x) * 0.06
        headGroup.rotation.y += (tRY - headGroup.rotation.y) * 0.06
        const pulse = 0.7 + 0.3 * Math.sin(idleTime * 3.5)
        arcCore.material.emissiveIntensity = pulse * 12.0
        arcRing.material.emissiveIntensity = pulse * 8.0
        arcLight.intensity = pulse * 3.5

        const leftHandX = -0.285
        const rightHandX = 0.285
        const handWorldY = -0.065
        const handZ = 0.06
        boltMat.opacity = 0.6 + 0.4 * Math.sin(idleTime * 4.0)
        coreMat.opacity = 0.75 + 0.25 * Math.sin(idleTime * 6.0)
        const blt = boltGeo.getAttribute('position')
        const cor = coreGeo.getAttribute('position')
        for (let i = 0; i < boltCount; i++) {
          const side = i < boltCount / 2 ? leftHandX : rightHandX
          const ph = boltPhases[i] + idleTime * (5.0 + (i % 5) * 0.8)
          const r = 0.06 + 0.05 * Math.sin(idleTime * 8 + boltPhases[i])
          const jitter = (Math.random() - 0.5) * 0.04
          blt.setXYZ(i, side + r * Math.cos(ph) + jitter, handWorldY + r * Math.sin(ph * 1.3) * 0.5 + jitter, handZ + r * Math.sin(ph) * 0.4)
        }
        blt.needsUpdate = true
        for (let i = 0; i < coreCount; i++) {
          const side = i < coreCount / 2 ? leftHandX : rightHandX
          const ph = corePhases[i] + idleTime * 9.0
          const r = 0.018 + 0.012 * Math.sin(idleTime * 12 + corePhases[i])
          cor.setXYZ(i, side + r * Math.cos(ph), handWorldY + r * Math.sin(ph) * 0.3, handZ + 0.02)
        }
        cor.needsUpdate = true
      }

      renderer.render(scene, camera)
    }
    animate()

`;

src = src.slice(0, si) + newBlock + src.slice(ei);
fs.writeFileSync(filePath, src, 'utf8');
console.log('Done. File size: ' + src.length);
