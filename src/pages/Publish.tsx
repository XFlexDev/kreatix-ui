import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { frameworks, categories, licenses } from '../../server/constants'
import type { Submission, SubmissionInput } from '../../server/schema'
import { api, post } from '../api'
import { AuthGate, ErrorNotice, External, Loading, PageHeading } from '../components/UI'
import { Sandbox } from '../components/Preview'
import { morph } from '../components/Morph'
import { useSession } from '../session'

const starting: SubmissionInput = { title: '', description: '', kind: 'component', framework: 'React', category: 'Buttons', license: 'MIT', sourceUrl: '', demoUrl: '', install: '', tags: [], previewMode: 'react', code: 'function App() {\n  const [count, setCount] = React.useState(0)\n  return <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>\n}\nimport React from "react"', css: 'button { background: #f2f2f0; color: #101010; border: 0; border-radius: 8px; padding: 18px 28px; transition: border-radius .25s; }\nbutton:hover { border-radius: 18px; }', js: '', freeOnly: true, attribution: '' }
const htmlExample = '<button id="example">Click me</button>'
export function Publish() { const { id } = useParams(); return <AuthGate><Editor key={id || 'new'}/></AuthGate> }
function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const [draft, setDraft] = useState<SubmissionInput>(starting)
  const [item, setItem] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [busy, setBusy] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [src, setSrc] = useState('')
  const [editorTab, setEditorTab] = useState<'code' | 'css' | 'js'>('code')
  const [confirmed, setConfirmed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tagString, setTagString] = useState('')
  const generation = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const storageKey = `kreatix-ui-draft:${user!.id}:${id || 'new'}`
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        if (id) {
          const { item } = await api<{ item: Submission }>(`/submissions/${id}`)
          if (!live) return
          const { title, description, kind, framework, category, license, sourceUrl, demoUrl, install, tags, previewMode, code, css, js, freeOnly, attribution } = item
          setItem(item); setDraft({ title, description, kind, framework, category, license, sourceUrl, demoUrl, install, tags, previewMode, code, css, js, freeOnly, attribution }); setTagString(tags.join(', ')); setConfirmed(true)
        }
        const local = sessionStorage.getItem(storageKey)
        if (local && live) {
          const recovered = JSON.parse(local) as { draft: SubmissionInput; confirmed: boolean; tags: string }
          setDraft(recovered.draft); setConfirmed(recovered.confirmed); setTagString(recovered.tags); setDirty(true)
        }
      } catch (e) { if (live) setError((e as Error).message) }
      finally { if (live) setLoading(false) }
    }
    void load(); return () => { live = false }
  }, [id, storageKey])
  useEffect(() => {
    if (!dirty) return
    try { sessionStorage.setItem(storageKey, JSON.stringify({ draft, confirmed, tags: tagString })) } catch { /* Server drafts still work if browser storage is full. */ }
  }, [draft, dirty, confirmed, storageKey, tagString])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const field = <K extends keyof SubmissionInput>(key: K, value: SubmissionInput[K]) => { setDraft(d => ({ ...d, [key]: value })); setDirty(true) }
  const buildPreview = useCallback(async () => {
    const current = ++generation.current
    if (draft.previewMode === 'link') { setCompiling(false); return }
    setCompiling(true)
    try {
      const result = await post<{ src: string }>('/preview', { previewMode: draft.previewMode, code: draft.code, css: draft.css, js: draft.js })
      if (current === generation.current) { setSrc(result.src); setPreviewError('') }
    } catch (e) { if (current === generation.current) setPreviewError((e as Error).message) }
    finally { if (current === generation.current) setCompiling(false) }
  }, [draft.previewMode, draft.code, draft.css, draft.js])
  useEffect(() => {
    if (loading) return
    generation.current++
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { void buildPreview() }, 1200)
    return () => { clearTimeout(debounce.current); generation.current++ }
  }, [buildPreview, loading])
  const save = async (submit: boolean) => {
    setError(''); setBusy(true)
    try {
      if (!confirmed) throw new Error('Confirm the free and open-source rule before saving.')
      const payload = { ...draft, tags: [...new Set(tagString.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))], freeOnly: true }
      const result = item ? await api<{ item: Submission }>(`/submissions/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) }) : await post<{ item: Submission }>('/submissions', payload)
      setItem(result.item)
      if (submit) await post(`/submissions/${result.item.id}/submit`)
      sessionStorage.removeItem(storageKey); setDirty(false)
      if (submit) morph(() => navigate('/workspace'))
      else if (!id) morph(() => navigate(`/publish/${result.item.id}`, { replace: true }))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const switchMode = (mode: SubmissionInput['previewMode']) => {
    morph(() => { field('previewMode', mode); setSrc(''); setPreviewError(''); setEditorTab('code'); if (mode === 'react') field('framework', 'React'); if (!id && draft.code === starting.code && mode === 'html') { field('framework', 'HTML/CSS'); field('code', htmlExample); field('js', 'document.querySelector("#example").addEventListener("click", event => { event.target.textContent = "It works." })') } })
  }
  if (loading) return <Loading/>
  if (id && !item) return <ErrorNotice message={error || 'Work not found.'} retry={() => window.location.reload()}/>
  return <><PageHeading title={item ? 'Edit work' : 'Publish'} action={<Link className="text-link" to="/workspace">Your work</Link>}/>{item?.reason && <p className="status-notice">{item.reason}</p>}{item?.status === 'approved' && <p className="status-notice">Your current version stays public. Changes go through review.</p>}<div className="publisher">
    <form className="publish-form" onSubmit={e => { e.preventDefault(); void save(true) }}>
      <fieldset><legend>What are you sharing?</legend><div className="type-choice">{(['component', 'library'] as const).map(k => <button type="button" key={k} aria-pressed={draft.kind === k} className={draft.kind === k ? 'active' : ''} onClick={() => morph(() => { field('kind', k); if (k === 'library') field('previewMode', 'link') })}>{k === 'component' ? 'Component' : 'Library'}</button>)}</div></fieldset>
      <label>Title<input value={draft.title} onChange={e => field('title', e.target.value)} minLength={3} maxLength={80} required placeholder="Name your work"/></label>
      <label>Description<textarea value={draft.description} onChange={e => field('description', e.target.value)} minLength={20} maxLength={2000} required rows={4} placeholder="What it does and where it belongs"/></label>
      <div className="form-row"><label>Framework<select value={draft.framework} onChange={e => { field('framework', e.target.value as SubmissionInput['framework']); if (e.target.value !== 'React' && draft.previewMode === 'react') switchMode('link') }}>{frameworks.map(f => <option key={f}>{f}</option>)}</select></label><label>Category<select value={draft.category} onChange={e => field('category', e.target.value as SubmissionInput['category'])}>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
      <label>Public source repository<input type="url" value={draft.sourceUrl} onChange={e => field('sourceUrl', e.target.value)} pattern="https://.*" maxLength={500} required placeholder="https://github.com/you/project"/></label>
      <label>License<select value={draft.license} onChange={e => field('license', e.target.value as SubmissionInput['license'])}>{licenses.map(l => <option key={l}>{l}</option>)}</select></label>
      <fieldset><legend>Preview</legend><div className="type-choice">{(['react', 'html', 'link'] as const).map(m => <button type="button" key={m} aria-pressed={draft.previewMode === m} className={draft.previewMode === m ? 'active' : ''} onClick={() => switchMode(m)}>{m === 'react' ? 'React' : m === 'html' ? 'HTML / CSS / JS' : 'Demo link'}</button>)}</div></fieldset>
      {draft.previewMode !== 'link' && <div><div className="editor-tabs">{(['code', 'css', ...(draft.previewMode === 'html' ? ['js'] : [])] as const).map(t => <button key={t} type="button" aria-pressed={editorTab === t} className={editorTab === t ? 'active' : ''} onClick={() => morph(() => setEditorTab(t as typeof editorTab))}>{t === 'code' ? draft.previewMode === 'react' ? 'Component.tsx' : 'HTML' : t.toUpperCase()}</button>)}</div><textarea className="code-editor" aria-label={editorTab === 'code' ? 'Component code' : `${editorTab.toUpperCase()} code`} spellCheck={false} autoCapitalize="none" maxLength={editorTab === 'code' ? 80_000 : 30_000} value={draft[editorTab]} onChange={e => field(editorTab, e.target.value)}/><label className="file-import">Import a file<input type="file" accept={editorTab === 'code' ? '.tsx,.jsx,.html,.txt' : editorTab === 'css' ? '.css' : '.js'} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > (editorTab === 'code' ? 80_000 : 30_000)) { setError('This file is too large. Maximum code size is 80 KB; CSS and JavaScript are 30 KB each.'); return } field(editorTab, await file.text()); e.target.value = '' }}/></label></div>}
      <label>{draft.previewMode === 'link' ? 'Demo URL' : 'Documentation or demo URL (optional)'}<input type="url" value={draft.demoUrl} onChange={e => field('demoUrl', e.target.value)} required={draft.previewMode === 'link'} pattern="https://.*" maxLength={500} placeholder="https://…"/></label>
      <details><summary>Install, tags, and attribution</summary><div><label>Install command<input value={draft.install} onChange={e => field('install', e.target.value)} maxLength={300} placeholder="npm install your-library"/></label><label>Tags<span className="field-hint">Up to 6, separated by commas</span><input value={tagString} onChange={e => { setTagString(e.target.value); setDirty(true) }} maxLength={155} placeholder="navigation, interaction"/></label><label>Attribution<textarea rows={3} maxLength={500} value={draft.attribution} onChange={e => field('attribution', e.target.value)} placeholder="Credit any original work and its license"/></label></div></details>
      <label className="checkbox"><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setDirty(true) }} required/><span>The full advertised work is free and open-source. No paid features or dependencies. I have the right to share it.</span></label>
      {error && <ErrorNotice message={error}/>}<div className="publish-actions"><motion.button layout className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Submit for review'}</motion.button><motion.button layout type="button" className="button secondary" disabled={busy} onClick={() => void save(false)}>Save draft</motion.button>{item && <span className="field-hint">{dirty ? 'Unsaved changes' : `Saved · ${item.status}`}</span>}</div>
    </form>
    <aside className="publish-preview"><div className="editor-heading"><h2>Preview</h2><span className="editor-status" role="status">{compiling ? 'Updating…' : draft.previewMode === 'link' ? 'External demo' : 'Live'}</span></div><motion.div layout className="editor-preview">{draft.previewMode === 'link' ? <div className="empty"><p>External demos open in a new tab.</p>{/^https:\/\//.test(draft.demoUrl) && <External className="button secondary" href={draft.demoUrl}>Open demo</External>}</div> : src ? <Sandbox src={src} title={draft.title || 'Your component'}/> : <Loading label="Starting preview…"/>}</motion.div>{previewError && <ErrorNotice message={previewError} retry={() => void buildPreview()}/>}<p className="preview-hint">{draft.previewMode === 'react' ? <>Export-free example: define <code>function App()</code>. Imports: <code>react</code>, <code>react-dom/client</code>, <code>motion/react</code>. Preview updates as you type.</> : draft.previewMode === 'html' ? 'HTML, CSS, and JavaScript run together in an isolated preview. Preview updates as you type.' : 'Use a public HTTPS demo. Other frameworks can use this mode.'}</p></aside>
  </div></>
}
