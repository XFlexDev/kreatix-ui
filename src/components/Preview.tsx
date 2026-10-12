import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Submission } from '../../server/schema'
import { External, ErrorNotice } from './UI'
import { AnimatePresence, motion } from 'motion/react'
import { morph } from './Morph'

export function Sandbox({ html, title, src, onLoad }: { html?: string; title: string; src?: string; onLoad?: () => void }) {
  return <iframe className="sandbox" sandbox="allow-scripts" referrerPolicy="no-referrer" title={`${title} interactive preview`} src={src} srcDoc={src ? undefined : html} onLoad={onLoad}/>
}
export function Preview({ item, active, onActivate, onStop, large = false }: { item: Submission; active: boolean; onActivate: () => void; onStop: () => void; large?: boolean }) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    const id = ++generation.current
    if (!active || item.previewMode === 'link') return
    setReady(false); setSrc(''); setLoading(true); setError('')
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
  const name = item.id.replace(/[^a-zA-Z0-9-]/g, '')
  return <motion.div layout="position" className={`preview-stage stage-${face[2]} ${large ? 'large' : ''}`}>
    <div className="stage-surface" style={{ viewTransitionName: `work-${name}` }} aria-hidden="true"/>
    <div className="stage-top"><span className="framework-label">{item.framework}</span>{item.previewMode !== 'link' && <motion.button layout className="preview-toggle" aria-pressed={active} onClick={() => morph(active ? onStop : onActivate)}>{active ? ready ? 'Stop preview' : 'Cancel' : 'Try it'}{active && !ready && !error ? <span className="preview-loading-mark" aria-hidden="true"/> : <svg viewBox="0 0 16 16" aria-hidden="true">{active ? <path d="M5 5h6v6H5z"/> : <path d="m6 4 5 4-5 4z"/>}</svg>}</motion.button>}</div>
    <div className={`stage-art ${active && ready ? 'preview-hidden' : ''}`} aria-hidden="true" style={{ '--preview-copy-name': `work-copy-${name}` } as React.CSSProperties}><span>{face[0]}</span>{face[1] && <span className="stage-second">{face[1]}{face[2] === 'typewriter' && <span className="type-cursor"/>}</span>}</div>
    <AnimatePresence initial={false} mode="wait">
      {active && item.previewMode !== 'link' && (error ? <motion.div key="error" className="preview-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><ErrorNotice message={error}/></motion.div> : src ? <motion.div key={src} className={`preview-live ${ready ? 'preview-ready' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} exit={{ opacity: 0 }} transition={{ duration: .16, ease: [.16, 1, .3, 1] }}><Sandbox src={src} title={item.title} onLoad={() => setReady(true)}/></motion.div> : null)}
    </AnimatePresence>
    {active && (loading || (src && !ready && !error)) && <span className="sr-only" role="status">Preparing preview</span>}
    {!active && item.previewMode === 'link' && <div className="stage-bottom"><External href={item.demoUrl}>Explore the library</External></div>}
    {!active && item.previewMode !== 'link' && <button className="stage-activate" onClick={() => morph(onActivate)} aria-label={`Try ${item.title} interactive preview`}/>}
  </motion.div>
}
type ReactNodeDescription = [string, string, string]
