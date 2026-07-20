const fs = require('fs');
const path = 'A:\\HADJAL\\Рабочий стол\\asgard-redesign\\app\\walli-room\\page.tsx';

const content = `'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { useWalliVoice, LANGUAGES } from './useWalliVoice'
import type { ResponseMode } from './useWalliVoice'

interface Stats {
  trash: number
  artifacts: number
  rare: number
  earned: number
  level: number
  skill: number
}

export default function WalliRoom() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState<Stats>({
    trash: 127,
    artifacts: 12,
    rare: 3,
    earned: 247.5,
    level: 5,
    skill: 78,
  })
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [textInput, setTextInput] = useState('')
  const voice = useWalliVoice()

  const showMsg = useCallback((text: string, ms = 2000) => {
    setMessage(text)
    setTimeout(() => setMessage(''), ms)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)

    const resize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 5, 10)
    camera.lookAt(0, 0, 0)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1a0e08')
    scene.fog = new THREE.Fog('#1a0e08', 15, 30)

    scene.add(new THREE.AmbientLight('#442211', 0.5))
    const sun = new THREE.DirectionalLight('#ff8844', 1.5)
    sun.position.set(5, 8, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    scene.add(sun)
    scene.add(new THREE.PointLight('#3a5a8a', 0.8, 20))

    const floorMat = new THREE.MeshStandardMaterial({ color: '#5C3A21', roughness: 0.95, metalness: 0.3 })
    const wallMat  = new THREE.MeshStandardMaterial({ color: '#3A3A3A', roughness: 0.9,  metalness: 0.1 })

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    ;[
      { pos: [0, 5, -10] as [number,number,number], ry: 0 },
      { pos: [-10, 5, 0] as [number,number,number], ry: Math.PI / 2 },
      { pos: [10, 5, 0] as [number,number,number],  ry: -Math.PI / 2 },
    ].forEach(({ pos, ry }) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMat)
      w.position.set(...pos)
      w.rotation.y = ry
      scene.add(w)
    })

    const trashGroup = new THREE.Group()
    scene.add(trashGroup)
    const trashColors = ['#5a4a3a', '#6b5a4a', '#4a3a2a', '#7a6a5a', '#3a2a1a']
    const rng = (a: number, b: number) => Math.random() * (b - a) + a
    for (let i = 0; i < 30; i++) {
      const s = rng(0.12, 0.42)
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s, s * rng(0.5, 1.5), s * rng(0.6, 1.2)),
        new THREE.MeshStandardMaterial({ color: trashColors[i % 5], roughness: 0.9 }),
      )
      mesh.position.set(rng(-8, 8), s * 0.3, rng(-8, 8))
      mesh.rotation.set(rng(0, Math.PI), rng(0, Math.PI), 0)
      mesh.castShadow = true
      mesh.userData.type = 'trash'
      trashGroup.add(mesh)
    }

    const walliGroup = new THREE.Group()
    scene.add(walliGroup)
    const gold = new THREE.MeshStandardMaterial({ color: '#D4A017', roughness: 0.4, metalness: 0.5 })
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.8, metalness: 0.3 })
    const eyeMatL = new THREE.MeshStandardMaterial({ color: '#1a6aff', emissive: '#0033cc', emissiveIntensity: 0.8 })
    const eyeMatR = eyeMatL.clone()

    const trackGeo = new THREE.BoxGeometry(0.22, 0.36, 0.85)
    const lTrack = new THREE.Mesh(trackGeo, dark); lTrack.position.set(-0.45, 0.18, 0); walliGroup.add(lTrack)
    const rTrack = new THREE.Mesh(trackGeo, dark); rTrack.position.set(0.45, 0.18, 0); walliGroup.add(rTrack)

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.65), gold)
    body.position.y = 0.72; body.castShadow = true; body.userData.type = 'walli'; walliGroup.add(body)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), gold)
    neck.position.y = 1.14; neck.userData.type = 'walli'; walliGroup.add(neck)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.48, 0.48), gold)
    head.position.y = 1.44; head.castShadow = true; head.userData.type = 'walli'; walliGroup.add(head)

    const eyeBodyGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12)
    const eyeLensGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12)
    const lEyeBody = new THREE.Mesh(eyeBodyGeo, dark); lEyeBody.rotation.x = Math.PI/2; lEyeBody.position.set(-0.17,1.46,0.26); lEyeBody.userData.type='walli'; walliGroup.add(lEyeBody)
    const lEyeLens = new THREE.Mesh(eyeLensGeo, eyeMatL); lEyeLens.rotation.x = Math.PI/2; lEyeLens.position.set(-0.17,1.46,0.35); lEyeLens.userData.type='walli'; walliGroup.add(lEyeLens)
    const rEyeBody = new THREE.Mesh(eyeBodyGeo, dark); rEyeBody.rotation.x = Math.PI/2; rEyeBody.position.set(0.17,1.46,0.26); rEyeBody.userData.type='walli'; walliGroup.add(rEyeBody)
    const rEyeLens = new THREE.Mesh(eyeLensGeo, eyeMatR); rEyeLens.rotation.x = Math.PI/2; rEyeLens.position.set(0.17,1.46,0.35); rEyeLens.userData.type='walli'; walliGroup.add(rEyeLens)

    const antennaMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.7,8), dark)
    antennaMesh.position.set(0,2.03,0); walliGroup.add(antennaMesh)
    const blinkMat = new THREE.MeshStandardMaterial({ color: '#ff2200', emissive: '#ff2200', emissiveIntensity: 1 })
    const blinkMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07,8,8), blinkMat)
    blinkMesh.position.set(0,2.4,0); walliGroup.add(blinkMesh)
    const blinkLight = new THREE.PointLight('#ff2200', 2, 3)
    blinkLight.position.set(0,2.4,0); walliGroup.add(blinkLight)

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.6,8), gold)
    arm.rotation.z = -Math.PI/4; arm.position.set(0.55,0.72,0.1); arm.userData.type='walli'; walliGroup.add(arm)
    const clawUp = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.08,0.08), dark)
    clawUp.position.set(0.8,0.47,0.1); clawUp.rotation.z = Math.PI/6; walliGroup.add(clawUp)
    const clawDn = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.08,0.08), dark)
    clawDn.position.set(0.8,0.37,0.1); clawDn.rotation.z = -Math.PI/6; walliGroup.add(clawDn)
    walliGroup.position.set(-5, 0, -5)

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const waypoints: [number,number,number][] = [[-7,0,-7],[7,0,-7],[7,0,7],[-7,0,7]]
    let wpCurrent=0, wpNext=1, wpProgress=0, isCollecting=false
    let collectObj: THREE.Object3D | null = null
    let pressTimer: ReturnType<typeof setTimeout> | null = null

    const onPointerDown = () => { pressTimer = setTimeout(() => { setMenuOpen(true); pressTimer=null }, 800) }
    const onPointerUp   = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer=null } }

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const wHits = raycaster.intersectObjects(walliGroup.children, true)
      if (wHits.length > 0 && wHits[0].object.userData.type === 'walli') {
        showMsg('🤖 Привет, архитектор! Я — ВАЛЛИ.')
        return
      }
      const tHits = raycaster.intersectObjects(trashGroup.children, true)
      if (tHits.length > 0 && tHits[0].object.visible) {
        isCollecting = true; collectObj = tHits[0].object
        showMsg('🧹 ВАЛЛИ собирает мусор...')
      }
    }

    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', resize)
    resize()

    let raf: number
    const clock = new THREE.Clock()
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const t = clock.getElapsedTime()
      blinkLight.intensity = Math.sin(t*4) > 0 ? 2 : 0
      blinkMat.emissiveIntensity = Math.sin(t*4) > 0 ? 1 : 0
      if (isCollecting && collectObj) {
        const tgt = collectObj.position, cur = walliGroup.position
        const dx = tgt.x-cur.x, dz = tgt.z-cur.z
        const dist = Math.sqrt(dx*dx+dz*dz)
        if (dist > 0.25) {
          const spd = 4*delta
          cur.x += (dx/dist)*spd; cur.z += (dz/dist)*spd
          walliGroup.rotation.y = Math.atan2(dx, dz)
        } else {
          collectObj.visible = false; isCollecting = false; collectObj = null
          setStats(prev => ({ ...prev, trash: prev.trash+1, earned: Math.round((prev.earned+0.5)*100)/100 }))
          showMsg('✅ Мусор собран! +0.5 TC')
        }
      } else {
        wpProgress += delta * 0.35
        if (wpProgress >= 1) { wpProgress=0; wpCurrent=wpNext; wpNext=(wpNext+1)%waypoints.length }
        const from=waypoints[wpCurrent], to=waypoints[wpNext]
        walliGroup.position.x = from[0]+(to[0]-from[0])*wpProgress
        walliGroup.position.z = from[2]+(to[2]-from[2])*wpProgress
        const dx=to[0]-from[0], dz=to[2]-from[2]
        if (Math.abs(dx)+Math.abs(dz) > 0.01) walliGroup.rotation.y = Math.atan2(dx, dz)
      }
      walliGroup.position.y = Math.abs(Math.sin(t*6))*0.04
      const pulse = Math.sin(t*2)*0.3+0.7
      eyeMatL.emissiveIntensity = pulse; eyeMatR.emissiveIntensity = pulse
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [showMsg])

  const sendText = () => {
    if (!textInput.trim()) return
    const reply = voice.handleUserInput(textInput.trim())
    showMsg('🤖 ' + reply, 3000)
    setTextInput('')
  }

  return (
    <div className="min-h-screen bg-[#1a0e08] relative overflow-hidden">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
        <h1 className="text-[#D4A017] font-mono text-2xl tracking-widest" style={{ textShadow: '0 0 20px #D4A01788' }}>
          ВАЛЛИ — КОМНАТА
        </h1>
        <p className="text-gray-500 font-mono text-xs mt-1">
          Клик на ВАЛЛИ · Клик на мусор · Долгое нажатие — меню
        </p>
      </div>

      <div ref={containerRef} className="w-full h-[calc(100vh-120px)]" style={{ cursor: 'crosshair' }} />

      {message && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-[#0A0A0F]/90 backdrop-blur border border-[#D4A017]/50 rounded-xl px-6 py-3 text-[#D4A017] text-lg font-semibold">
          {message}
        </div>
      )}

      {/* Голосовой диалог */}
      {voice.voiceOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center pb-32 bg-black/50 backdrop-blur-sm">
          <div className="bg-[#0A0A0F]/98 border border-[#D4A017]/50 rounded-2xl p-5 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#D4A017] font-bold text-lg">🤖 Диалог с ВАЛЛИ</h3>
              <button onClick={() => { voice.setVoiceOpen(false); voice.stopListening(); voice.stopSpeaking() }}
                className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="min-h-[56px] space-y-2 mb-3">
              {voice.transcript && (
                <div className="bg-white/5 rounded-lg px-3 py-2 text-sm text-gray-300">
                  <span className="text-gray-500 text-xs">Вы: </span>{voice.transcript}
                </div>
              )}
              {voice.walliReply && (
                <div className="bg-[#D4A017]/10 border border-[#D4A017]/20 rounded-lg px-3 py-2 text-sm text-[#D4A017]">
                  <span className="text-[#D4A017]/60 text-xs">ВАЛЛИ: </span>{voice.walliReply}
                </div>
              )}
              {!voice.transcript && !voice.walliReply && (
                <p className="text-gray-600 text-xs text-center pt-3">Нажми 🎤 или введи текст</p>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              <input type="text" value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendText()}
                placeholder="Напиши ВАЛЛИ..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-[#D4A017]/50" />
              <button onClick={sendText}
                className="bg-[#D4A017]/20 hover:bg-[#D4A017]/35 border border-[#D4A017]/30 rounded-lg px-3 py-2 text-[#D4A017] text-sm transition-colors">➤</button>
            </div>

            <div className="flex justify-center gap-3 mb-4">
              <button
                onClick={voice.isListening ? voice.stopListening : voice.startListening}
                disabled={!voice.sttSupported}
                className={\`w-14 h-14 rounded-full border-2 flex items-center justify-center text-2xl transition-all
                  \${voice.isListening ? 'bg-red-500/30 border-red-400 animate-pulse' : 'bg-[#D4A017]/10 border-[#D4A017]/40 hover:bg-[#D4A017]/20'}
                  \${!voice.sttSupported ? 'opacity-30 cursor-not-allowed' : ''}\`}
              >{voice.isListening ? '⏹' : '🎤'}</button>
              {voice.isSpeaking && (
                <button onClick={voice.stopSpeaking}
                  className="w-14 h-14 rounded-full border-2 bg-blue-500/20 border-blue-400 flex items-center justify-center text-2xl animate-pulse">
                  🔊
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">🌐 Язык</p>
                <select value={voice.lang} onChange={e => voice.setLang(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-[#D4A017]/40">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-[#0A0A0F]">{l.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">💬 Режим</p>
                <div className="flex gap-1">
                  {(['text','voice','both'] as ResponseMode[]).map(mode => (
                    <button key={mode} onClick={() => voice.setResponseMode(mode)}
                      className={\`flex-1 py-1.5 rounded-lg text-[10px] border transition-colors
                        \${voice.responseMode===mode ? 'bg-[#D4A017]/25 border-[#D4A017]/60 text-[#D4A017]' : 'bg-white/5 border-white/10 text-gray-400'}\`}>
                      {mode==='text'?'💬':mode==='voice'?'🔊':'💬🔊'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {!voice.sttSupported && (
              <p className="text-[10px] text-red-400 text-center mt-2">⚠️ STT не поддерживается в этом браузере</p>
            )}
          </div>
        </div>
      )}

      {/* Меню управления */}
      {menuOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0A0A0F]/95 border border-[#D4A017]/50 rounded-2xl p-6 w-80">
            <h3 className="text-[#D4A017] text-xl font-bold mb-4 text-center">⚙️ Управление ВАЛЛИ</h3>
            <div className="space-y-2">
              <button className="w-full bg-[#D4A017]/20 hover:bg-[#D4A017]/30 text-white py-2.5 rounded-lg transition-colors"
                onClick={() => { setMenuOpen(false); voice.setVoiceOpen(true) }}>🎤 Поговорить</button>
              <button className="w-full bg-[#D4A017]/20 hover:bg-[#D4A017]/30 text-white py-2.5 rounded-lg transition-colors"
                onClick={() => { setMenuOpen(false); showMsg('📦 Артефактов: ' + stats.artifacts) }}>📦 Артефакты</button>
              <button className="w-full bg-[#D4A017]/20 hover:bg-[#D4A017]/30 text-white py-2.5 rounded-lg transition-colors"
                onClick={() => { setMenuOpen(false); showMsg('🔧 Обучение запущено!') }}>🔧 Обучение</button>
              <button className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-300 py-2.5 rounded-lg transition-colors mt-2"
                onClick={() => setMenuOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* Нижняя панель */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A0A0F]/95 backdrop-blur border-t border-[#D4A017]/30 z-10">
        <div className="border-b border-[#D4A017]/10 py-2 px-4">
          <div className="max-w-5xl mx-auto grid grid-cols-3 md:grid-cols-6 gap-1 text-center">
            {[
              { label: '🧹 Мусора',     value: String(stats.trash) },
              { label: '📦 Артефактов', value: String(stats.artifacts) },
              { label: '⭐ Редких',     value: String(stats.rare) },
              { label: '💰 Заработано', value: '∞ ' + stats.earned.toFixed(2) },
              { label: '📈 Уровень',    value: String(stats.level) },
              { label: '🔧 Навык',      value: stats.skill + '%' },
            ].map(item => (
              <div key={item.label} className="py-1">
                <p className="text-[10px] text-gray-500 leading-tight">{item.label}</p>
                <p className="text-sm font-bold text-[#D4A017] leading-tight">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="py-2 px-4">
          <div className="max-w-5xl mx-auto grid grid-cols-4 gap-2">
            {[
              { icon: voice.isListening ? '🔴' : '🎤', label: voice.isListening ? 'Слушаю...' : 'Поговорить', action: () => voice.setVoiceOpen(true) },
              { icon: '📦', label: 'Артефакты',  action: () => showMsg('📦 Артефактов найдено: ' + stats.artifacts) },
              { icon: '🔧', label: 'Обучение',   action: () => showMsg('🔧 Обучение запущено! Навык растёт...') },
              { icon: '🎮', label: 'Игры',       action: () => showMsg('🎮 Мини-игры скоро откроются!') },
            ].map(btn => (
              <button key={btn.label} onClick={btn.action}
                className="flex flex-col items-center gap-0.5 bg-[#D4A017]/10 hover:bg-[#D4A017]/25 active:bg-[#D4A017]/35 border border-[#D4A017]/20 hover:border-[#D4A017]/50 rounded-xl py-2 px-1 transition-all duration-150 group">
                <span className="text-lg leading-none group-hover:scale-110 transition-transform">{btn.icon}</span>
                <span className="text-[10px] text-gray-400 group-hover:text-[#D4A017] transition-colors font-medium">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
`;

fs.writeFileSync(path, content, 'utf8');
console.log('OK — page.tsx written');
