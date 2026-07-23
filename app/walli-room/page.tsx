'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { useWalliVoice, LANGUAGES } from './useWalliVoice'
import { useWalliAudio } from './useWalliAudio'
import { useWalliEconomy } from './useWalliEconomy'
import type { ResponseMode } from './useWalliVoice'
import { useTranslation } from '@/lib/i18n/use-translation'

export default function WalliRoom() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [trainOpen, setTrainOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [textInput, setTextInput] = useState('')
  const voice = useWalliVoice()
  const audio = useWalliAudio()
  const econ  = useWalliEconomy()

  // econ — новый объект на каждый рендер (не мемоизирован в useWalliEconomy),
  // а эффекты ниже должны выполняться/создаваться ровно один раз на монтирование.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { econ.loadEconomy() }, [])
  useEffect(() => {
    const id = setInterval(() => econ.flushToServer(), 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showMsg = useCallback((t: string, ms = 2000) => {
    setMessage(t); setTimeout(() => setMessage(''), ms)
  }, [])

  const st  = econ.economy?.stats
  const abilities = econ.economy?.abilities ?? []
  const xp  = econ.economy?.xp_progress

  const doUpgrade = async (ab: 'find_artifacts' | 'trade' | 'analyze') => {
    setBusy(true)
    try {
      const r = await econ.upgradeAbility(ab)
      showMsg('OK Улучшено до уровня ' + r.level + '! Бонус +' + Math.round(r.bonus * 100) + '%', 3000)
      setUpgradeOpen(false)
    } catch (e: any) { showMsg('Ерр ' + (e.message || 'Ошибка'), 3000) }
    setBusy(false)
  }

  const doTrain = async (lv: 1 | 2 | 3 | 4 | 5) => {
    setBusy(true)
    try {
      const r = await econ.startTraining(lv)
      showMsg(r.message, 4000)
      setTrainOpen(false); econ.loadEconomy()
    } catch (e: any) { showMsg('Ерр ' + (e.message || 'Ошибка'), 3000) }
    setBusy(false)
  }

  const sendText = async () => {
    if (!textInput.trim()) return
    const question = textInput.trim()
    setTextInput('')
    const reply = await voice.handleUserInput(question)
    showMsg('ВАЛЛИ: ' + reply, 3000)
  }

  // Three.js сцена
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 4))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    containerRef.current.appendChild(renderer.domElement)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
    camera.position.set(0, 4, 12)
    camera.lookAt(0, 1, 0)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0c)
    scene.fog = new THREE.FogExp2(0x0a0a0c, 0.035)
    // Освещение — кино
    scene.add(new THREE.AmbientLight(0x111118, 0.6))
    const keyLight = new THREE.DirectionalLight(0xfff5e0, 3.5)
    keyLight.position.set(6, 10, 4)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(4096, 4096)
    keyLight.shadow.camera.near = 0.5
    keyLight.shadow.camera.far = 40
    keyLight.shadow.camera.left = -10
    keyLight.shadow.camera.right = 10
    keyLight.shadow.camera.top = 10
    keyLight.shadow.camera.bottom = -10
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x3a4a6a, 0.8)
    fillLight.position.set(-8, 3, -3)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight(0xd4a020, 0.4)
    rimLight.position.set(0, 2, -8)
    scene.add(rimLight)
    // Пол — ржавая пустынь
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 0.98, metalness: 0.0 })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    // Царапины мусора
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.95 })
    const rng = (a: number, b: number) => Math.random() * (b - a) + a
    for (let i = 0; i < 40; i++) {
      const s = rng(0.08, 0.35)
      const d = new THREE.Mesh(new THREE.BoxGeometry(s, s * rng(0.4, 2), s * rng(0.5, 1.4)), debrisMat)
      d.position.set(rng(-9, 9), s * 0.3, rng(-8, 8))
      d.rotation.y = rng(0, Math.PI * 2)
      d.castShadow = true
      scene.add(d)
    }
    // ВАЛЛИ
    const wg = new THREE.Group()
    const goldMat  = new THREE.MeshPhysicalMaterial({ color: 0xc8830e, roughness: 0.28, metalness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: 0x2a1a00, emissiveIntensity: 0.15 })
    const darkMat  = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.7,  metalness: 0.5, clearcoat: 0.3 })
    const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x1a5aff, emissive: 0x0022aa, emissiveIntensity: 0.6 })
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9,  metalness: 0.5 })
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7,  metalness: 0.6 })
    // Гусеницы
    const trackW = 0.24, trackH = 0.38, trackL = 1.0
    const lTrack = new THREE.Mesh(new THREE.BoxGeometry(trackW, trackH, trackL), trackMat)
    lTrack.position.set(-0.48, 0.19, 0); lTrack.castShadow = true; wg.add(lTrack)
    const rTrack = new THREE.Mesh(new THREE.BoxGeometry(trackW, trackH, trackL), trackMat)
    rTrack.position.set(0.48, 0.19, 0); rTrack.castShadow = true; wg.add(rTrack)
    // Ролики гусениц (8 шт на каждую)
    const wheelGeo = new THREE.CylinderGeometry(0.13, 0.13, trackW + 0.04, 10)
    const lWheels: THREE.Mesh[] = []
    const rWheels: THREE.Mesh[] = []
    for (let i = 0; i < 8; i++) {
      const z = -0.42 + i * 0.12
      const lw = new THREE.Mesh(wheelGeo, wheelMat)
      lw.rotation.z = Math.PI / 2; lw.position.set(-0.48, 0.13, z); lw.castShadow = true; wg.add(lw); lWheels.push(lw)
      const rw = new THREE.Mesh(wheelGeo, wheelMat)
      rw.rotation.z = Math.PI / 2; rw.position.set(0.48, 0.13, z); rw.castShadow = true; wg.add(rw); rWheels.push(rw)
    }
    // Корпус
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.76, 0.7), goldMat)
    body.position.y = 0.76; body.castShadow = true; body.userData.type = "walli"; wg.add(body)
    // Голова
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 0.52), goldMat)
    head.position.y = 1.48; head.castShadow = true; head.userData.type = "walli"; wg.add(head)
    // Глаза
    const eyeBarrelGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.17, 12)
    const eyeLensGeo   = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12)
    const lEB = new THREE.Mesh(eyeBarrelGeo, darkMat); lEB.rotation.x = Math.PI/2; lEB.position.set(-0.18,1.5,0.28); wg.add(lEB)
    const lEL = new THREE.Mesh(eyeLensGeo,   eyeMat);  lEL.rotation.x = Math.PI/2; lEL.position.set(-0.18,1.5,0.37); wg.add(lEL)
    const rEB = new THREE.Mesh(eyeBarrelGeo, darkMat); rEB.rotation.x = Math.PI/2; rEB.position.set( 0.18,1.5,0.28); wg.add(rEB)
    const rEL = new THREE.Mesh(eyeLensGeo,   eyeMat.clone()); rEL.rotation.x = Math.PI/2; rEL.position.set(0.18,1.5,0.37); wg.add(rEL)
    // Антенна
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8), darkMat); ant.position.set(0, 2.05, 0); wg.add(ant)
    // Рука
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.55, 8), goldMat); arm.rotation.z = -Math.PI/4; arm.position.set(0.58,0.76,0.12); wg.add(arm)
    const cl1 = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.07,0.07), darkMat); cl1.position.set(0.82,0.48,0.12); cl1.rotation.z = Math.PI/6; wg.add(cl1)
    const cl2 = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.07,0.07), darkMat); cl2.position.set(0.82,0.38,0.12); cl2.rotation.z = -Math.PI/6; wg.add(cl2)
    // Панель на корпусе
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x081208, roughness: 0.7 })
    const ledMat   = new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 1.2 })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.04), panelMat); panel.position.set(0.2, 0.76, 0.37); wg.add(panel)
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.02), ledMat); led.position.set(0.2, 0.68 + i * 0.09, 0.4); wg.add(led)
    }
    wg.position.set(-5, 0, -4)
    wg.castShadow = true
    scene.add(wg)
    // Наведение ходовых точек
    const waypoints: [number,number,number][] = [[-7,0,-6],[7,0,-6],[7,0,5],[-7,0,5]]
    let wpCur = 0, wpNext = 1, wpProg = 0
    let isCollecting = false, collectObj: THREE.Object3D | null = null
    // Клики
    const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2()
    let pressTimer: ReturnType<typeof setTimeout> | null = null
    const onPointerDown = () => { pressTimer = setTimeout(() => { setMenuOpen(true); pressTimer = null }, 800) }
    const onPointerUp   = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null } }
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const wHits = raycaster.intersectObjects(wg.children, true)
      if (wHits.length > 0 && wHits[0].object.userData.type === "walli") {
        audio.playGreet(); showMsg("Привет, архитектор! Я — ВАЛЛИ."); return
      }
    }
    const resize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
    }
    renderer.domElement.addEventListener("click", onClick)
    renderer.domElement.addEventListener("pointerdown", onPointerDown)
    renderer.domElement.addEventListener("pointerup", onPointerUp)
    window.addEventListener("resize", resize); resize()
    let raf: number; const clock = new THREE.Clock()
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const delta = clock.getDelta(); const t = clock.getElapsedTime()
      // Движение по маршруту
      wpProg += delta * 0.3
      if (wpProg >= 1) { wpProg = 0; wpCur = wpNext; wpNext = (wpNext + 1) % waypoints.length }
      const from = waypoints[wpCur], to = waypoints[wpNext]
      wg.position.x = from[0] + (to[0] - from[0]) * wpProg
      wg.position.z = from[2] + (to[2] - from[2]) * wpProg
      const dx = to[0] - from[0], dz = to[2] - from[2]
      if (Math.abs(dx) + Math.abs(dz) > 0.01) wg.rotation.y = Math.atan2(dx, dz)
      // Ролики вращаются
      const speed = wpProg > 0 ? delta * 8 : 0
      lWheels.forEach(w => { w.rotation.x += speed })
      rWheels.forEach(w => { w.rotation.x += speed })
      // Покачивание на неровностях
      wg.position.y = Math.abs(Math.sin(t * 5)) * 0.03
      // Незначительное моргание головы
      head.rotation.y = Math.sin(t * 0.4) * 0.15
      // Глаза медленно пульсируют
      const eyePulse = Math.sin(t * 1.8) * 0.25 + 0.65
      eyeMat.emissiveIntensity = eyePulse
      renderer.render(scene, camera)
    }
    animate()
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize)
      renderer.domElement.removeEventListener("click", onClick)
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointerup", onPointerUp)
      audio.dispose(); renderer.dispose()
      if (container?.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
    // audio — новый объект на каждый рендер (не мемоизирован в useWalliAudio); вся
    // тяжёлая инициализация Three.js-сцены должна выполняться один раз на монтирование.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMsg])

  return (
    <div className="min-h-screen bg-[#0a0a0c] relative overflow-hidden">
      <div ref={containerRef} className="w-full h-[calc(100vh-110px)]" style={{ cursor: "crosshair" }} />

      {message && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-[#0c0c10]/95 backdrop-blur border border-[#c8830e]/30 rounded-xl px-6 py-3 text-[#e8a820] text-base font-medium tracking-wide">
          {message}
        </div>
      )}

      {menuOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0c0c10]/98 border border-[#c8830e]/25 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-[#e8a820] text-lg font-semibold mb-4 text-center tracking-widest uppercase">{t('walli.roomLabel')}</h3>
            <div className="space-y-2">
              <button className="w-full bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-lg transition-colors text-sm" onClick={() => { setMenuOpen(false); voice.setVoiceOpen(true) }}>Поговорить</button>
              <button className="w-full bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-lg transition-colors text-sm" onClick={() => { setMenuOpen(false); setUpgradeOpen(true) }}>Улучшить способности</button>
              <button className="w-full bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-lg transition-colors text-sm" onClick={() => { setMenuOpen(false); setTrainOpen(true) }}>Обучение</button>
              <button className="w-full bg-white/5 hover:bg-white/10 text-[#888] py-2.5 rounded-lg transition-colors text-sm mt-2" onClick={() => setMenuOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {upgradeOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0c0c10]/98 border border-[#c8830e]/25 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-[#e8a820] text-lg font-semibold mb-4 text-center">Улучшение</h3>
            <div className="space-y-2">
              {(([['find_artifacts','Поиск артефактов'],['trade','Торговля'],['analyze','Анализ']] as const)).map(([ab, label]) => {
                const a = abilities.find((x: any) => x.ability_type === ab)
                return (
                  <button key={ab} disabled={busy} className="w-full bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg transition-colors disabled:opacity-50 text-sm" onClick={() => doUpgrade(ab)}>
                    {label} (Ур. {a?.current_level ?? 0}) — ${a?.upgrade_price_usd ?? 19}
                  </button>
                )
              })}
              <button className="w-full bg-white/5 hover:bg-white/10 text-[#888] py-2 rounded-lg mt-2 text-sm" onClick={() => setUpgradeOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {trainOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0c0c10]/98 border border-[#c8830e]/25 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-[#e8a820] text-lg font-semibold mb-4 text-center">Обучение</h3>
            <div className="space-y-2">
              {([1,2,3,4,5] as const).map(lv => (
                <button key={lv} disabled={busy} className="w-full bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg transition-colors disabled:opacity-50 text-sm" onClick={() => doTrain(lv)}>
                  Уровень {lv} — ${econ.economy?.pricing?.training_levels?.[lv] ?? (15 + 5 * (lv - 1))}
                </button>
              ))}
              <button className="w-full bg-white/5 hover:bg-white/10 text-[#888] py-2 rounded-lg mt-2 text-sm" onClick={() => setTrainOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {voice.voiceOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center pb-28 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0c0c10]/98 border border-[#c8830e]/25 rounded-2xl p-5 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#e8a820] font-semibold">Диалог с ВАЛЛИ</h3>
              <button onClick={() => { voice.setVoiceOpen(false); voice.stopListening(); voice.stopSpeaking() }} className="text-[#555] hover:text-white text-lg transition-colors">×</button>
            </div>
            <div className="min-h-[52px] space-y-2 mb-3">
              {voice.transcript && (<div className="bg-white/5 rounded-lg px-3 py-2 text-sm text-[#aaa]"><span className="text-[#555] text-xs">Вы: </span>{voice.transcript}</div>)}
              {voice.walliReply && (<div className="bg-[#c8830e]/10 border border-[#c8830e]/20 rounded-lg px-3 py-2 text-sm text-[#e8a820]"><span className="text-[#c8830e]/60 text-xs">ВАЛЛИ: </span>{voice.walliReply}</div>)}
            </div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendText()} placeholder="Напиши ВАЛЛИ..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] outline-none focus:border-[#c8830e]/40" />
              <button onClick={sendText} className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-[#e8a820] text-sm transition-colors">→</button>
            </div>
            <div className="flex justify-center">
              <button onClick={voice.isListening ? voice.stopListening : voice.startListening} disabled={!voice.sttSupported}
                className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl transition-all ${voice.isListening ? "bg-[#c8830e]/20 border-[#c8830e]/60" : "bg-white/5 border-white/15 hover:bg-white/10"} ${!voice.sttSupported ? "opacity-30 cursor-not-allowed" : ""}`}>
                {voice.isListening ? "■" : "●"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-[#0c0c10]/98 backdrop-blur border-t border-white/8 z-10">
        {xp && (
          <div className="px-4 pt-1.5"><div className="max-w-5xl mx-auto flex items-center gap-2">
            <span className="text-[10px] text-[#444]">XP</span>
            <div className="flex-1 bg-white/8 rounded-full h-1"><div className="bg-[#c8830e] h-1 rounded-full transition-all" style={{ width: `${(xp.xp_in_level / 100) * 100}%` }} /></div>
            <span className="text-[10px] text-[#444]">{xp.xp_to_next} до ур.{xp.level + 1}</span>
          </div></div>
        )}
        <div className="py-2 px-4"><div className="max-w-5xl mx-auto grid grid-cols-3 md:grid-cols-6 gap-1 text-center">
          <div className="py-1"><p className="text-[10px] text-[#444]">Мусора</p><p className="text-sm font-medium text-[#c8830e]">{st?.trash_collected ?? 0}</p></div>
          <div className="py-1"><p className="text-[10px] text-[#444]">Артефактов</p><p className="text-sm font-medium text-[#c8830e]">{st?.artifacts_found ?? 0}</p></div>
          <div className="py-1"><p className="text-[10px] text-[#444]">Редких</p><p className="text-sm font-medium text-[#c8830e]">{st?.rare_found ?? 0}</p></div>
          <div className="py-1"><p className="text-[10px] text-[#444]">Заработано</p><p className="text-sm font-medium text-[#c8830e]">∞ {Number(st?.earned ?? 0).toFixed(2)}</p></div>
          <div className="py-1"><p className="text-[10px] text-[#444]">Уровень</p><p className="text-sm font-medium text-[#c8830e]">{st?.level ?? 1}</p></div>
          <div className="py-1"><p className="text-[10px] text-[#444]">Навык</p><p className="text-sm font-medium text-[#c8830e]">{st?.skill ?? 0}%</p></div>
        </div></div>
      </div>
    </div>
  )
}
