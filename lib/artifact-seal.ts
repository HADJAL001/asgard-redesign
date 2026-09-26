import crypto from "node:crypto"

export type ArtifactSeal = {
  algorithm: "HMAC-SHA256"
  digest: string
  signature: string
  signedAt: string
  signer: "osgard-web"
}

type ArtifactSealInput = {
  blueprintId: string
  tenantId: string
  revision: number
  contractHash: string
  taskId: string
  result: Record<string, string>
}

const MIN_SIGNING_KEY_BYTES = 32

/** A blank or short key must never turn an artifact into verified evidence. */
export function artifactSigningKey(): string | null {
  const key = process.env.ARTIFACT_SIGNING_KEY?.trim()
  return key && Buffer.byteLength(key, "utf8") >= MIN_SIGNING_KEY_BYTES ? key : null
}

function canonicalize(input: ArtifactSealInput): string {
  return JSON.stringify({
    blueprintId: input.blueprintId,
    tenantId: input.tenantId,
    revision: input.revision,
    contractHash: input.contractHash,
    taskId: input.taskId,
    result: Object.fromEntries(Object.entries(input.result).sort(([a], [b]) => a.localeCompare(b))),
  })
}

export function createArtifactSeal(input: ArtifactSealInput, signedAt = new Date().toISOString()): ArtifactSeal | null {
  const key = artifactSigningKey()
  if (!key) return null
  const canonical = canonicalize(input)
  const digest = crypto.createHash("sha256").update(canonical).digest("hex")
  const signature = crypto.createHmac("sha256", key).update(`${digest}.${signedAt}`).digest("hex")
  return { algorithm: "HMAC-SHA256", digest, signature, signedAt, signer: "osgard-web" }
}

export function verifyArtifactSeal(input: ArtifactSealInput, seal: ArtifactSeal): boolean {
  const key = artifactSigningKey()
  if (!key || seal.algorithm !== "HMAC-SHA256" || seal.signer !== "osgard-web") return false
  const digest = crypto.createHash("sha256").update(canonicalize(input)).digest("hex")
  const expected = crypto.createHmac("sha256", key).update(`${digest}.${seal.signedAt}`).digest("hex")
  const supplied = Buffer.from(seal.signature, "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  return digest === seal.digest && supplied.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, supplied)
}
