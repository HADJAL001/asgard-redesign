export type RawProviderCall = (prompt: string, maxTokens: number) => Promise<string | null>

export async function firstAcceptedProviderResponse(
  chain: RawProviderCall[],
  prompt: string,
  maxTokens: number,
  accepts: (response: string) => boolean = (response) => response.trim().length > 0,
  onRejected?: (index: number, response: string, providerName: string) => void,
): Promise<string | null> {
  for (let index = 0; index < chain.length; index += 1) {
    const provider = chain[index]
    let result: string | null = null
    let failure = "unavailable"
    try {
      result = await provider(prompt, maxTokens)
      if (result && accepts(result)) {
        if (index > 0) console.warn("[ai-router] provider failover succeeded", { provider: provider.name, attempt: index + 1 })
        return result
      }
      if (result) {
        failure = "response_rejected"
        onRejected?.(index, result, provider.name)
      }
    } catch (error) {
      failure = "provider_call_threw"
      console.error("[ai-router] provider adapter threw", { provider: provider.name, attempt: index + 1, error: error instanceof Error ? error.name : "unknown" })
    }
    if (index + 1 < chain.length) console.warn("[ai-router] provider failover", { from: provider.name, to: chain[index + 1].name, reason: failure, attempt: index + 1 })
  }
  return null
}
