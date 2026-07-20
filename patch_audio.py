import re

path = r'A:\HADJAL\Рабочий стол\asgard-redesign\app\walli-room\page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Добавить импорт аудио хука
src = src.replace(
    "import { useWalliVoice, LANGUAGES } from './useWalliVoice'",
    "import { useWalliVoice, LANGUAGES } from './useWalliVoice'\nimport { useWalliAudio } from './useWalliAudio'"
)

# 2. Инициализировать хук
src = src.replace(
    "const voice = useWalliVoice()",
    "const voice = useWalliVoice()\n  const audio = useWalliAudio()"
)

# 3. Звук приветствия при клике на ВАЛЛИ
src = src.replace(
    "showMsg('🤖 Привет, архитектор! Я — ВАЛЛИ.')\n        return",
    "audio.playGreet(); showMsg('🤖 Привет, архитектор! Я — ВАЛЛИ.')\n        return"
)

# 4. Звук шагов при начале сбора
src = src.replace(
    "showMsg('🧹 ВАЛЛИ собирает мусор...')",
    "audio.playStep(); showMsg('🧹 ВАЛЛИ собирает мусор...')"
)

# 5. Звук сбора при завершении
src = src.replace(
    "showMsg('✅ Мусор собран! +0.5 TC')",
    "audio.playCollect(); showMsg('✅ Мусор собран! +0.5 TC')"
)

# 6. Добавить систему частиц Three.js
# Вставляем код частиц сразу после инициализации walliGroup.position
particles_init = '''
    walliGroup.position.set(-5, 0, -5)

    // ── Система частиц ────────────────────────────────────────────────────────
    const MAX_PARTICLES = 120
    const particleGeo = new THREE.BufferGeometry()
    const pPositions = new Float32Array(MAX_PARTICLES * 3)
    const pVelocities: { x: number; y: number; z: number; life: number; maxLife: number }[] = []
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pPositions[i * 3] = 0; pPositions[i * 3 + 1] = -100; pPositions[i * 3 + 2] = 0
      pVelocities.push({ x: 0, y: 0, z: 0, life: 0, maxLife: 1 })
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    const particleMat = new THREE.PointsMaterial({ color: '#D4A017', size: 0.1, transparent: true, opacity: 0.9 })
    const particleSystem = new THREE.Points(particleGeo, particleMat)
    scene.add(particleSystem)
    let nextParticle = 0

    function spawnParticles(x: number, y: number, z: number) {
      for (let i = 0; i < 20; i++) {
        const idx = nextParticle % MAX_PARTICLES
        pPositions[idx * 3]     = x
        pPositions[idx * 3 + 1] = y
        pPositions[idx * 3 + 2] = z
        pVelocities[idx] = {
          x: (Math.random() - 0.5) * 3,
          y: Math.random() * 3 + 1,
          z: (Math.random() - 0.5) * 3,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.4,
        }
        nextParticle++
      }
      particleGeo.attributes.position.needsUpdate = true
    }
'''

src = src.replace(
    "    walliGroup.position.set(-5, 0, -5)\n\n    // ── Raycaster",
    particles_init + "\n    // ── Raycaster"
)

# 7. Добавить обновление частиц в animate
particle_update = '''
      // Обновление частиц
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const v = pVelocities[i]
        if (v.life > 0 || pPositions[i * 3 + 1] > -50) {
          v.life += delta
          pPositions[i * 3]     += v.x * delta
          pPositions[i * 3 + 1] += v.y * delta
          pPositions[i * 3 + 2] += v.z * delta
          v.y -= 5 * delta // гравитация
          particleMat.opacity = Math.max(0, 1 - v.life / v.maxLife) * 0.9
          if (v.life >= v.maxLife) {
            pPositions[i * 3 + 1] = -100 // спрятать
            v.life = 0
          }
        }
      }
      particleGeo.attributes.position.needsUpdate = true

'''

src = src.replace(
    "      renderer.render(scene, camera)\n    }",
    particle_update + "      renderer.render(scene, camera)\n    }"
)

# 8. Спавнить частицы при сборе мусора
src = src.replace(
    "          collectObj.visible = false; isCollecting = false; collectObj = null",
    "          spawnParticles(walliGroup.position.x, walliGroup.position.y + 0.5, walliGroup.position.z)\n          collectObj.visible = false; isCollecting = false; collectObj = null"
)

# 9. Dispose аудио
src = src.replace(
    "      renderer.dispose()",
    "      audio.dispose()\n      renderer.dispose()"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print('OK - audio + particles patched')
