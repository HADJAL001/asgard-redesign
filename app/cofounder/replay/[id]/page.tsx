import Link from "next/link"
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react"
import { notFound } from "next/navigation"
import { getBlueprint, listBlueprintEvidence } from "@/lib/blueprint-store"
import { ReplayShareButton } from "@/components/cofounder/ReplayShareButton"

type ReplayPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string }> }

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: ReplayPageProps) {
  const { id } = await params
  const blueprint = getBlueprint(id)
  const title = blueprint ? `${blueprint.app} / OSGARD Mission Replay` : "OSGARD Mission Replay"
  return { title, description: "A verified product blueprint replay from OSGARD AI Cofounder.", openGraph: { title, description: "A verified product blueprint replay from OSGARD AI Cofounder.", type: "website", images: [`/cofounder/replay/${id}/opengraph-image`] } }
}

export default async function ReplayPage({ params, searchParams }: ReplayPageProps) {
  const { id } = await params
  const query = await searchParams
  const revision = query.revision ? Number(query.revision) : undefined
  const blueprint = getBlueprint(id, revision)
  if (!blueprint) notFound()
  const evidence = listBlueprintEvidence(blueprint.id).filter((item) => item.revision === blueprint.revision && item.status === "passed")

  return (
    <main className="ds-body ds-replay-page">
      <section className="ds-replay-shell ds-hull ds-glass" aria-labelledby="replay-title">
        <header className="ds-replay-header"><span className="ds-utility">OSGARD / MISSION REPLAY</span><span className="ds-replay-live"><i aria-hidden="true" /> VERIFIED BLUEPRINT</span></header>
        <div className="ds-replay-hero"><div><h1 id="replay-title" className="ds-display">{blueprint.app}</h1><p>A product direction assembled in AI Cofounder and preserved as an inspectable delivery trail.</p></div><div className="ds-replay-score"><b>{blueprint.quality.score}</b><span>quality score</span></div></div>
        <div className="ds-replay-meta"><span>{blueprint.productType || "product"}</span><span>{blueprint.preset} DNA</span><span>revision {blueprint.revision}</span></div>
        <section className="ds-replay-section" aria-labelledby="replay-architecture"><div className="ds-replay-section__title"><ShieldCheck size={17} aria-hidden="true" /><h2 id="replay-architecture">Architecture signal</h2></div><div className="ds-replay-components">{blueprint.components.map((component) => <span key={component}>{component}</span>)}</div></section>
        <section className="ds-replay-section" aria-labelledby="replay-evidence"><div className="ds-replay-section__title"><CheckCircle2 size={17} aria-hidden="true" /><h2 id="replay-evidence">Evidence ledger</h2><small>{evidence.length} passed checks</small></div>{evidence.length ? <ul className="ds-replay-evidence">{evidence.map((item) => <li key={item.id}><CheckCircle2 size={14} aria-hidden="true" /><span><strong>{item.kind}</strong><small>{item.summary}</small></span></li>)}</ul> : <p className="ds-replay-muted">Evidence is still being captured for this revision.</p>}</section>
        <div className="ds-replay-actions"><Link className="ds-dialog-secondary ds-focus" href="/cofounder"><ArrowLeft size={15} aria-hidden="true" /> Build your own</Link><ReplayShareButton blueprintId={blueprint.id} revision={blueprint.revision} appName={blueprint.app} /><a className="ds-dialog-primary ds-focus" href={`https://osgardnewworld.com/cofounder/replay/${blueprint.id}?revision=${blueprint.revision}`}><ExternalLink size={15} aria-hidden="true" /> Open replay link</a></div>
      </section>
    </main>
  )
}
