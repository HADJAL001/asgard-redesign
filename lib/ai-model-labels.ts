const MODEL_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:claude|anthropic)\b/i, "OSGARD 5.0"],
  [/\b(?:kimi|moonshot)\b/i, "OSGARD 4.8"],
  [/\bdeep[\s_-]?seek\b/i, "OSGARD 4.0"],
  [/\b(?:grok|xai)\b/i, "OSGARD 3.3"],
]

/** Keeps provider identifiers internal while presenting only OSGARD model names. */
export function displayAiModelName(provider: string): string {
  for (const [pattern, label] of MODEL_LABELS) {
    if (pattern.test(provider)) return label
  }
  return provider
}

