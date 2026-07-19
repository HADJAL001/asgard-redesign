"use client"

/* ================================================================
   OSGARD · Demo Widget
   ----------------------------------------------------------------
   Интерактивное демо без регистрации: артефакт → близнец → токен → доход.
   Все данные хранятся в localStorage (ключ "osgard_demo").
   Финальный CTA ведёт на /register.
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Sparkles,
  Cpu,
  Gem,
  Swords,
  Wand2,
  ArrowRight,
  RotateCcw,
  Infinity as InfinityIcon,
  TrendingUp,
  ShieldCheck,
  Zap,
} from "lucide-react"

type ArtifactType = "neural" | "crystal" | "weapon"

type Artifact = {
  name: string
  type: ArtifactType
  power: number
  rarity: string
  energy: number
}

type Twin = {
  name: string
  avatarSeed: string
  style: string
  level: number
}

const TYPE_META: Record<
  ArtifactType,
  { label: string; icon: typeof Cpu; color: string; glow: string; styles: string[] }
> = {
  neural: {
    label: "Нейросеть",
    icon: Cpu,
    color: "#00D4FF",
    glow: "rgba(0,212,255,0.25)",
    styles: ["Аналитик", "Стратег", "Пророк данных"],
  },
  crystal: {
    label: "Кристалл",
    icon: Gem,
    color: "#B478FF",
    glow: "rgba(180,120,255,0.25)",
    styles: ["Хранитель", "Провидец", "Алхимик"],
  },
  weapon: {
    label: "Оружие",
    icon: Swords,
    color: "#E74C3C",
    glow: "rgba(231,76,60,0.25)",
    styles: ["Воин", "Штурмовик", "Клинок судьбы"],
  },
}

const RARITIES = ["Обычный", "Редкий", "Эпический", "Легендарный"]

const STORAGE_KEY = "osgard_demo"

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}

export function DemoWidget() {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [artifactName, setArtifactName] = useState("")
  const [artifactType, setArtifactType] = useState<ArtifactType>("neural")
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [twin, setTwin] = useState<Twin | null>(null)
  const [generating, setGenerating] = useState(false)

  // Восстановление состояния из localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (data.artifact) setArtifact(data.artifact)
        if (data.twin) setTwin(data.twin)
        if (data.artifactName) setArtifactName(data.artifactName)
        if (data.artifactType) setArtifactType(data.artifactType)
        if (data.step) setStep(data.step)
      }
    } catch {
      /* ignore */
    }
  }, [])

  function persist(next: Partial<{ artifact: Artifact; twin: Twin; step: number; artifactName: string; artifactType: ArtifactType }>) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const current = raw ? JSON.parse(raw) : {}
      const merged = { ...current, ...next }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    } catch {
      /* ignore */
    }
  }

  function handleGenerate() {
    if (!artifactName.trim()) return
    setGenerating(true)

    setTimeout(() => {
      const newArtifact: Artifact = {
        name: artifactName.trim(),
        type: artifactType,
        power: randomInt(62, 99),
        rarity: pick(RARITIES),
        energy: randomInt(40, 95),
      }
      setArtifact(newArtifact)
      persist({ artifact: newArtifact, artifactName, artifactType, step: 1 })
      setGenerating(false)
      setStep(1)
    }, 900)
  }

  function handleCreateTwin() {
    if (!artifact) return
    const meta = TYPE_META[artifact.type]
    const newTwin: Twin = {
      name: `${artifact.name.split(" ")[0]}_TWIN`,
      avatarSeed: `${artifact.type}-${artifact.power}`,
      style: pick(meta.styles),
      level: Math.max(1, Math.round(artifact.power / 12)),
    }
    setTwin(newTwin)
    persist({ twin: newTwin, step: 2 })
    setStep(2)
  }

  function goToStep3() {
    persist({ step: 3 })
    setStep(3)
  }

  function goToStep4() {
    persist({ step: 4 })
    setStep(4)
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY)
    setArtifact(null)
    setTwin(null)
    setArtifactName("")
    setArtifactType("neural")
    setStep(0)
  }

  const meta = artifact ? TYPE_META[artifact.type] : TYPE_META[artifactType]
  const Icon = meta.icon

  const income = useMemo(() => {
    if (!artifact) return { monthly: 247.5, usd: 2475 }
    const base = 247.5 * (artifact.power / 80)
    return { monthly: Math.round(base * 10) / 10, usd: Math.round(base * 10 * 10) / 10 }
  }, [artifact])

  return (
    <section className="demo-widget-section">
      <div className="demo-widget-inner">
        <div className="demo-header">
          <div className="demo-badge">
            <Sparkles size={14} aria-hidden="true" />
            Живая демонстрация · без регистрации
          </div>
          <h2>Попробуй прямо сейчас</h2>
          <p>Создай артефакт → получи цифрового близнеца → узнай его цену → увидь потенциальный доход</p>
        </div>

        {/* Прогресс-бар шагов */}
        <div className="demo-steps">
          {["Артефакт", "Близнец", "Токен", "Доход"].map((label, i) => (
            <div key={label} className={`demo-step-pill ${step >= i + 1 || (i === 0 && step >= 0) ? "active" : ""} ${step === i ? "current" : ""}`}>
              <span className="demo-step-num">{i + 1}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="demo-card" style={{ ["--accent" as any]: meta.color, ["--accent-glow" as any]: meta.glow }}>
          {/* ШАГ 0/1: Создание артефакта */}
          {step <= 1 && (
            <div className="demo-panel">
              <div className="demo-panel-icon">
                <Wand2 size={22} aria-hidden="true" />
              </div>
              <h3>Шаг 1 · Создай артефакт</h3>

              <div className="demo-field">
                <label>Название</label>
                <input
                  type="text"
                  value={artifactName}
                  onChange={(e) => {
                    setArtifactName(e.target.value)
                    persist({ artifactName: e.target.value })
                  }}
                  placeholder="Например: Меч Вечности"
                  disabled={step === 1}
                />
              </div>

              <div className="demo-field">
                <label>Тип артефакта</label>
                <div className="demo-type-grid">
                  {(Object.keys(TYPE_META) as ArtifactType[]).map((t) => {
                    const m = TYPE_META[t]
                    const TIcon = m.icon
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={step === 1}
                        onClick={() => {
                          setArtifactType(t)
                          persist({ artifactType: t })
                        }}
                        className={`demo-type-btn ${artifactType === t ? "selected" : ""}`}
                        style={{ ["--accent" as any]: m.color }}
                      >
                        <TIcon size={18} aria-hidden="true" />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {step === 0 && (
                <button
                  type="button"
                  className="demo-cta"
                  onClick={handleGenerate}
                  disabled={!artifactName.trim() || generating}
                >
                  {generating ? "Генерация..." : "Сгенерировать"}
                  {!generating && <Sparkles size={16} aria-hidden="true" />}
                </button>
              )}

              {artifact && step === 1 && (
                <>
                  <div className="demo-stats">
                    <div className="demo-stat">
                      <span className="demo-stat-label">Мощь</span>
                      <span className="demo-stat-value">{artifact.power}</span>
                    </div>
                    <div className="demo-stat">
                      <span className="demo-stat-label">Редкость</span>
                      <span className="demo-stat-value">{artifact.rarity}</span>
                    </div>
                    <div className="demo-stat">
                      <span className="demo-stat-label">Энергия</span>
                      <span className="demo-stat-value">{artifact.energy}%</span>
                    </div>
                  </div>
                  <button type="button" className="demo-cta" onClick={handleCreateTwin}>
                    Создать цифрового близнеца <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* ШАГ 2: Близнец */}
          {step === 2 && twin && artifact && (
            <div className="demo-panel">
              <div className="demo-panel-icon">
                <Zap size={22} aria-hidden="true" />
              </div>
              <h3>Шаг 2 · Твой цифровой близнец готов</h3>

              <div className="demo-twin-card">
                <div className="demo-twin-avatar">
                  <Icon size={36} aria-hidden="true" />
                </div>
                <div className="demo-twin-name">{twin.name}</div>
                <div className="demo-twin-style">{twin.style}</div>
                <div className="demo-twin-level">
                  Уровень <b>{twin.level}</b>
                </div>
              </div>

              <button type="button" className="demo-cta" onClick={goToStep3}>
                Посмотреть токен <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ШАГ 3: Токен */}
          {step === 3 && twin && (
            <div className="demo-panel">
              <div className="demo-panel-icon">
                <ShieldCheck size={22} aria-hidden="true" />
              </div>
              <h3>Шаг 3 · Токен близнеца выпущен</h3>

              <div className="demo-token-card">
                <div className="demo-token-row">
                  <span>Токен</span>
                  <span>${twin.name}</span>
                </div>
                <div className="demo-token-row demo-token-price">
                  <span>Цена</span>
                  <span>
                    <InfinityIcon size={16} className="ico-inline" aria-hidden="true" /> 50.00
                  </span>
                </div>
                <div className="demo-token-row">
                  <span>Статус</span>
                  <span className="demo-token-status">Активен</span>
                </div>
              </div>

              <button type="button" className="demo-cta" onClick={goToStep4}>
                Рассчитать доход <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ШАГ 4: Доход + финальный CTA */}
          {step === 4 && (
            <div className="demo-panel">
              <div className="demo-panel-icon">
                <TrendingUp size={22} aria-hidden="true" />
              </div>
              <h3>Шаг 4 · Твой потенциальный доход</h3>

              <div className="demo-income-card">
                <div className="demo-income-value">
                  <InfinityIcon size={22} className="ico-inline gold" aria-hidden="true" /> {income.monthly.toFixed(2)}
                </div>
                <div className="demo-income-usd">≈ ${income.usd.toLocaleString("ru-RU")}</div>
                <div className="demo-income-sub">потенциальный доход в месяц</div>
              </div>

              <Link href="/register" className="demo-cta demo-cta-final">
                Зарегистрироваться и начать зарабатывать <ArrowRight size={16} aria-hidden="true" />
              </Link>

              <button type="button" className="demo-reset" onClick={handleReset}>
                <RotateCcw size={13} aria-hidden="true" /> Начать демо заново
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{DEMO_CSS}</style>
    </section>
  )
}

const DEMO_CSS = `
.demo-widget-section {
  position: relative;
  z-index: 2;
  padding: 60px 24px 100px;
  background: radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.06), transparent 60%);
}
.demo-widget-inner { max-width: 640px; margin: 0 auto; }

.demo-header { text-align: center; margin-bottom: 32px; }
.demo-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; color: #00D4FF;
  background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2);
  padding: 6px 14px; border-radius: 20px; margin-bottom: 16px; letter-spacing: 0.03em;
}
.demo-header h2 {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 32px; color: #fff; margin: 0 0 10px; letter-spacing: 2px;
}
.demo-header p { font-size: 14px; color: #8A94A8; max-width: 460px; margin: 0 auto; line-height: 1.6; }

.demo-steps {
  display: flex; justify-content: center; gap: 8px; margin-bottom: 24px; flex-wrap: wrap;
}
.demo-step-pill {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #4A5568;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  padding: 6px 12px; border-radius: 20px; transition: all 0.3s ease;
}
.demo-step-pill.active { color: #B0C0D8; border-color: rgba(0,212,255,0.15); }
.demo-step-pill.current {
  color: #00D4FF; border-color: rgba(0,212,255,0.4); background: rgba(0,212,255,0.06);
}
.demo-step-num {
  width: 18px; height: 18px; border-radius: 50%;
  background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600;
}
.demo-step-pill.current .demo-step-num { background: #00D4FF; color: #000; }

.demo-card {
  background: #0D1017;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 0 60px var(--accent-glow, rgba(0,212,255,0.1));
  transition: box-shadow 0.4s ease;
}

.demo-panel { display: flex; flex-direction: column; gap: 18px; }
.demo-panel-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: center; color: var(--accent, #00D4FF);
}
.demo-panel h3 { font-size: 18px; color: #fff; font-weight: 600; margin: 0; letter-spacing: 0.3px; }

.demo-field { display: flex; flex-direction: column; gap: 8px; }
.demo-field label { font-size: 12px; color: #6A7A8A; font-weight: 500; }
.demo-field input {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 12px 14px; font-size: 14px; color: #fff; outline: none;
  transition: border-color 0.3s ease;
}
.demo-field input:focus { border-color: var(--accent, #00D4FF); }
.demo-field input:disabled { opacity: 0.6; }

.demo-type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.demo-type-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 14px 8px; font-size: 12px; color: #8A94A8; cursor: pointer;
  transition: all 0.25s ease;
}
.demo-type-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.demo-type-btn.selected {
  border-color: var(--accent); color: #fff;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 25%, transparent);
}
.demo-type-btn svg { color: var(--accent); }

.demo-cta {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #00D4FF, #0090C8);
  color: #001018; font-weight: 600; font-size: 14px;
  border: none; border-radius: 12px; padding: 13px 20px; cursor: pointer;
  transition: all 0.3s ease; text-decoration: none;
}
.demo-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,212,255,0.25); }
.demo-cta:disabled { opacity: 0.5; cursor: not-allowed; }
.demo-cta-final {
  background: linear-gradient(135deg, #FFD700, #FFA500); color: #1a0f00;
}
.demo-cta-final:hover { box-shadow: 0 8px 24px rgba(255,215,0,0.3); }

.demo-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.demo-stat {
  display: flex; flex-direction: column; gap: 4px; align-items: center;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; padding: 12px;
}
.demo-stat-label { font-size: 11px; color: #6A7A8A; }
.demo-stat-value { font-size: 18px; font-weight: 700; color: var(--accent, #00D4FF); }

.demo-twin-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 24px; background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
}
.demo-twin-avatar {
  width: 72px; height: 72px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--accent) 30%, #0A0E1A), #0A0E1A 80%);
  border: 1px solid var(--accent); display: flex; align-items: center; justify-content: center;
  color: var(--accent); box-shadow: 0 0 30px var(--accent-glow);
}
.demo-twin-name { font-size: 18px; font-weight: 700; color: #fff; margin-top: 8px; letter-spacing: 0.5px; }
.demo-twin-style { font-size: 13px; color: var(--accent); }
.demo-twin-level { font-size: 12px; color: #8A94A8; }
.demo-twin-level b { color: #fff; }

.demo-token-card {
  display: flex; flex-direction: column; gap: 10px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; padding: 18px;
}
.demo-token-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; color: #B0C0D8;
}
.demo-token-price { font-size: 18px; font-weight: 700; color: #FFD700; }
.demo-token-status {
  font-size: 12px; color: #4ADE80; background: rgba(74,222,128,0.1);
  padding: 3px 10px; border-radius: 20px;
}
.ico-inline { display: inline-block; vertical-align: -3px; margin-right: 2px; }
.ico-inline.gold { color: #FFD700; }

.demo-income-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 28px; text-align: center;
  background: radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.08), transparent 70%);
  border: 1px solid rgba(255,215,0,0.15); border-radius: 16px;
}
.demo-income-value {
  font-size: 36px; font-weight: 800; color: #FFD700; display: flex; align-items: center; gap: 6px;
}
.demo-income-usd { font-size: 16px; color: #B0C0D8; }
.demo-income-sub { font-size: 12px; color: #6A7A8A; margin-top: 4px; }

.demo-reset {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  background: transparent; border: none; color: #6A7A8A; font-size: 12px;
  cursor: pointer; padding: 4px; transition: color 0.2s ease;
}
.demo-reset:hover { color: #B0C0D8; }

@media (max-width: 600px) {
  .demo-card { padding: 22px; }
  .demo-header h2 { font-size: 24px; }
  .demo-type-grid { gap: 6px; }
  .demo-type-btn { font-size: 11px; padding: 10px 4px; }
}
`
