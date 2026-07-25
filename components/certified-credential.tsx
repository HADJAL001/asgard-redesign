"use client"

/* ================================================================
   OSGARD · Academy — Credential «OSGARD Certified Vibecoder»
   ----------------------------------------------------------------
   Персональная карта credential владельца + вход «Получить credential».
   Встраивается в academy-view.tsx под «Экзаменом делом».

   Три состояния (все на реальных данных GET /academy/certification/my):
     • есть активный credential  → премиальная карта (serial/тир/дата/
       статус) + шэр публичной ссылки верификации /certified/:serial;
     • нет credential, но eligible+enrolled → золотой CTA «Получить
       credential» (POST /academy/certification/claim);
     • нет credential и не готов → ничего (чек-лист «Экзамена делом»
       уже показан выше отдельным виджетом).

   Визуальный язык — как в разделе Academy (золото + serif на числах +
   ∞-водяной знак), стили заскоуплены префиксом `acd-cred-`, инжектятся
   локальным <style>. Раздел Academy сознательно без i18n — копирайт
   русскоязычный (как academy-view.tsx / certification-progress.tsx).
   «Без халтуры»: ни одной выдуманной цифры — рисуем только то, что
   реально пришло с бэка; отозванный credential показывается честно.
   ================================================================ */

import { useEffect, useState } from "react"
import { BadgeCheck, ShieldCheck, Crown, Rocket, Share2, Check, Loader2, AlertTriangle } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

type CredentialTier = "founder_track" | "founder_circle"
type CredentialStatus = "issued" | "revoked"

type Credential = {
  id: number
  serial: string
  tier: CredentialTier
  status: CredentialStatus
  holderName: string | null
  issuedAt: number
  revokedAt: number | null
  revokeReason: string | null
  snapshot: {
    tier: CredentialTier
    holderName: string
    metCount: number
    totalCount: number
    criteria: unknown[]
  } | null
}

type MyResponse = { certificate: Credential | null }
type Eligibility = { eligible: boolean; enrolled: boolean; metCount: number; totalCount: number }
type ClaimResponse = { certificate: Credential; alreadyIssued: boolean }

const TIER_META: Record<CredentialTier, { label: string; Icon: typeof Rocket; circle: boolean }> = {
  founder_track: { label: "Founder Track", Icon: Rocket, circle: false },
  founder_circle: { label: "Founder Circle", Icon: Crown, circle: true },
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
}

export function CertifiedCredential() {
  const { user } = useAuth()
  const [cert, setCert] = useState<Credential | null>(null)
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimErr, setClaimErr] = useState<string | null>(null)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    // Свой credential + готовность (для CTA «Получить»). Обе — тихая деградация.
    Promise.all([
      apiClient.get<MyResponse>("/academy/certification/my").catch(() => ({ certificate: null }) as MyResponse),
      apiClient
        .get<Eligibility>("/academy/certification/eligibility")
        .catch(() => null),
    ]).then(([my, e]) => {
      if (!alive) return
      setCert(my?.certificate ?? null)
      setElig(e)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [user])

  async function handleClaim() {
    setClaimErr(null)
    setClaiming(true)
    try {
      const res = await apiClient.post<ClaimResponse>("/academy/certification/claim", {})
      if (res?.certificate) setCert(res.certificate)
    } catch (e: any) {
      setClaimErr(e?.data?.error || e?.message || "Не удалось выпустить credential. Попробуйте позже.")
    } finally {
      setClaiming(false)
    }
  }

  async function handleShare() {
    if (!cert) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const url = `${origin}/certified/${cert.serial}`
    const text = `${cert.holderName ?? "Vibecoder"} — OSGARD Certified Vibecoder · ${cert.serial}`
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "OSGARD Certified Vibecoder", text, url })
        return
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    } catch {
      /* пользователь отменил шэр или буфер недоступен — тихо игнорируем */
    }
  }

  // Гость или ещё не загрузили — ничего не рисуем (тихая деградация).
  if (!user || !loaded) return null

  // Нет credential: показываем CTA только тем, кто реально готов и в программе.
  if (!cert) {
    if (!elig?.eligible || !elig?.enrolled) return null
    return (
      <section className="acd-cred acd-cred--claim">
        <div className="acd-cred-claim-ico">
          <BadgeCheck size={26} strokeWidth={1.7} />
        </div>
        <h2 className="acd-cred-claim-title">Экзамен пройден — заберите свой знак</h2>
        <p className="acd-cred-claim-sub">
          Все критерии «экзамена делом» выполнены и вы в программе. Выпустите свой публично проверяемый
          credential <b>OSGARD Certified Vibecoder</b>.
        </p>
        {claimErr && <p className="acd-cred-err">{claimErr}</p>}
        <button type="button" className="acd-cred-claim-btn" onClick={handleClaim} disabled={claiming}>
          {claiming ? <Loader2 size={17} className="acd-cred-spin" /> : <BadgeCheck size={17} strokeWidth={2.2} />}
          {claiming ? "Выпускаем…" : "Получить credential"}
        </button>
        <style>{CRED_CSS}</style>
      </section>
    )
  }

  const tier = TIER_META[cert.tier] ?? TIER_META.founder_track
  const revoked = cert.status === "revoked"

  return (
    <section className="acd-cred">
      <article className={`acd-cred-card${revoked ? " is-revoked" : ""}`}>
        {/* ∞-водяной знак */}
        <span aria-hidden className="acd-cred-wm">∞</span>

        {/* Гриф */}
        <div className="acd-cred-grif">
          <ShieldCheck size={15} strokeWidth={1.8} />
          <span>OSGARD CERTIFIED VIBECODER</span>
          {tier.circle && (
            <span className="acd-cred-circle">
              <Crown size={11} strokeWidth={2.4} /> Circle
            </span>
          )}
        </div>

        {/* Печать типа */}
        <div className="acd-cred-seal">
          <tier.Icon size={34} strokeWidth={1.15} />
        </div>

        {/* Имя владельца */}
        <h2 className="acd-cred-holder">{cert.holderName ?? "Vibecoder"}</h2>
        <div className="acd-cred-tier">{tier.label}</div>

        {/* Статус */}
        <div className={`acd-cred-status${revoked ? " is-revoked" : ""}`}>
          {revoked ? (
            <>
              <AlertTriangle size={13} strokeWidth={2.2} /> Отозван
            </>
          ) : (
            <>
              <Check size={13} strokeWidth={3} /> Действителен
            </>
          )}
        </div>

        {/* Разделитель */}
        <div className="acd-cred-rule" />

        {/* Реквизиты */}
        <dl className="acd-cred-meta">
          <div className="acd-cred-row">
            <dt>Серийный номер</dt>
            <dd className="acd-cred-serial">{cert.serial}</dd>
          </div>
          <div className="acd-cred-row">
            <dt>Выдан</dt>
            <dd>{fmtDate(cert.issuedAt)}</dd>
          </div>
          {revoked && cert.revokedAt && (
            <div className="acd-cred-row">
              <dt>Отозван</dt>
              <dd>{fmtDate(cert.revokedAt)}</dd>
            </div>
          )}
        </dl>

        {/* Шэр публичной ссылки верификации */}
        <button type="button" className="acd-cred-share" onClick={handleShare}>
          {shared ? <Check size={15} strokeWidth={2.4} /> : <Share2 size={15} strokeWidth={1.9} />}
          {shared ? "Ссылка скопирована" : "Поделиться · проверить публично"}
        </button>
        <p className="acd-cred-verify-hint">Любой может проверить подлинность по /certified/{cert.serial}</p>
      </article>

      <style>{CRED_CSS}</style>
    </section>
  )
}

const CRED_CSS = `
.acd-cred { max-width: 880px; margin: 0 auto 72px; }

/* ── Карта credential ── */
.acd-cred-card {
  position: relative; overflow: hidden;
  max-width: 460px; margin: 0 auto; padding: 34px 32px 30px;
  border-radius: 24px; text-align: center;
  background: linear-gradient(180deg, rgba(30,24,10,0.92), rgba(14,12,8,0.95));
  border: 1px solid var(--color-gold, #D4AF37);
  box-shadow: 0 24px 64px rgba(7,11,24,0.6), 0 0 42px rgba(212,175,55,0.14), inset 0 1px 0 rgba(255,255,255,0.06);
}
.acd-cred-card.is-revoked {
  border-color: rgba(231,76,60,0.55);
  box-shadow: 0 24px 64px rgba(7,11,24,0.6);
  filter: saturate(0.6);
}
.acd-cred-wm {
  position: absolute; top: -34px; right: -18px; pointer-events: none; user-select: none;
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 190px; line-height: 1; color: var(--color-gold, #D4AF37); opacity: 0.06;
}
.acd-cred-grif {
  position: relative; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
  font-size: 10.5px; font-weight: 700; letter-spacing: 2.4px; color: #D4AF37;
}
.acd-cred-circle {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 999px; letter-spacing: 1.2px;
  color: #1A1405; background: linear-gradient(100deg, #F4D77E, #D4AF37);
}
.acd-cred-seal {
  position: relative; width: 82px; height: 82px; margin: 22px auto 0; border-radius: 22px;
  display: grid; place-items: center; color: #F4D77E;
  border: 1px solid rgba(212,175,55,0.6);
  box-shadow: 0 0 20px rgba(212,175,55,0.35), inset 0 0 16px rgba(212,175,55,0.14);
}
.acd-cred-holder {
  position: relative; margin: 20px 0 0;
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 30px; font-weight: 700; line-height: 1.1; color: #F6F1E4;
}
.acd-cred-tier { position: relative; margin-top: 4px; font-size: 13px; letter-spacing: 0.4px; color: #C7B98A; }
.acd-cred-status {
  position: relative; display: inline-flex; align-items: center; gap: 6px; margin-top: 14px;
  padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700;
  color: #7CF0B0; background: rgba(46,204,113,0.10); border: 1px solid rgba(46,204,113,0.35);
}
.acd-cred-status.is-revoked { color: #F0A7A7; background: rgba(231,76,60,0.10); border-color: rgba(231,76,60,0.4); }
.acd-cred-rule {
  position: relative; height: 1px; width: 100%; margin: 22px 0 18px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent);
}
.acd-cred-meta { position: relative; margin: 0; display: grid; gap: 12px; text-align: left; }
.acd-cred-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.acd-cred-row dt { font-size: 12px; letter-spacing: 0.4px; color: #9C9585; margin: 0; }
.acd-cred-row dd { margin: 0; font-size: 14px; color: #EFE9DA; }
.acd-cred-serial {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 18px; font-weight: 700; letter-spacing: 1px; color: #F4D77E;
}
.acd-cred-share {
  position: relative; width: 100%; margin-top: 24px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 48px; border-radius: 13px; cursor: pointer;
  font-size: 13.5px; font-weight: 800; letter-spacing: 0.6px; color: #1A1405;
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #C79A24);
  border: 1px solid transparent;
  box-shadow: 0 10px 30px rgba(212,175,55,0.26), inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease;
}
.acd-cred-share:hover { transform: scale(1.02); box-shadow: 0 14px 40px rgba(212,175,55,0.4); }
.acd-cred-verify-hint {
  position: relative; margin: 12px 0 0; font-size: 11.5px; color: #8B8574; word-break: break-word;
}

/* ── CTA «Получить credential» ── */
.acd-cred--claim {
  max-width: 620px; padding: 34px 30px; border-radius: 22px; text-align: center;
  background: linear-gradient(180deg, rgba(20,26,46,0.86), rgba(12,16,30,0.9));
  border: 1px solid rgba(212,175,55,0.3);
  box-shadow: 0 18px 50px rgba(7,11,24,0.5);
}
.acd-cred-claim-ico {
  width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 15px;
  display: grid; place-items: center; color: #D4AF37;
  background: rgba(212,175,55,0.10); border: 1px solid rgba(212,175,55,0.32);
}
.acd-cred-claim-title {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 28px; font-weight: 700; margin: 0; color: #F4EEDC; line-height: 1.12;
}
.acd-cred-claim-sub { margin: 10px auto 0; max-width: 460px; font-size: 14px; line-height: 1.55; color: #ABA491; }
.acd-cred-claim-sub b { color: #EAD79A; font-weight: 600; }
.acd-cred-err { margin: 16px auto 0; max-width: 460px; font-size: 13px; color: #F0A7A7; }
.acd-cred-claim-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  margin-top: 22px; height: 52px; padding: 0 30px; border-radius: 14px; cursor: pointer;
  font-size: 14.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #1A1405;
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #C79A24);
  border: 1px solid transparent;
  box-shadow: 0 12px 34px rgba(212,175,55,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease;
}
.acd-cred-claim-btn:hover:not(:disabled) { transform: scale(1.03); box-shadow: 0 16px 44px rgba(212,175,55,0.44); }
.acd-cred-claim-btn:disabled { cursor: default; opacity: 0.75; }
.acd-cred-spin { animation: acd-cred-rot 0.9s linear infinite; }
@keyframes acd-cred-rot { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .acd-cred-share, .acd-cred-claim-btn, .acd-cred-spin { transition: none !important; animation: none !important; }
}
`
