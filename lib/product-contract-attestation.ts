import crypto from "node:crypto"

export type ProductContractAttestation = {
  algorithm: "HMAC-SHA256"
  signature: string
}

const DOMAIN = "osgard:blueprint-product-contract:v1\n"

function signingKey(): string | null {
  const key = (process.env.PRODUCT_CONTRACT_SIGNING_KEY || process.env.ARTIFACT_SIGNING_KEY || "").trim()
  return Buffer.byteLength(key, "utf8") >= 32 ? key : null
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function signProductContract(value: unknown): ProductContractAttestation | null {
  const key = signingKey()
  if (!key) return null
  const signature = crypto.createHmac("sha256", key).update(DOMAIN + canonical(value)).digest("hex")
  return { algorithm: "HMAC-SHA256", signature }
}
