import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Submission } from '../../server/schema'
import { useSession } from '../session'
import { post } from '../api'
import { Preview } from './Preview'
import { motion, AnimatePresence } from 'motion/react'

export function Gallery({ items, onUpdate }: { items: Submission[]; onUpdate?: () => void }) {
  const [active, setActive] = useState<string | null>(null)
  return <motion.div layout className="gallery"><AnimatePresence initial={false} mode="popLayout">{items.map(item => <GalleryItem key={item.id} item={item} active={active === item.id} onActivate={() => setActive(item.id)} onStop={() => setActive(null)} onUpdate={onUpdate}/>)}</AnimatePresence></motion.div>
}
function GalleryItem({ item, active, onActivate, onStop, onUpdate }: { item: Submission; active: boolean; onActivate: () => void; onStop: () => void; onUpdate?: () => void }) {
  const { user } = useSession()
  const location = useLocation()
  const [saved, setSaved] = useState(item.saved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try { await post(`/submissions/${item.id}/save`, { saved: !saved }); setSaved(!saved); onUpdate?.() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <motion.article layout initial={false} exit={{ opacity: 0 }} className="gallery-item">
    <Preview item={item} active={active} onActivate={onActivate} onStop={onStop}/>
    <div className="item-info"><div><Link className="item-title" to={`/work/${item.slug}`}>{item.title}<svg className="title-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4"/></svg></Link><Link className="creator-credit" to={`/creators/${item.creator.username}`}>by {item.creator.name}</Link></div><div className="item-actions"><span className="license-label">{item.license}</span>{user ? <button className={`save-button ${saved ? 'saved' : ''}`} disabled={busy} aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${item.title}`} onClick={save}>{saved ? 'Saved' : 'Save'}</button> : <Link className="save-button" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Save</Link>}</div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </motion.article>
}
