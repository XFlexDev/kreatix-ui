import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { frameworks, categories } from '../../server/constants'
import type { Submission } from '../../server/schema'
import { useResource } from '../api'
import { Gallery } from '../components/Gallery'
import { AuthGate, Empty, ErrorNotice, Loading, PageHeading } from '../components/UI'
import { useSession } from '../session'
import { motion } from 'motion/react'
import { morph } from '../components/Morph'

export function Discover({ kind, saved = false }: { kind?: 'library'; saved?: boolean }) {
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const search = useRef<HTMLInputElement>(null)
  const [term, setTerm] = useState(params.get('q') || '')
  useEffect(() => { setTerm(params.get('q') || '') }, [params])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); search.current?.focus() } }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  }, [])
  const query = new URLSearchParams(params)
  if (kind) query.set('kind', kind)
  if (saved) query.set('feed', 'saved')
  const { data, error, loading, reload } = useResource<{ items: Submission[]; total: number; page: number }>(saved && !user ? null : `/submissions?${query}`, true)
  const update = (key: string, value: string) => { const p = new URLSearchParams(params); if (value) p.set(key, value); else p.delete(key); p.delete('page'); morph(() => setParams(p)) }
  const body = <>
    {saved ? <PageHeading title="Saved"/> : kind ? <PageHeading title="Libraries"/> : <h1 className="sr-only">Discover components and libraries</h1>}
    <div className="discovery-controls">
      {!saved && <nav className="feed-tabs" aria-label="Discovery feed">{[['', 'Explore'], ['new', 'Latest'], ['newcreators', 'New makers'], ['following', 'Following']].map(([value, label]) => <button key={value} className={(params.get('feed') || '') === value ? 'active' : ''} aria-pressed={(params.get('feed') || '') === value} onClick={() => update('feed', value)}>{(params.get('feed') || '') === value && <motion.span layoutId="feed-selector" className="morph-tab"/>}<span className="tab-label">{label}</span></button>)}</nav>}
      <form className="search" role="search" onSubmit={e => { e.preventDefault(); update('q', term.trim()) }}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input ref={search} type="search" aria-label="Search components, libraries, and makers" placeholder="Find your next interaction…" value={term} onChange={e => setTerm(e.target.value)}/><button type="submit" aria-label="Search">Search</button><kbd>/</kbd></form>
    </div>
    <div className="filter-row"><div className="filter-selects"><label><span>Framework</span><select value={params.get('framework') || ''} onChange={e => update('framework', e.target.value)}><option value="">All frameworks</option>{frameworks.map(f => <option key={f}>{f}</option>)}</select></label><label><span>Category</span><select value={params.get('category') || ''} onChange={e => update('category', e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>{data && <span className="result-count">{data.total} {kind ? 'libraries' : saved ? 'saved' : 'works'}{params.get('q') ? ` for “${params.get('q')}”` : ''}</span>}{(params.get('q') || params.get('category') || params.get('framework')) && <button className="clear-filter" onClick={() => setParams(params.get('feed') ? { feed: params.get('feed')! } : {})}>Clear filters</button>}</div>
    {loading && !data ? <Loading/> : error ? <ErrorNotice message={error} retry={() => void reload()}/> : data?.items.length ? <div aria-busy={loading}><Gallery items={data.items} onUpdate={saved ? reload : undefined}/></div> : <Empty title={saved ? 'No saved work' : params.get('feed') === 'following' ? 'Follow a creator' : 'No matching work'} action={<Link className="button secondary" to={params.get('feed') === 'following' ? '/creators' : saved ? '/' : '/publish'}>{params.get('feed') === 'following' ? 'Find creators' : saved ? 'Explore work' : 'Publish'}</Link>}>{saved ? 'Saved components and libraries appear here.' : params.get('feed') === 'following' ? 'Their published work will appear here.' : 'Try another filter or publish your own.'}</Empty>}
    {data && data.total > 12 && <nav className="pagination" aria-label="Results pages"><button disabled={data.page <= 1} onClick={() => { const p = new URLSearchParams(params); p.set('page', String(data.page - 1)); setParams(p) }}>Previous</button><span>Page {data.page} of {Math.ceil(data.total / 12)}</span><button disabled={data.page * 12 >= data.total} onClick={() => { const p = new URLSearchParams(params); p.set('page', String(data.page + 1)); setParams(p) }}>Next</button></nav>}
  </>
  return saved ? <AuthGate>{body}</AuthGate> : body
}
