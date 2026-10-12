import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Submission, Comment } from '../../server/schema'
import { api, post, useResource } from '../api'
import { useSession } from '../session'
import { Preview } from '../components/Preview'
import { DateLabel, ErrorNotice, External, Loading } from '../components/UI'
import { motion } from 'motion/react'
import { morph } from '../components/Morph'

export function Detail() {
  const { slug } = useParams()
  const { user } = useSession()
  const { data, error, loading, reload } = useResource<{ item: Submission; comments: Comment[] }>(`/submissions/${slug}`)
  const [active, setActive] = useState(false)
  const [tab, setTab] = useState<'about' | 'source' | 'discussion'>('about')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [comment, setComment] = useState('')
  const [report, setReport] = useState(false)
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)
  const action = async (run: () => Promise<unknown>, success?: string) => { setBusy(true); setMessage(''); try { await run(); if (success) setMessage(success); await reload() } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) } }
  if (loading && !data) return <Loading/>
  if (error) return <ErrorNotice message={error} retry={reload}/>
  if (!data) return null
  const s = data.item
  const copy = async () => { try { await navigator.clipboard.writeText(s.code); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { setMessage('Copy could not run. Select the code and copy it manually.') } }
  return <>
    <Link className="back-link" to="/">Back to discover</Link>
    <div className="work-header"><div><h1>{s.title}</h1><Link className="creator-credit" to={`/creators/${s.creator.username}`}>by {s.creator.name}</Link></div><div className="work-actions"><External className="button primary" href={s.sourceUrl}>Get the source</External>{user ? <button className="button secondary" disabled={busy} aria-pressed={s.saved} onClick={() => action(() => post(`/submissions/${s.id}/save`, { saved: !s.saved }))}>{s.saved ? 'Saved to collection' : 'Save to collection'}</button> : <Link className="button secondary" to={`/login?next=/work/${s.slug}`}>Save to collection</Link>}{user?.id === s.ownerId && <Link className="button secondary" to={`/publish/${s.id}`}>Edit work</Link>}</div></div>
    {s.status !== 'approved' && <div className="status-notice">{s.status === 'pending' ? 'In review. This work is not public yet.' : s.status === 'rejected' ? `Changes requested: ${s.reason}` : 'Private draft. Submit it when it is ready.'}</div>}
    <Preview item={s} active={active} onActivate={() => setActive(true)} onStop={() => setActive(false)} large/>
    <div className="detail-layout"><section className="detail-main"><nav className="detail-tabs" aria-label="Work information">{(['about', 'source', 'discussion'] as const).map(t => <button key={t} aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => morph(() => setTab(t))}>{tab === t && <motion.span layoutId="detail-selector" className="morph-tab"/>}<span className="tab-label">{t === 'about' ? 'About' : t === 'source' ? 'Source' : `Discussion (${data.comments.length})`}</span></button>)}</nav>
      {tab === 'about' && <div className="about-work"><h2>The interaction</h2><p className="work-description">{s.description}</p>{s.install && <><h3>Install</h3><pre className="install-code"><code>{s.install}</code></pre></>}{s.demoUrl && <External href={s.demoUrl}>Original demo &amp; documentation</External>}<h3>Attribution</h3><p>{s.attribution || `Created by ${s.creator.name}. Licensed under ${s.license}.`}</p>{s.curated && <p className="muted">Community-listed work. The maker has not claimed or verified this listing.</p>}</div>}
      {tab === 'source' && <div className="source-panel">{s.code ? <><div className="code-heading"><h2>{s.previewMode === 'react' ? 'Component.tsx' : 'index.html'}</h2><button className="button secondary" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button></div><p className="muted">This is the preview example. Get the original source for the full project and license.</p><pre tabIndex={0}><code>{s.code}</code></pre>{s.css && <details><summary>Preview CSS</summary><pre tabIndex={0}><code>{s.css}</code></pre></details>}{s.js && <details><summary>Preview JavaScript</summary><pre tabIndex={0}><code>{s.js}</code></pre></details>}</> : <p>This library keeps its source in its <External href={s.sourceUrl}>public repository</External>.</p>}</div>}
      {tab === 'discussion' && <div className="discussion">{user && s.status === 'approved' ? <form onSubmit={e => { e.preventDefault(); void action(async () => { await post(`/submissions/${s.id}/comments`, { body: comment }); setComment('') }) }}><label htmlFor="comment">Your comment</label><textarea id="comment" value={comment} onChange={e => setComment(e.target.value)} minLength={2} maxLength={2000} required rows={4}/><button className="button primary" disabled={busy}>Post comment</button></form> : <p><Link to={`/login?next=/work/${s.slug}`}>Sign in</Link> to comment.</p>}{data.comments.map(c => <motion.article layout className="comment" key={c.id}><div><Link to={`/creators/${c.author.username}`}>{c.author.name}</Link><DateLabel value={c.createdAt}/>{(user?.id === c.author.id || user?.role === 'admin') && <button disabled={busy} onClick={() => action(() => api(`/comments/${c.id}`, { method: 'DELETE', body: '{}' }))}>Delete</button>}</div><p>{c.body}</p></motion.article>)}{!data.comments.length && <p className="muted">No comments yet.</p>}</div>}
    </section><aside className="work-meta"><dl><div><dt>Framework</dt><dd>{s.framework}</dd></div><div><dt>License</dt><dd>{s.license}</dd></div><div><dt>Category</dt><dd>{s.category}</dd></div><div><dt>Updated</dt><dd><DateLabel value={s.updatedAt}/></dd></div></dl><div className="tags">{s.tags.map(t => <Link to={`/?q=${encodeURIComponent(t)}`} key={t}>{t}</Link>)}</div><button className="report-button" onClick={() => setReport(!report)}>{report ? 'Cancel report' : 'Report this work'}</button>{report && (user ? <form className="report-form" onSubmit={e => { e.preventDefault(); void action(async () => { await post(`/submissions/${s.id}/report`, { reason }); setReason(''); setReport(false) }, 'Report sent to moderators.') }}><label htmlFor="report-reason">What needs a review?</label><textarea id="report-reason" rows={4} required minLength={10} maxLength={1500} value={reason} onChange={e => setReason(e.target.value)}/><button className="button secondary" disabled={busy}>Send report</button></form> : <Link to={`/login?next=/work/${s.slug}`}>Sign in to report</Link>)}</aside></div>
    {message && <p className="status-notice" role="status">{message}</p>}
  </>
}
