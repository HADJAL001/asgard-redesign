import { TIMECOIN_USD_CENTS } from "./timecoin-economy"

export type ReconciliationIssue = { code: string; subject: string; detail: string }
export type LocalTimecoinPurchase = { userId: number; quantity: number; amountCents: number; sessionId: string }
export type RemoteTimecoinSession = { id: string; paid: boolean; amountCents: number; userId: number | null; quantity: number | null }

export function compareTimecoinPurchases(
  local: LocalTimecoinPurchase[],
  remote: RemoteTimecoinSession[],
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = []
  const localBySession = new Map(local.map((item) => [item.sessionId, item]))
  const remoteBySession = new Map(remote.map((item) => [item.id, item]))
  for (const purchase of local) {
    const expected = purchase.quantity * TIMECOIN_USD_CENTS
    if (purchase.amountCents !== expected) issues.push({ code: "LOCAL_AMOUNT_MISMATCH", subject: purchase.sessionId, detail: `${purchase.amountCents} != ${expected}` })
    const session = remoteBySession.get(purchase.sessionId)
    if (!session) {
      issues.push({ code: "STRIPE_SESSION_MISSING", subject: purchase.sessionId, detail: "Local credit has no matching recent Stripe session" })
      continue
    }
    if (!session.paid) issues.push({ code: "STRIPE_NOT_PAID", subject: purchase.sessionId, detail: "TimeCoin was credited for an unpaid session" })
    if (session.amountCents !== expected) issues.push({ code: "STRIPE_AMOUNT_MISMATCH", subject: purchase.sessionId, detail: `${session.amountCents} != ${expected}` })
    if (session.userId !== purchase.userId || session.quantity !== purchase.quantity) issues.push({ code: "STRIPE_METADATA_MISMATCH", subject: purchase.sessionId, detail: "Stripe metadata differs from the local purchase" })
  }
  for (const session of remote) {
    if (session.paid && !localBySession.has(session.id)) issues.push({ code: "PAID_SESSION_NOT_CREDITED", subject: session.id, detail: "Paid TimeCoin checkout is missing from the local ledger" })
  }
  return issues
}
