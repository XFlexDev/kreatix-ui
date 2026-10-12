import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Submission } from '../../server/schema'
import { post, useResource } from '../api'
import { useSession } from '../session'
import { Preview } from '../components/Preview'
import { AuthGate, Empty, ErrorNotice, External, Loading, PageHeading } from '../components/UI'

type Report = { id: string; submission_id: string; title: string; slug: string; reason: string }
export function Moderation() { return <AuthGate><Queue/></AuthGate> }
function Queue() {
  const { user } = useSession()
  const allowed = user?.role === 'admin'
  const { data, loading, error, reload } = useResource<{ items: Submission[]; reports: Report[] }>(allowed ? '/moderation' : null)
  const [active, setActive] = useState<string | null>(null)
  const [reason, setReason] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const act = async (path: string, payload: unknown) => { setBusy(true); setFailure(''); try { await post(path, payload); await reload() } catch (e) { setFailure((e as Error).message) } finally { setBusy(false) } }
  if (!allowed) return <Empty title="Moderators only">This account does not have review access.</Empty>
  return <><PageHeading title="Review queue"/>{failure && <ErrorNotice message={failure}/>} {loading ? <Loading/> : error ? <ErrorNotice message={error} retry={reload}/> : <>{data?.items.map(item => <section key={item.id} className="review-item"><div className="review-heading"><div><h2>{item.title}</h2><Link to={`/creators/${item.creator.username}`}>@{item.creator.username}</Link></div><span>{item.license} · {item.framework}</span><External href={item.sourceUrl}>Check source &amp; license</External>{item.demoUrl && <External href={item.demoUrl}>Check demo</External>}</div><p>{item.description}</p><p>{item.attribution}</p><Preview item={item} active={active === item.id} onActivate={() => setActive(item.id)} onStop={() => setActive(null)}/><label className="checkbox"><input type="checkbox" checked={!!checked[item.id]} onChange={e => setChecked(v => ({ ...v, [item.id]: e.target.checked }))}/><span>I checked the original license, attribution, and full free-only policy.</span></label><label>Reason for requested changes<textarea rows={2} minLength={10} maxLength={1500} value={reason[item.id] || ''} onChange={e => setReason(v => ({ ...v, [item.id]: e.target.value }))}/></label><div className="publish-actions"><button className="button primary" disabled={busy || !checked[item.id]} onClick={() => void act(`/moderation/${item.id}`, { action: 'approve' })}>Approve</button><button className="button secondary" disabled={busy || (reason[item.id] || '').trim().length < 10} onClick={() => void act(`/moderation/${item.id}`, { action: 'reject', reason: reason[item.id] })}>Request changes</button></div></section>)}{!data?.items.length && <Empty title="Queue clear">No work waiting for review.</Empty>}<h2 className="reports-heading">Reports</h2>{data?.reports.map(report => <section className="report-item" key={report.id}><h3><Link to={`/work/${report.slug}`}>{report.title}</Link></h3><p>{report.reason}</p><label>Removal reason<textarea rows={2} maxLength={1500} value={reason[report.id] || ''} onChange={e => setReason(v => ({ ...v, [report.id]: e.target.value }))}/></label><div className="publish-actions"><button className="button secondary" disabled={busy} onClick={() => void act(`/moderation/reports/${report.id}/resolve`, {})}>Resolve report</button><button className="button secondary" disabled={busy || (reason[report.id] || '').trim().length < 10} onClick={() => void act(`/moderation/${report.submission_id}`, { action: 'remove', reason: reason[report.id] })}>Remove work</button></div></section>)}{!data?.reports.length && <p className="muted">No open reports.</p>}</>}</>
}
