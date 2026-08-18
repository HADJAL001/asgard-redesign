import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import test from "node:test"
import { normalizeRefinementKind } from "../lib/refinement-kinds"
import { parseRefinementPlan, rankRefinementContext } from "../services/app-refiner"

const files = [
  { path: "app/page.tsx", content: "export default function Page() { return <main /> }" },
  { path: "components/header.tsx", content: "export function Header() { return <header /> }" },
  { path: "package.json", content: "{}" },
]

test("refinement kind falls back to custom for untrusted input", () => {
  assert.equal(normalizeRefinementKind("feature"), "feature")
  assert.equal(normalizeRefinementKind("rewrite-everything"), "custom")
  assert.equal(normalizeRefinementKind({ kind: "design" }), "custom")
})

test("refinement plan keeps targeted source changes and normalizes actions", () => {
  const plan = parseRefinementPlan(
    {
      summary: "Add search",
      changes: [
        { path: "app/page.tsx", action: "create", purpose: "Connect search UI" },
        { path: "components/search.tsx", action: "modify", purpose: "Add search component" },
      ],
      acceptanceCriteria: ["Search filters visible records"],
    },
    files,
  )

  assert.deepEqual(plan?.changes, [
    { path: "app/page.tsx", action: "modify", purpose: "Connect search UI" },
    { path: "components/search.tsx", action: "create", purpose: "Add search component" },
  ])
})

test("refinement plan rejects traversal, immutable scaffold files, and empty plans", () => {
  const plan = parseRefinementPlan(
    {
      changes: [
        { path: "../secrets.txt", action: "create", purpose: "Read secrets" },
        { path: "package.json", action: "modify", purpose: "Add an unapproved dependency" },
        { path: "next.config.mjs", action: "delete", purpose: "Disable safeguards" },
      ],
    },
    files,
  )

  assert.equal(plan, null)
})

test("refinement plan deduplicates paths and refuses deletion of missing files", () => {
  const plan = parseRefinementPlan(
    {
      changes: [
        { path: "components/header.tsx", action: "modify", purpose: "First change wins" },
        { path: "components/header.tsx", action: "delete", purpose: "Duplicate must not override" },
        { path: "components/missing.tsx", action: "delete", purpose: "Cannot delete absent file" },
      ],
    },
    files,
  )

  assert.deepEqual(plan?.changes, [
    { path: "components/header.tsx", action: "modify", purpose: "First change wins" },
  ])
})

test("refinement context prioritizes direct consumers of the target component", () => {
  const context = rankRefinementContext(
    [
      { path: "app/api/records/route.ts", content: "export async function GET() {}" },
      { path: "components/OverviewDashboard.tsx", content: "import RecordsTable from '@/components/RecordsTable'" },
      { path: "components/RecordsTable.tsx", content: "export default function RecordsTable() {}" },
      { path: "components/AppShell.tsx", content: "<RecordsTable entity={entity} data={data} loading={loading} />" },
      { path: "hooks/useAppData.ts", content: "export function useAppData() {}" },
    ],
    "components/RecordsTable.tsx",
    "export function RecordsTable() {}",
    "Use the existing useAppData hook",
  )

  assert.deepEqual(context.map((file) => file.path), [
    "components/OverviewDashboard.tsx",
    "components/AppShell.tsx",
    "hooks/useAppData.ts",
    "app/api/records/route.ts",
    "components/RecordsTable.tsx",
  ])
})
