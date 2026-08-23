import db from "../lib/db"
import stripe from "../lib/stripe"
import { captureError } from "../lib/sentry"
import { compareTimecoinPurchases, type LocalTimecoinPurchase, type RemoteTimecoinSession } from "../lib/billing-reconciliation"

export async function runBillingReconciliation(limit = 100) {
  if (!stripe) throw new Error("Stripe is not configured")
  const stripeClient = stripe
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))
  const local = db.prepare(
    `SELECT user_id as userId, quantity, amount_cents as amountCents, provider_session_id as sessionId
     FROM timecoin_purchases WHERE provider = 'stripe' ORDER BY created_at DESC LIMIT ?`,
  ).all(safeLimit) as LocalTimecoinPurchase[]

  const sessions = await stripeClient.checkout.sessions.list({ limit: safeLimit })
  const toRemote = (session: any): RemoteTimecoinSession => ({
    id: session.id,
    paid: session.payment_status === "paid",
    amountCents: session.amount_total ?? 0,
    userId: Number.isInteger(Number(session.metadata?.userId)) ? Number(session.metadata?.userId) : null,
    quantity: Number.isInteger(Number(session.metadata?.quantity)) ? Number(session.metadata?.quantity) : null,
  })
  const remote: RemoteTimecoinSession[] = sessions.data
    .filter((session) => session.metadata?.purchaseType === "timecoin")
    .map(toRemote)

  const knownSessions = new Set(remote.map((session) => session.id))
  const olderSessions = await Promise.all(local
    .filter((purchase) => !knownSessions.has(purchase.sessionId))
    .map(async (purchase) => {
      try {
        return toRemote(await stripeClient.checkout.sessions.retrieve(purchase.sessionId))
      } catch {
        return null
      }
    }))
  remote.push(...olderSessions.filter((session): session is RemoteTimecoinSession => session !== null))

  const issues = compareTimecoinPurchases(local, remote)
  const report = {
    status: issues.length === 0 ? "ok" as const : "warning" as const,
    checkedAt: Date.now(),
    checkedCount: local.length + remote.length,
    localPurchases: local.length,
    stripeSessions: remote.length,
    issueCount: issues.length,
    issues,
  }
  db.prepare(
    `INSERT INTO billing_reconciliation_runs(status, checked_count, issue_count, report_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(report.status, report.checkedCount, report.issueCount, JSON.stringify(report), report.checkedAt)
  return report
}

export function latestBillingReconciliation() {
  const row = db.prepare(
    `SELECT report_json FROM billing_reconciliation_runs ORDER BY created_at DESC LIMIT 1`,
  ).get() as { report_json: string } | undefined
  return row ? JSON.parse(row.report_json) : null
}

export function scheduleBillingReconciliation(): void {
  if (process.env.NODE_ENV === "test" || process.env.BILLING_RECONCILIATION_DISABLED === "true" || !stripe) return
  const run = () => runBillingReconciliation().catch((error) => captureError("[billing-reconciliation] failed", error))
  setTimeout(run, 60_000).unref()
  setInterval(run, 6 * 60 * 60 * 1000).unref()
}
