import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Creator, Submission } from '../../server/schema'
import { post, useResource } from '../api'
import { useSession } from '../session'
import { Gallery } from '../components/Gallery'
import { Empty, ErrorNotice, External, Loading, PageHeading } from '../components/UI'

export function Creators() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const { data, loading, error, reload } = useResource<{ creators: (Creator & { works: number })[] }>(`/creators?q=${encodeURIComponent(search)}`)
  return <><PageHeading title="Creators"/><form className="search creator-search" onSubmit={e => { e.preventDefault(); setSearch(q) }}><input aria-label="Search creators" placeholder="Find a maker…" value={q} onChange={e => setQ(e.target.value)}/><button>Search</button></form>{loading ? <Loading/> : error ? <ErrorNotice message={error} retry={reload}/> : data?.creators.length ? <div className="creator-list">{data.creators.map(c => <Link to={`/creators/${c.username}`} className="creator-row" key={c.id}><span className="avatar" aria-hidden="true">{c.name.slice(0, 1)}</span><div><h2>{c.name}</h2><p>@{c.username}{c.curated && ' · Community-listed maker'}</p></div><span>{c.works} {c.works === 1 ? 'work' : 'works'}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14m-5-5 5 5-5 5"/></svg></Link>)}</div> : <Empty title="No makers found.">Try another name.</Empty>}</>
}
export function CreatorProfile() {
  const { username } = useParams()
  const { user } = useSession()
  const { data, loading, error, reload } = useResource<{ creator: Creator; items: Submission[]; followers: number; following: boolean }>(`/creators/${username}`)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const follow = async () => {
    if (!data) return
    setBusy(true); setMessage('')
    try { await post(`/creators/${data.creator.id}/follow`, { following: !data.following }); await reload() } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  if (loading) return <Loading/>
  if (error) return <ErrorNotice message={error} retry={reload}/>
  if (!data) return null
  const c = data.creator
  return <><section className="profile-header"><div className="profile-identity"><span className="avatar large" aria-hidden="true">{c.name.slice(0, 1)}</span><div><h1>{c.name}</h1><span>@{c.username}</span></div></div><div className="profile-bio"><p>{c.bio || 'Let the work speak.'}</p>{c.website && <External href={c.website}>Visit website</External>}<div className="profile-actions">{user?.id === c.id ? <Link className="button secondary" to="/settings">Edit profile</Link> : user ? <button className="button secondary" disabled={busy} aria-pressed={data.following} onClick={follow}>{data.following ? 'Following' : 'Follow maker'}</button> : <Link className="button secondary" to={`/login?next=/creators/${c.username}`}>Follow maker</Link>}<span>{data.followers} {data.followers === 1 ? 'follower' : 'followers'}</span></div></div></section>{message && <ErrorNotice message={message}/>}<div className="section-heading"><h2>Published work</h2><span>{data.items.length}</span></div>{data.items.length ? <Gallery items={data.items}/> : <Empty title="The first one is on its way.">Published work will appear here after review.</Empty>}</>
}
