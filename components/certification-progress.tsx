"use client"

/* ================================================================
   OSGARD · Academy — «Экзамен делом» (виджет прогресса к сертификации)
   ----------------------------------------------------------------
   Показывает авторизованному пользователю честный чек-лист критериев
   до права на credential «OSGARD Certified Vibecoder». Значения —
   реальные (GET /academy/certification/eligibility поверх существующих
   достижений: тир Архитектора, задеплоенные проекты, craft_score,
   авторские артефакты). Никакого фейка: нет данных → все критерии
   met:false, current:0.

   Стили заскоуплены префиксом `acd-cert-` в общем языке раздела
   Academy (золото + serif на числах), инжектятся локальным <style>.
   Раздел Academy сознательно без i18n (как academy-view.tsx) —
   копирайт русскоязычный, бэк отдаёт готовые русские label.
   ================================================================ */

import { useEffect, useState } from "react"
import { BadgeCheck, Check, Lock } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

type Criterion = {
  key: string
  label: string
  current: number
  target: number
  unit: "count" | "tier" | "ratio"
  met: boolean
}
type Eligibility = {
  eligible: boolean
  metCount: number
  totalCount: number
  criteria: Criterion[]
  enrolled: boolean
}

/** Человекочитаемое значение критерия по его единице измерения. */
function fmt(value: number, unit: Criterion["unit"]): string {
  if (unit === "ratio") return `${Math.round(value * 100)}%`
  return String(value)
}

/** Доля выполнения 0..1 для прогресс-бара (защищено от target=0). */
function fraction(c: Criterion): number {
  if (c.met) return 1
  if (c.target <= 0) return 1
  const f = c.current / c.target
  return f < 0 ? 0 : f > 1 ? 1 : f
}

export function CertificationProgress() {
  const { user } = useAuth()
  const [data, setData] = useState<Eligibility | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    apiClient
      .get<Eligibility>("/academy/certification/eligibility")
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [user])

  // Гость или ошибка загрузки — виджет просто не показываем (тихая деградация).
  if (!user || failed || !data) return null

  return (
    <section className="acd-cert">
      <div className="acd-cert-head">
        <div className="acd-cert-ico">
          <BadgeCheck size={22} strokeWidth={1.7} />
        </div>
        <div>
          <h2 className="acd-cert-title">Экзамен делом</h2>
          <p className="acd-cert-sub">
            Право на credential <b>Vibecoder</b> не покупается — оно вычисляется из ваших реальных
            достижений на платформе.
          </p>
        </div>
        <div className={`acd-cert-badge${data.eligible ? " is-ready" : ""}`}>
          {data.eligible ? (
            <>
              <Check size={14} strokeWidth={3} /> Готово к выдаче
            </>
          ) : (
            <>
              {data.metCount} / {data.totalCount} выполнено
            </>
          )}
        </div>
      </div>

      <ul className="acd-cert-list">
        {data.criteria.map((c) => {
          const pct = Math.round(fraction(c) * 100)
          return (
            <li key={c.key} className={`acd-cert-item${c.met ? " is-met" : ""}`}>
              <div className="acd-cert-item-top">
                <span className="acd-cert-mark">
                  {c.met ? <Check size={13} strokeWidth={3} /> : <Lock size={12} strokeWidth={2} />}
                </span>
                <span className="acd-cert-label">{c.label}</span>
                <span className="acd-cert-val">
                  {fmt(c.current, c.unit)} <i>/ {fmt(c.target, c.unit)}</i>
                </span>
              </div>
              <div className="acd-cert-track">
                <div className="acd-cert-fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      {data.eligible ? (
        <p className="acd-cert-foot is-ready">
          Все критерии выполнены. Оформите запись в программу — и вы сможете получить credential.
        </p>
      ) : (
        <p className="acd-cert-foot">
          Отгружайте проекты и оттачивайте ковку — прогресс обновляется автоматически по мере ваших
          реальных достижений.
        </p>
      )}

      <style>{CERT_CSS}</style>
    </section>
  )
}

const CERT_CSS = `
.acd-cert {
  max-width: 880px; margin: 0 auto 72px; padding: 32px 30px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(20,26,46,0.86), rgba(12,16,30,0.9));
  border: 1px solid rgba(212,175,55,0.22);
  box-shadow: 0 18px 50px rgba(7,11,24,0.5);
}
.acd-cert-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 26px; }
.acd-cert-ico {
  width: 48px; height: 48px; border-radius: 13px; flex-shrink: 0;
  display: grid; place-items: center; color: #D4AF37;
  background: rgba(212,175,55,0.10); border: 1px solid rgba(212,175,55,0.3);
}
.acd-cert-title {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 30px; font-weight: 700; margin: 0; color: #F4EEDC; line-height: 1.1;
}
.acd-cert-sub { margin: 4px 0 0; font-size: 14px; line-height: 1.55; color: #ABA491; max-width: 520px; }
.acd-cert-sub b { color: #EAD79A; font-weight: 600; }
.acd-cert-badge {
  margin-left: auto; flex-shrink: 0; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 999px;
  font-size: 12.5px; font-weight: 700; letter-spacing: 0.4px;
  color: #C7C0AE; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(212,175,55,0.22);
}
.acd-cert-badge.is-ready {
  color: #1A1405; border-color: transparent;
  background: linear-gradient(100deg, #F4D77E, #D4AF37);
}
.acd-cert-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 18px; }
.acd-cert-item-top { display: flex; align-items: center; gap: 11px; margin-bottom: 9px; }
.acd-cert-mark {
  width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0;
  display: grid; place-items: center; color: #9C9585;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(212,175,55,0.2);
}
.acd-cert-item.is-met .acd-cert-mark {
  color: #1A1405; border-color: transparent;
  background: linear-gradient(100deg, #F4D77E, #D4AF37);
}
.acd-cert-label { font-size: 14.5px; color: #CFC8B6; }
.acd-cert-item.is-met .acd-cert-label { color: #EFE9DA; }
.acd-cert-val {
  margin-left: auto; flex-shrink: 0;
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 19px; font-weight: 700; color: #F4EEDC;
}
.acd-cert-val i { font-style: normal; font-size: 14px; color: #8B8574; font-family: inherit; }
.acd-cert-track {
  height: 7px; border-radius: 999px; overflow: hidden;
  background: rgba(255,255,255,0.05);
}
.acd-cert-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #B8860B, #F4D77E);
  box-shadow: 0 0 12px rgba(212,175,55,0.4);
  transition: width .6s cubic-bezier(0.16,1,0.3,1);
}
.acd-cert-foot { margin: 24px 0 0; font-size: 13px; line-height: 1.55; color: #8B8574; text-align: center; }
.acd-cert-foot.is-ready { color: #EAD79A; }
@media (max-width: 860px) {
  .acd-cert-head { flex-wrap: wrap; }
  .acd-cert-badge { margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .acd-cert-fill { transition: none; }
}
`
