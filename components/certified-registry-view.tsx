"use client"

/* ================================================================
   OSGARD · Публичный реестр «OSGARD Certified Vibecoder» (/certified)
   ----------------------------------------------------------------
   Верифицируемость credential = публичность. Любой (без авторизации)
   может: посмотреть реестр действительных сертификатов и проверить
   один serial (действителен / отозван / не найден).

   Данные — только реальные (GET /certified, GET /certified/:serial).
   «Без халтуры»: пустой реестр показывает честное «пока никого», а не
   выдуманные карточки; верификация честно раскрывает и отозванные.

   Визуальный язык — как весь премиальный вертикал Academy (золото +
   serif на serial/числах). Стили заскоуплены префиксом `acr-`,
   инжектятся локальным <style>. Копирайт русскоязычный (как
   academy-view.tsx / certification-progress.tsx — раздел сознательно
   без i18n).
   ================================================================ */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  BadgeCheck,
  ShieldCheck,
  Crown,
  Rocket,
  Search,
  Check,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"

type CredentialTier = "founder_track" | "founder_circle"
type CredentialStatus = "issued" | "revoked"

type PublicCert = {
  serial: string
  tier: CredentialTier
  status: CredentialStatus
  holderName: string
  issuedAt: number
  revokedAt: number | null
}
type RegistryResponse = { certificates: PublicCert[]; total: number; limit: number; offset: number }
type VerifyFound = { found: true; certificate: PublicCert }
type VerifyMiss = { found: false; serial: string; message: string }

const PAGE = 60

const TIER_META: Record<CredentialTier, { label: string; Icon: typeof Rocket; circle: boolean }> = {
  founder_track: { label: "Founder Track", Icon: Rocket, circle: false },
  founder_circle: { label: "Founder Circle", Icon: Crown, circle: true },
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })
}

export function CertifiedRegistryView() {
  const [items, setItems] = useState<PublicCert[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)

  // Верификация по serial
  const [query, setQuery] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyFound | VerifyMiss | null>(null)

  const load = useCallback(async (offset: number) => {
    const res = await apiClient.get<RegistryResponse>(`/certified?limit=${PAGE}&offset=${offset}`)
    return res
  }, [])

  useEffect(() => {
    let alive = true
    load(0)
      .then((res) => {
        if (!alive) return
        setItems(res.certificates ?? [])
        setTotal(res.total ?? 0)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [load])

  async function handleMore() {
    setLoadingMore(true)
    try {
      const res = await load(items.length)
      setItems((prev) => [...prev, ...(res.certificates ?? [])])
      setTotal(res.total ?? total)
    } catch {
      /* тихо — кнопка «ещё» просто не догрузит */
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleVerify(e?: React.FormEvent) {
    e?.preventDefault()
    const serial = query.trim().toUpperCase()
    if (!serial) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await apiClient.get<VerifyFound>(`/certified/${encodeURIComponent(serial)}`)
      setVerifyResult(res)
    } catch (err: any) {
      // 404 → честный «не найден» (бэк отдаёт { found:false, serial, message }).
      const data = err?.data
      if (data && typeof data === "object" && "found" in data) {
        setVerifyResult(data as VerifyMiss)
      } else {
        setVerifyResult({ found: false, serial, message: "Такой credential не найден в реестре OSGARD." })
      }
    } finally {
      setVerifying(false)
    }
  }

  function clearVerify() {
    setQuery("")
    setVerifyResult(null)
  }

  const canLoadMore = items.length < total

  return (
    <div className="acr-root">
      <Navbar />

      <main className="acr-main">
        {/* HERO */}
        <header className="acr-hero">
          <span className="acr-eyebrow">
            <ShieldCheck size={14} strokeWidth={2.4} />
            ПУБЛИЧНЫЙ РЕЕСТР
          </span>
          <h1 className="acr-title">
            OSGARD <span className="acr-title-accent">Certified Vibecoder</span>
          </h1>
          <p className="acr-lede">
            Каждый credential публично проверяем. Найдите держателя по серийному номеру и убедитесь, что
            знак действителен и не отозван.
          </p>
        </header>

        {/* ВЕРИФИКАЦИЯ ПО SERIAL */}
        <form className="acr-verify" onSubmit={handleVerify}>
          <div className="acr-verify-field">
            <Search size={17} strokeWidth={1.8} className="acr-verify-ico" />
            <input
              className="acr-verify-input"
              placeholder="OSGARD-VC-XXXX-XXXX-XXXX"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Серийный номер credential"
            />
            {query && (
              <button type="button" className="acr-verify-clear" onClick={clearVerify} aria-label="Очистить">
                <X size={15} strokeWidth={2} />
              </button>
            )}
          </div>
          <button type="submit" className="acr-verify-btn" disabled={verifying || !query.trim()}>
            {verifying ? <Loader2 size={16} className="acr-spin" /> : <ShieldCheck size={16} strokeWidth={2} />}
            Проверить
          </button>
        </form>

        {/* РЕЗУЛЬТАТ ВЕРИФИКАЦИИ */}
        {verifyResult && (
          <div className="acr-result">
            {verifyResult.found ? (
              <VerifyCard cert={verifyResult.certificate} />
            ) : (
              <div className="acr-miss">
                <AlertTriangle size={20} strokeWidth={1.9} />
                <div>
                  <div className="acr-miss-serial">{verifyResult.serial}</div>
                  <div className="acr-miss-text">{verifyResult.message}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* РЕЕСТР */}
        <section className="acr-registry">
          <div className="acr-registry-head">
            <h2 className="acr-registry-title">Действительные сертификаты</h2>
            {!loading && !failed && <span className="acr-registry-count">{total}</span>}
          </div>

          {loading ? (
            <div className="acr-state">
              <Loader2 size={22} className="acr-spin" />
              <span>Загружаем реестр…</span>
            </div>
          ) : failed ? (
            <div className="acr-state">Не удалось загрузить реестр. Обновите страницу позже.</div>
          ) : items.length === 0 ? (
            <div className="acr-state acr-empty">
              <BadgeCheck size={30} strokeWidth={1.3} />
              <p>Пока никого. Первые сертифицированные вайбкодеры появятся здесь.</p>
              <Link href="/academy" className="acr-empty-link">
                Пройти путь основателя →
              </Link>
            </div>
          ) : (
            <>
              <ul className="acr-grid">
                {items.map((c) => (
                  <li key={c.serial}>
                    <RegistryCard cert={c} />
                  </li>
                ))}
              </ul>
              {canLoadMore && (
                <button type="button" className="acr-more" onClick={handleMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 size={15} className="acr-spin" /> : null}
                  Показать ещё
                </button>
              )}
            </>
          )}
        </section>

        {/* Честная сноска */}
        <p className="acr-fineprint">
          «OSGARD Certified Vibecoder» — экосистемная сертификация платформы, а не государственная лицензия.
          Реестр показывает только действительные сертификаты; отозванные раскрываются при проверке по serial.
        </p>
      </main>

      <style>{REGISTRY_CSS}</style>
    </div>
  )
}

/* Крупная карта результата верификации (в т.ч. отозванного) */
function VerifyCard({ cert }: { cert: PublicCert }) {
  const tier = TIER_META[cert.tier] ?? TIER_META.founder_track
  const revoked = cert.status === "revoked"
  return (
    <article className={`acr-vcard${revoked ? " is-revoked" : ""}`}>
      <div className="acr-vcard-seal">
        <tier.Icon size={28} strokeWidth={1.2} />
      </div>
      <div className="acr-vcard-body">
        <div className="acr-vcard-holder">{cert.holderName}</div>
        <div className="acr-vcard-serial">{cert.serial}</div>
        <div className="acr-vcard-line">
          <span>{tier.label}</span>
          <span className="acr-dot">·</span>
          <span>выдан {fmtDate(cert.issuedAt)}</span>
        </div>
      </div>
      <div className={`acr-vcard-status${revoked ? " is-revoked" : ""}`}>
        {revoked ? (
          <>
            <AlertTriangle size={14} strokeWidth={2.2} /> Отозван
          </>
        ) : (
          <>
            <Check size={14} strokeWidth={3} /> Действителен
          </>
        )}
      </div>
    </article>
  )
}

/* Компактная карточка реестра */
function RegistryCard({ cert }: { cert: PublicCert }) {
  const tier = TIER_META[cert.tier] ?? TIER_META.founder_track
  return (
    <article className={`acr-card${tier.circle ? " is-circle" : ""}`}>
      <div className="acr-card-top">
        <span className="acr-card-seal">
          <tier.Icon size={20} strokeWidth={1.3} />
        </span>
        {tier.circle && (
          <span className="acr-card-circle">
            <Crown size={10} strokeWidth={2.4} /> Circle
          </span>
        )}
      </div>
      <div className="acr-card-holder">{cert.holderName}</div>
      <div className="acr-card-serial">{cert.serial}</div>
      <div className="acr-card-foot">
        <span className="acr-card-tier">{tier.label}</span>
        <span className="acr-card-date">{fmtDate(cert.issuedAt)}</span>
      </div>
    </article>
  )
}

const REGISTRY_CSS = `
.acr-root {
  position: relative; min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgba(212,175,55,0.10), transparent 60%),
    #070B18;
  color: #EFE9DA;
}
.acr-main { max-width: 1120px; margin: 0 auto; padding: 64px 24px 120px; }

/* ── Hero ── */
.acr-hero { text-align: center; max-width: 720px; margin: 0 auto 40px; }
.acr-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
  color: #D4AF37; padding: 7px 16px; border-radius: 999px;
  border: 1px solid rgba(212,175,55,0.35); background: rgba(212,175,55,0.06);
}
.acr-title {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: clamp(38px, 6vw, 62px); line-height: 1.04; font-weight: 600;
  margin: 20px 0 0; color: #F6F1E4;
}
.acr-title-accent {
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #B8860B);
  -webkit-background-clip: text; background-clip: text; color: transparent; font-style: italic;
}
.acr-lede { margin: 18px auto 0; max-width: 560px; font-size: 16px; line-height: 1.6; color: #C7C0AE; }

/* ── Верификация ── */
.acr-verify {
  display: flex; gap: 12px; max-width: 620px; margin: 0 auto 8px; flex-wrap: wrap;
}
.acr-verify-field {
  position: relative; flex: 1; min-width: 240px; display: flex; align-items: center;
}
.acr-verify-ico { position: absolute; left: 15px; color: #8B8574; pointer-events: none; }
.acr-verify-input {
  width: 100%; height: 52px; padding: 0 40px 0 42px; border-radius: 13px;
  background: rgba(18,24,42,0.8); border: 1px solid rgba(212,175,55,0.24);
  color: #F4EEDC; font-size: 15px; letter-spacing: 1px; outline: none;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.acr-verify-input::placeholder { color: #6C6656; letter-spacing: 0.5px; }
.acr-verify-input:focus { border-color: rgba(212,175,55,0.55); box-shadow: 0 0 0 3px rgba(212,175,55,0.1); }
.acr-verify-clear {
  position: absolute; right: 12px; display: grid; place-items: center; cursor: pointer;
  width: 22px; height: 22px; border-radius: 7px; color: #9C9585; background: rgba(255,255,255,0.05);
}
.acr-verify-clear:hover { color: #EFE9DA; }
.acr-verify-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 52px; padding: 0 24px; border-radius: 13px; cursor: pointer; white-space: nowrap;
  font-size: 14px; font-weight: 800; letter-spacing: 0.6px; color: #1A1405;
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #C79A24); border: 1px solid transparent;
  box-shadow: 0 10px 30px rgba(212,175,55,0.24), inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease;
}
.acr-verify-btn:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 14px 40px rgba(212,175,55,0.38); }
.acr-verify-btn:disabled { cursor: default; opacity: 0.6; }

/* ── Результат верификации ── */
.acr-result { max-width: 620px; margin: 20px auto 0; }
.acr-vcard {
  display: flex; align-items: center; gap: 18px; padding: 22px 24px; border-radius: 18px;
  background: linear-gradient(180deg, rgba(30,24,10,0.9), rgba(14,12,8,0.94));
  border: 1px solid var(--color-gold, #D4AF37);
  box-shadow: 0 18px 50px rgba(7,11,24,0.55), 0 0 32px rgba(212,175,55,0.12);
}
.acr-vcard.is-revoked { border-color: rgba(231,76,60,0.5); box-shadow: 0 18px 50px rgba(7,11,24,0.55); filter: saturate(0.6); }
.acr-vcard-seal {
  width: 58px; height: 58px; border-radius: 15px; flex-shrink: 0; display: grid; place-items: center;
  color: #F4D77E; border: 1px solid rgba(212,175,55,0.55); box-shadow: inset 0 0 14px rgba(212,175,55,0.14);
}
.acr-vcard-body { flex: 1; min-width: 0; }
.acr-vcard-holder {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 24px; font-weight: 700; color: #F6F1E4; line-height: 1.15;
}
.acr-vcard-serial { margin-top: 3px; font-size: 13.5px; letter-spacing: 1px; color: #EAD79A; word-break: break-all; }
.acr-vcard-line { margin-top: 6px; font-size: 12.5px; color: #9C9585; display: flex; gap: 8px; flex-wrap: wrap; }
.acr-dot { color: rgba(212,175,55,0.5); }
.acr-vcard-status {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  color: #7CF0B0; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.35);
}
.acr-vcard-status.is-revoked { color: #F0A7A7; background: rgba(231,76,60,0.1); border-color: rgba(231,76,60,0.4); }
.acr-miss {
  display: flex; align-items: center; gap: 14px; padding: 20px 22px; border-radius: 16px;
  color: #F0C0A0; background: rgba(231,76,60,0.07); border: 1px solid rgba(231,76,60,0.3);
}
.acr-miss-serial { font-size: 14px; font-weight: 700; letter-spacing: 1px; color: #F4EEDC; word-break: break-all; }
.acr-miss-text { margin-top: 3px; font-size: 13px; color: #C0A99C; }

/* ── Реестр ── */
.acr-registry { margin-top: 56px; }
.acr-registry-head { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.acr-registry-title {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 26px; font-weight: 700; margin: 0; color: #F4EEDC;
}
.acr-registry-count {
  display: inline-flex; align-items: center; padding: 3px 11px; border-radius: 999px;
  font-size: 13px; font-weight: 700; color: #EAD79A;
  background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.28);
}
.acr-grid {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;
}
.acr-card {
  height: 100%; padding: 20px 20px 18px; border-radius: 16px;
  background: rgba(18,24,42,0.72); border: 1px solid rgba(212,175,55,0.16);
  box-shadow: 0 8px 32px rgba(10,17,40,0.35);
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), border-color .25s ease, box-shadow .25s ease;
}
.acr-card:hover { transform: translateY(-4px); border-color: rgba(212,175,55,0.4); box-shadow: 0 14px 40px rgba(212,175,55,0.14); }
.acr-card.is-circle { border-color: rgba(212,175,55,0.4); background: linear-gradient(180deg, rgba(30,24,10,0.8), rgba(16,14,10,0.85)); }
.acr-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.acr-card-seal {
  width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
  color: #D4AF37; background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.28);
}
.acr-card-circle {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px;
  font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #1A1405;
  background: linear-gradient(100deg, #F4D77E, #D4AF37);
}
.acr-card-holder {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 20px; font-weight: 700; color: #F4EEDC; line-height: 1.15;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.acr-card-serial { margin-top: 4px; font-size: 12px; letter-spacing: 0.8px; color: #C7B98A; word-break: break-all; }
.acr-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; font-size: 11.5px; color: #8B8574; }
.acr-card-tier { color: #A99F84; }

.acr-more {
  display: inline-flex; align-items: center; gap: 8px; margin: 28px auto 0;
  height: 46px; padding: 0 26px; border-radius: 12px; cursor: pointer;
  font-size: 13.5px; font-weight: 700; color: #EAD79A;
  background: rgba(212,175,55,0.06); border: 1px solid rgba(212,175,55,0.35);
  transition: background .2s ease;
}
.acr-more:hover:not(:disabled) { background: rgba(212,175,55,0.12); }
.acr-more:disabled { cursor: default; opacity: 0.6; }

/* ── Состояния ── */
.acr-state {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 56px 24px; text-align: center; color: #9C9585; font-size: 14px;
}
.acr-empty p { margin: 0; max-width: 360px; }
.acr-empty { color: #ABA491; }
.acr-empty-link { margin-top: 6px; font-size: 14px; font-weight: 600; color: #EAD79A; }
.acr-empty-link:hover { color: #F4D77E; }

.acr-fineprint { max-width: 720px; margin: 56px auto 0; text-align: center; font-size: 12.5px; line-height: 1.6; color: #7E7869; }

.acr-spin { animation: acr-rot 0.9s linear infinite; }
@keyframes acr-rot { to { transform: rotate(360deg); } }

@media (max-width: 620px) {
  .acr-verify-btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .acr-card, .acr-verify-btn, .acr-more, .acr-spin { transition: none !important; animation: none !important; }
}
`
