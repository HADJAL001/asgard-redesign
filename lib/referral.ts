/* ================================================================
   OSGARD · Referral code capture
   ----------------------------------------------------------------
   Реферальные ссылки указывают на `/?ref=<code>` (см. referral-view.tsx).
   Код нужно запомнить на визит гостя и передать при регистрации —
   к моменту сабмита формы query-параметр уже может быть потерян
   (переход по ссылкам лендинга, редиректы OAuth и т.д.).
   ================================================================ */

const REF_KEY = "osgard_ref_code"

export function captureReferralCode() {
  if (typeof window === "undefined") return
  const code = new URLSearchParams(window.location.search).get("ref")
  if (code) {
    try {
      localStorage.setItem(REF_KEY, code)
    } catch {
      /* ignore storage errors */
    }
  }
}

export function getReferralCode(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(REF_KEY)
  } catch {
    return null
  }
}

export function clearReferralCode() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(REF_KEY)
  } catch {
    /* ignore storage errors */
  }
}
