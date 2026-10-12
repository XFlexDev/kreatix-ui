import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Submission } from '../../server/schema'
import { External, ErrorNotice, Loading } from './UI'
import { motion } from 'motion/react'
import { morph } from './Morph'

export function Sandbox({ html, title, src }: { html?: string; title: string; src?: string }) {
  return <iframe className="sandbox" sandbox="allow-scripts" referrerPolicy="no-referrer" title={`${title} interactive preview`} src={src} srcDoc={src ? undefined : html}/>
}
export function Preview({ item, active, onActivate, onStop, large = false }: { item: Submission; active: boolean; onActivate: () => void; onStop: () => void; large?: boolean }) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    const id = ++generation.current
    if (!active || item.previewMode === 'link') return
    setLoading(true); setError('')
    api<{ src: string }>(`/submissions/${item.id}/preview`).then(r => { if (id === generation.current) setSrc(r.src) }).catch(e => { if (id === generation.current) setError(e.message) }).finally(() => { if (id === generation.current) setLoading(false) })
    return () => { generation.current++ }
  }, [active, item.id, item.updatedAt, item.previewMode])
  const faces: Record<string, ReactNodeDescription> = {
    'fancy-letter-swap-forward-anim': ['Make it', 'yours.', 'swap'],
    'fancy-scramble-hover': ['Something', 'unexpected.', 'scramble'],
    'fancy-underline-comes-in-goes-out': ['A little', 'emphasis.', 'underline'],
    'fancy-typewriter': ['Hello,', 'stranger.', 'typewriter'],
    'fancy-library': ['Make the', 'web fancy.', 'library'],
  }
  const face = faces[item.id] ?? [item.title, '', 'custom']
  return <motion.div layout style={{ viewTransitionName: `work-${item.id.replace(/[^a-zA-Z0-9-]/g, '')}` }} className={`preview-stage stage-${face[2]} ${large ? 'large' : ''} ${active ? 'is-live' : ''}`}>
    <div className="stage-top"><span className="framework-label">{item.framework}</span>{item.previewMode !== 'link' && <motion.button layout className="preview-toggle" aria-pressed={active} onClick={() => morph(active ? onStop : onActivate)}>{active ? 'Stop preview' : 'Try it'}<svg viewBox="0 0 16 16" aria-hidden="true">{active ? <path d="M5 5h6v6H5z"/> : <path d="m6 4 5 4-5 4z"/>}</svg></motion.button>}</div>
    {active && item.previewMode !== 'link' ? <div className="preview-live">{loading ? <Loading label="Starting preview…"/> : error ? <ErrorNotice message={error}/> : src && <Sandbox src={src} title={item.title}/>}</div> : <div className="stage-art" aria-hidden="true"><span>{face[0]}</span>{face[1] && <span className="stage-second">{face[1]}{face[2] === 'typewriter' && <span className="type-cursor"/>}</span>}</div>}
    {!active && item.previewMode === 'link' && <div className="stage-bottom"><External href={item.demoUrl}>Explore the library</External></div>}
    {!active && item.previewMode !== 'link' && <button className="stage-activate" onClick={() => morph(onActivate)} aria-label={`Try ${item.title} interactive preview`}/>}
  </motion.div>
}
type ReactNodeDescription = [string, string, string]
