import Link from "next/link"
import { ArrowLeft, CheckCircle2, ExternalLink, Network, ShieldCheck } from "lucide-react"
import { notFound } from "next/navigation"
import { getBlueprint, getBlueprintGraph, listBlueprintComments, listBlueprintEvidence } from "@/lib/blueprint-store"
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
  const comments = listBlueprintComments(blueprint.id).filter((item) => item.revision === blueprint.revision)
  const graph = getBlueprintGraph(blueprint.id)
  const graphNodes = graph?.nodes.filter((node) => node.revision === blueprint.revision || node.kind === "idea") || []

  return (
    <main className="ds-body ds-replay-page">
      <section className="ds-replay-shell ds-hull ds-glass" aria-labelledby="replay-title">
        <header className="ds-replay-header"><span className="ds-utility">OSGARD / MISSION REPLAY</span><span className="ds-replay-live"><i aria-hidden="true" /> VERIFIED BLUEPRINT</span></header>
        <div className="ds-replay-hero"><div><h1 id="replay-title" className="ds-display">{blueprint.app}</h1><p>A product direction assembled in AI Cofounder and preserved as an inspectable delivery trail.</p></div><div className="ds-replay-score"><b>{blueprint.quality.score}</b><span>quality score</span></div></div>
        <div className="ds-replay-meta"><span>{blueprint.productType || "product"}</span><span>{blueprint.preset} DNA</span><span>revision {blueprint.revision}</span></div>
        <section className="ds-replay-section" aria-labelledby="replay-graph"><div className="ds-replay-section__title"><Network size={17} aria-hidden="true" /><h2 id="replay-graph">Product Graph</h2><small>{graphNodes.length} linked records</small></div><div className="ds-replay-components">{graphNodes.map((node) => <span key={node.id}>{node.kind === "contract" ? `Contract v${node.revision}` : node.kind === "evidence" ? `${node.label}: ${node.status}` : node.kind === "generation" ? `Codegen: ${node.status}` : node.kind === "delivery" ? `Delivery: ${node.label}` : "Idea"}</span>)}</div></section>
        <section className="ds-replay-section" aria-labelledby="replay-architecture"><div className="ds-replay-section__title"><ShieldCheck size={17} aria-hidden="true" /><h2 id="replay-architecture">Architecture signal</h2></div><div className="ds-replay-components">{blueprint.components.map((component) => <span key={component}>{component}</span>)}</div></section>
        {blueprint.delivery ? <section className="ds-replay-section" aria-labelledby="replay-target"><div className="ds-replay-section__title"><ExternalLink size={17} aria-hidden="true" /><h2 id="replay-target">Delivery target</h2><small>policy saved before codegen</small></div><div className="ds-replay-components"><span>{blueprint.delivery.provider}</span>{blueprint.delivery.domain ? <span>{blueprint.delivery.domain}</span> : null}{blueprint.delivery.supabaseProjectRef ? <span>Supabase {blueprint.delivery.supabaseProjectRef}</span> : null}{blueprint.delivery.integrationIds?.length ? <span>{blueprint.delivery.integrationIds.length} integrations</span> : null}</div></section> : null}
        <section className="ds-replay-section" aria-labelledby="replay-evidence"><div className="ds-replay-section__title"><CheckCircle2 size={17} aria-hidden="true" /><h2 id="replay-evidence">Evidence ledger</h2><small>{evidence.length} passed checks</small></div>{evidence.length ? <ul className="ds-replay-evidence">{evidence.map((item) => <li key={item.id}><CheckCircle2 size={14} aria-hidden="true" /><span><strong>{item.kind}</strong><small>{item.summary}</small></span></li>)}</ul> : <p className="ds-replay-muted">Evidence is still being captured for this revision.</p>}</section>
        <section className="ds-replay-section" aria-labelledby="replay-comments"><div className="ds-replay-section__title"><ShieldCheck size={17} aria-hidden="true" /><h2 id="replay-comments">Approval room</h2><small>{comments.length} comments</small></div>{comments.length ? <ul className="ds-replay-evidence">{comments.map((comment) => <li key={comment.id}><ShieldCheck size={14} aria-hidden="true" /><span><strong>{comment.author}</strong><small>{comment.body} · {new Date(comment.createdAt).toLocaleString()}</small></span></li>)}</ul> : <p className="ds-replay-muted">No approval comments were recorded for this revision.</p>}</section>
        <section className="ds-replay-section" aria-labelledby="replay-delivery"><div className="ds-replay-section__title"><ExternalLink size={17} aria-hidden="true" /><h2 id="replay-delivery">Delivery outcome</h2><small>{blueprint.generation ? `${blueprint.generation.status} · ${blueprint.generation.progress}%` : "Not started"}</small></div>{blueprint.generation ? <div className="ds-replay-delivery"><strong>{blueprint.generation.status === "completed" ? "Codegen completed" : blueprint.generation.status === "failed" ? "Codegen failed" : "Codegen in progress"}</strong>{blueprint.generation.currentStep ? <span>{blueprint.generation.currentStep}</span> : null}{blueprint.generation.error ? <span role="alert">{blueprint.generation.error}</span> : null}<div className="ds-replay-delivery__links">{blueprint.generation.result?.previewUrl ? <a href={blueprint.generation.result.previewUrl} target="_blank" rel="noreferrer">Preview</a> : null}{blueprint.generation.result?.appUrl ? <a href={blueprint.generation.result.appUrl} target="_blank" rel="noreferrer">Open app</a> : null}{blueprint.generation.result?.repoUrl ? <a href={blueprint.generation.result.repoUrl} target="_blank" rel="noreferrer">Repository</a> : null}</div></div> : <p className="ds-replay-muted">Codegen has not started for this revision.</p>}</section>
        {blueprint.generationHistory?.length ? <section className="ds-replay-section" aria-labelledby="replay-timeline"><div className="ds-replay-section__title"><CheckCircle2 size={17} aria-hidden="true" /><h2 id="replay-timeline">Generation timeline</h2><small>{blueprint.generationHistory.length} recorded states</small></div><ol className="ds-replay-evidence">{blueprint.generationHistory.map((state, index) => <li key={`${state.updatedAt}-${index}`}><CheckCircle2 size={14} aria-hidden="true" /><span><strong>{state.status} · {state.progress}%</strong><small>{state.currentStep || state.error || new Date(state.updatedAt).toLocaleString()}</small></span></li>)}</ol></section> : null}
        {blueprint.generation?.status === "completed" ? <section className="ds-replay-section" aria-labelledby="replay-provenance"><div className="ds-replay-section__title"><ShieldCheck size={17} aria-hidden="true" /><h2 id="replay-provenance">Artifact provenance</h2><small>{blueprint.generation.artifactSeal ? "signed" : "unavailable"}</small></div>{blueprint.generation.artifactSeal ? <div className="ds-replay-components"><span>HMAC-SHA256</span><span>digest {blueprint.generation.artifactSeal.digest.slice(0, 16)}…</span><span>signed {new Date(blueprint.generation.artifactSeal.signedAt).toLocaleString()}</span></div> : <p className="ds-replay-muted">This delivery was completed before the production signing key was available.</p>}</section> : null}
        <div className="ds-replay-actions"><Link className="ds-dialog-secondary ds-focus" href="/cofounder"><ArrowLeft size={15} aria-hidden="true" /> Build your own</Link><ReplayShareButton blueprintId={blueprint.id} revision={blueprint.revision} appName={blueprint.app} /><a className="ds-dialog-primary ds-focus" href={`https://osgardnewworld.com/cofounder/replay/${blueprint.id}?revision=${blueprint.revision}`}><ExternalLink size={15} aria-hidden="true" /> Open replay link</a></div>
      </section>
    </main>
  )
}
