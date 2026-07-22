import type { FrontendArtifact as UpstreamFrontendArtifact } from "../../../agents/types"
import type { FrontendArtifact } from "../types"

/* ================================================================
   OSGARD · Адаптер FrontendArtifact (Клод #2 → Клод #3)
   ----------------------------------------------------------------
   У FrontendAgent (backend/src/agents/types.ts) FrontendArtifact —
   { files, componentsGenerated, pagesGenerated, notes }, без поля
   "type". У агентов этого модуля — { type: "frontend", files }.
   Поля componentsGenerated/pagesGenerated/notes здесь не нужны:
   TesterAgent сам определяет страницы фронтенда по путям файлов
   (см. isFrontendPage в tester-agent.ts), готовый список не требуется.
   ================================================================ */

export function adaptFrontendArtifact(upstream: UpstreamFrontendArtifact): FrontendArtifact {
  return { type: "frontend", files: upstream.files }
}
