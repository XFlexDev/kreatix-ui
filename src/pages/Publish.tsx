import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { frameworks, categories, licenses } from '../../server/constants'
import type { Submission, DraftInput } from '../../server/schema'
import { api, ApiError, post } from '../api'
import { AuthGate, ErrorNotice, External, Loading, PageHeading } from '../components/UI'
import { Checkbox, describedBy, Field, Segmented, Select } from '../components/Controls'
import { morph, morphTransition } from '../components/Morph'
import { useSession } from '../session'

type Mode = DraftInput['previewMode']
type CodeMode = Exclude<Mode, 'link'>
type Buffer = Pick<DraftInput, 'code' | 'css' | 'js'>
type Tab = 'code' | 'css' | 'js'
type IssueKey = 'title' | 'description' | 'sourceUrl' | 'demoUrl' | 'code' | 'framework' | 'freeOnly' | 'install' | 'tags' | 'attribution' | 'form'
type Issues = Partial<Record<IssueKey, string>>
type Stored = { draft: DraftInput; confirmed: boolean; buffers: Partial<Record<CodeMode, Buffer>>; tagInput?: string }

const starters: Record<CodeMode, Buffer> = {
  react: { code: 'import React from "react"\n\nfunction App() {\n  const [count, setCount] = React.useState(0)\n  return <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>\n}', css: 'button { background: #f2f2f0; color: #101010; border: 0; border-radius: 8px; padding: 18px 28px; transition: border-radius .25s; }\nbutton:hover { border-radius: 18px; }', js: '' },
  html: { code: '<button id="example">Click me</button>', css: 'button { background: #f2f2f0; color: #101010; border: 0; border-radius: 8px; padding: 18px 28px; transition: border-radius .25s; }\nbutton:hover { border-radius: 18px; }', js: 'document.querySelector("#example").addEventListener("click", event => {\n  event.target.textContent = "It works."\n})' },
}
const starting: DraftInput = { title: '', description: '', kind: 'component', framework: 'React', category: 'Buttons', license: 'MIT', sourceUrl: '', demoUrl: '', install: '', tags: [], previewMode: 'react', ...starters.react, freeOnly: false, attribution: '' }
const limits: Record<Tab, number> = { code: 80_000, css: 30_000, js: 30_000 }
const https = (value: string) => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) } catch { return false } }
const hasApp = (code: string) => /\b(function\s+App\b|(const|let|var)\s+App\s*=|class\s+App\b)/.test(code)
const order: IssueKey[] = ['code', 'demoUrl', 'title', 'description', 'framework', 'sourceUrl', 'install', 'tags', 'attribution', 'freeOnly']
const fieldId = (key: IssueKey) => `publish-${key}`

function draftIssues(d: DraftInput): Issues {
  const issues: Issues = {}
  if (d.sourceUrl && !https(d.sourceUrl)) issues.sourceUrl = 'Use a public link that starts with https://.'
  if (d.demoUrl && !https(d.demoUrl)) issues.demoUrl = 'Use a public link that starts with https://.'
  return issues
}
function submitIssues(d: DraftInput, confirmed: boolean): Issues {
  const issues = draftIssues(d)
  if (d.title.trim().length < 3) issues.title = 'Give it a name of at least 3 characters.'
  const length = d.description.trim().length
  if (length < 20) issues.description = `Describe what it does in at least 20 characters (${length}/20).`
  if (!d.sourceUrl) issues.sourceUrl = 'Link the public repository where people can read the source.'
  if (d.previewMode === 'link' && !d.demoUrl) issues.demoUrl = 'Add the public demo people should open.'
  if (d.previewMode !== 'link' && !d.code.trim()) issues.code = d.previewMode === 'react' ? 'Add the component code for the preview.' : 'Add the HTML for the preview.'
  else if (d.previewMode === 'react' && !hasApp(d.code)) issues.code = 'Define a component named App, for example function App() { … }.'
  if (d.previewMode === 'react' && d.framework !== 'React') issues.framework = 'React previews need the React framework.'
  if (!confirmed) issues.freeOnly = 'Confirm this before submitting. Every listing must be completely free and open-source.'
  return issues
}
function serverIssues(error: unknown, local: Issues): Issues {
  if (!(error instanceof ApiError) || !error.fields.length) return { form: (error as Error).message }
  const issues: Issues = {}
  for (const issue of error.fields) {
    const key = (order.includes(issue.path[0] as IssueKey) ? issue.path[0] : 'form') as IssueKey
    issues[key] ??= local[key] ?? (key === 'form' ? 'Something in this form could not be saved. Check the highlighted fields.' : issue.message)
  }
  return issues
}

export function Publish() { const { id } = useParams(); return <AuthGate><Editor key={id || 'new'}/></AuthGate> }
function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const [draft, setDraft] = useState<DraftInput>(starting)
  const [saved, setSaved] = useState<DraftInput>(starting)
  const [item, setItem] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(!!id)
  const [loadError, setLoadError] = useState('')
  const [issues, setIssues] = useState<Issues>({})
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'submit'>('')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [restored, setRestored] = useState(false)
  const [editorTab, setEditorTab] = useState<Tab>('code')
  const [confirmed, setConfirmed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [notice, setNotice] = useState('')
  const buffers = useRef<Partial<Record<CodeMode, Buffer>>>({})
  const lastCodeMode = useRef<CodeMode>('react')
  const storageKey = `kreatix-ui-draft:${user!.id}:${id || 'new'}`

  const [src, setSrc] = useState('')
  const [shown, setShown] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const generation = useRef(0)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        if (id) {
          const { item } = await api<{ item: Submission }>(`/submissions/${id}`)
          if (!live) return
          const { title, description, kind, framework, category, license, sourceUrl, demoUrl, install, tags, previewMode, code, css, js, freeOnly, attribution } = item
          const loaded = { title, description, kind, framework, category, license, sourceUrl, demoUrl, install, tags, previewMode, code, css, js, freeOnly, attribution }
          setItem(item); setDraft(loaded); setSaved(loaded); setConfirmed(!!freeOnly)
          if (previewMode !== 'link') lastCodeMode.current = previewMode
        }
        const storedBuffers = sessionStorage.getItem(`${storageKey}:buffers`)
        if (storedBuffers && live) buffers.current = JSON.parse(storedBuffers)
        const local = sessionStorage.getItem(storageKey)
        if (local && live) {
          const recovered = JSON.parse(local) as Stored
          if (recovered.draft) {
            setDraft({ ...starting, ...recovered.draft }); setConfirmed(!!recovered.confirmed); setTagInput(recovered.tagInput || ''); buffers.current = recovered.buffers || {}; setDirty(true); setRestored(true)
            if (recovered.draft.previewMode !== 'link') lastCodeMode.current = recovered.draft.previewMode
          }
        }
      } catch (e) { if (live) setLoadError((e as Error).message) }
      finally { if (live) setLoading(false) }
    }
    void load(); return () => { live = false }
  }, [id, storageKey])
  useEffect(() => {
    if (!dirty) return
    try { sessionStorage.setItem(storageKey, JSON.stringify({ draft, confirmed, buffers: buffers.current, tagInput } satisfies Stored)) } catch { /* Saving to the server still works if browser storage is full. */ }
  }, [draft, dirty, confirmed, storageKey, tagInput])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => { if (attempted) setIssues(i => ({ ...submitIssues(draft, confirmed), ...(i.form ? { form: i.form } : {}) })) }, [draft, confirmed, attempted])

  const update = (change: Partial<DraftInput>) => { setDraft(d => ({ ...d, ...change })); setDirty(true); setNotice('') }
  const field = <K extends keyof DraftInput>(key: K, value: DraftInput[K]) => update({ [key]: value } as Partial<DraftInput>)

  const buildPreview = useCallback(async () => {
    const current = ++generation.current
    if (draft.previewMode === 'link') { setCompiling(false); return }
    setCompiling(true)
    try {
      const result = await post<{ src: string }>('/preview', { previewMode: draft.previewMode, code: draft.code, css: draft.css, js: draft.js })
      if (current === generation.current) { setSrc(result.src); setPreviewError(''); setRuntimeError('') }
    } catch (e) { if (current === generation.current) { setPreviewError((e as Error).message); setCompiling(false) } }
  }, [draft.previewMode, draft.code, draft.css, draft.js])
  useEffect(() => {
    if (loading) return
    const timer = setTimeout(() => { void buildPreview() }, 500)
    return () => { clearTimeout(timer); generation.current++ }
  }, [buildPreview, loading])
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.data?.type !== 'kreatix-preview-error') return
      const frames = [...(stage.current?.querySelectorAll('iframe') ?? [])]
      if (frames.some(frame => frame.contentWindow === event.source)) setRuntimeError(String(event.data.message || 'The preview stopped with an error.').slice(0, 300))
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [])

  const switchMode = (mode: Mode, framework?: DraftInput['framework']) => {
    if (mode === draft.previewMode) { if (framework) field('framework', framework); return }
    const change: Partial<DraftInput> = { previewMode: mode }
    if (draft.previewMode !== 'link') buffers.current[draft.previewMode] = { code: draft.code, css: draft.css, js: draft.js }
    if (mode !== 'link') {
      Object.assign(change, buffers.current[mode] ?? (mode === lastCodeMode.current && draft.previewMode === 'link' ? {} : starters[mode]))
      lastCodeMode.current = mode
      setSrc(''); setShown(''); setPreviewError(''); setRuntimeError('')
    }
    change.framework = framework ?? (mode === 'react' ? 'React' : mode === 'html' && draft.framework === 'React' ? 'HTML/CSS' : draft.framework)
    if (mode === 'html' && editorTab === 'js') setEditorTab('code')
    if (mode === 'react' && editorTab === 'js') setEditorTab('code')
    update(change)
  }
  const chooseFramework = (framework: DraftInput['framework']) => {
    if (framework === 'React') switchMode(draft.previewMode === 'html' ? 'react' : draft.previewMode, framework)
    else if (draft.previewMode === 'react') switchMode(framework === 'HTML/CSS' ? 'html' : 'link', framework)
    else field('framework', framework)
  }
  const addTags = (value: string) => {
    const next = [...new Set([...draft.tags, ...value.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)])].slice(0, 6).map(t => t.slice(0, 24))
    if (next.length !== draft.tags.length) field('tags', next)
    setTagInput('')
  }
  const importFile = async (file: File | undefined, tab: Tab) => {
    if (!file) return
    if (file.size > limits[tab]) { setIssues(i => ({ ...i, code: `${file.name} is ${Math.ceil(file.size / 1000)} KB. ${tab === 'code' ? 'Code' : tab.toUpperCase()} files can be up to ${limits[tab] / 1000} KB.` })); return }
    const text = await file.text()
    if (tab === 'code' && /\.html?$/i.test(file.name) && draft.previewMode === 'react') { buffers.current.react = { code: draft.code, css: draft.css, js: draft.js }; lastCodeMode.current = 'html'; setSrc(''); setShown(''); update({ previewMode: 'html', framework: draft.framework === 'React' ? 'HTML/CSS' : draft.framework, code: text, css: buffers.current.html?.css ?? '', js: buffers.current.html?.js ?? '' }); setNotice(`Imported ${file.name} and switched the preview to HTML.`) }
    else if (tab === 'code' && /\.[jt]sx$/i.test(file.name) && draft.previewMode === 'html') { buffers.current.html = { code: draft.code, css: draft.css, js: draft.js }; lastCodeMode.current = 'react'; setSrc(''); setShown(''); update({ previewMode: 'react', framework: 'React', code: text, css: buffers.current.react?.css ?? '', js: '' }); setNotice(`Imported ${file.name} and switched the preview to React.`) }
    else { field(tab, text); setNotice(`Imported ${file.name}.`) }
    setIssues(({ code: _code, ...rest }) => rest)
  }
  const focusIssue = (found: Issues) => {
    const first = order.find(key => found[key])
    if (!first) return
    if (first === 'code') setEditorTab('code')
    requestAnimationFrame(() => { const node = document.getElementById(fieldId(first)); node?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); node?.focus({ preventScroll: true }) })
  }
  const save = async (submit: boolean) => {
    if (busy) return
    if (tagInput.trim()) addTags(tagInput)
    const local = submit ? submitIssues(draft, confirmed) : draftIssues(draft)
    if (submit) setAttempted(true)
    setIssues(local)
    if (Object.keys(local).length) { focusIssue(local); return }
    setBusy(submit ? 'submit' : 'save')
    try {
      const payload = { ...draft, tags: tagInput.trim() ? [...new Set([...draft.tags, ...tagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)])].slice(0, 6) : draft.tags, freeOnly: confirmed }
      const result = item ? await api<{ item: Submission }>(`/submissions/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) }) : await post<{ item: Submission }>('/submissions', payload)
      setItem(result.item); setSaved(payload); setSavedAt(new Date()); setRestored(false)
      sessionStorage.removeItem(storageKey); setDirty(false)
      try { sessionStorage.setItem(`kreatix-ui-draft:${user!.id}:${result.item.id}:buffers`, JSON.stringify(buffers.current)) } catch { /* The active source is already saved to the server. */ }
      if (submit) { await post(`/submissions/${result.item.id}/submit`); morph(() => navigate('/workspace')); return }
      if (!id) morph(() => navigate(`/publish/${result.item.id}`, { replace: true }))
    } catch (e) {
      const found = serverIssues(e, local)
      setIssues(found); focusIssue(found)
    } finally { setBusy('') }
  }
  const discard = () => {
    sessionStorage.removeItem(storageKey); buffers.current = {}
    setDraft(saved); setConfirmed(!!saved.freeOnly); setTagInput(''); setDirty(false); setRestored(false); setIssues({}); setAttempted(false); setSrc(''); setShown('')
  }

  if (loading) return <Loading/>
  if (id && !item) return <ErrorNotice message={loadError || 'Work not found.'} retry={() => window.location.reload()}/>
  const required = submitIssues(draft, confirmed)
  const checklist: { key: IssueKey; label: string }[] = [
    { key: draft.previewMode === 'link' ? 'demoUrl' : 'code', label: draft.previewMode === 'link' ? 'Demo link' : 'Working preview' },
    { key: 'title', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'sourceUrl', label: 'Public source' },
    { key: 'freeOnly', label: 'Free and open-source' },
  ]
  const ready = checklist.filter(c => !required[c.key] && !(c.key === 'code' && (previewError || runtimeError))).length
  const status = item?.status
  const inReview = status === 'pending'
  const published = item?.published ?? status === 'approved'
  const previewState = draft.previewMode === 'link' ? 'External demo' : previewError ? 'Error' : compiling || (src && src !== shown) ? 'Updating' : shown ? runtimeError ? 'Runtime error' : 'Live' : 'Starting'
  const saveLabel = busy === 'save' ? 'Saving…' : inReview && !dirty ? 'Withdraw to draft' : inReview ? 'Save and withdraw' : 'Save draft'
  const submitLabel = busy === 'submit' ? 'Submitting…' : published ? 'Submit changes' : status === 'rejected' || (inReview && dirty) ? 'Resubmit for review' : 'Submit for review'
  const saveState = dirty ? (restored ? 'Restored unsaved changes' : 'Unsaved changes') : savedAt ? `Saved ${savedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : item ? 'All changes saved' : ''
  const err = (key: IssueKey) => issues[key]
  const tabs: Tab[] = draft.previewMode === 'html' ? ['code', 'css', 'js'] : ['code', 'css']
  const tabLabel = (t: Tab) => t === 'code' ? draft.previewMode === 'react' ? 'App.tsx' : 'index.html' : t === 'css' ? 'styles.css' : 'script.js'
  const accepts: Record<Tab, string> = { code: '.tsx,.jsx,.html,.htm,.txt', css: '.css', js: '.js,.mjs' }

  return <><PageHeading title={item ? 'Edit work' : 'Publish'} action={<div className="publish-heading-actions"><AnimatePresence mode="popLayout" initial={false}>{saveState && <motion.span key={saveState} className="save-state" role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .16 }}>{saveState}</motion.span>}</AnimatePresence>{restored && <button type="button" className="text-button" onClick={discard}>Discard</button>}<Link className="text-link" to="/workspace">Your work</Link></div>}/>
    {status && (status !== 'draft' || published) && <div className={`publish-status status-${status}`}><strong>{status === 'pending' ? 'In review' : published ? 'Published' : 'Changes requested'}</strong><span>{status === 'pending' ? `Saving changes takes ${published ? 'this revision' : 'it'} out of review until you submit again.${published ? ' Your published version stays public.' : ''}` : published ? 'The public version stays up while your changes are reviewed.' : item?.reason || 'Update it and submit again.'}</span></div>}
    <div className="publisher">
    <form className="publish-form" noValidate onSubmit={e => { e.preventDefault(); void save(true) }} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(false) } }}>
      <fieldset className="publish-controls" disabled={!!busy}>
      <section className="publish-section" aria-labelledby="publish-preview-heading">
        <header><span className="step">1</span><h2 id="publish-preview-heading">Preview</h2></header>
        <div className="field"><span className="field-label" id="publish-kind-label">Sharing</span><Segmented name="kind" label="What are you sharing?" value={draft.kind} options={[{ value: 'component', label: 'Component' }, { value: 'library', label: 'Library' }]} onChange={kind => { if (kind === 'library' && !id && draft.previewMode === 'react' && !dirty) switchMode('link'); field('kind', kind) }}/></div>
        <div className="field"><span className="field-label">Preview type</span><Segmented name="mode" label="Preview type" value={draft.previewMode} options={[{ value: 'react', label: 'React' }, { value: 'html', label: 'HTML / CSS / JS' }, { value: 'link', label: 'Demo link' }]} onChange={mode => switchMode(mode)}/><p className="field-hint">{draft.previewMode === 'react' ? <>Define <code>function App()</code>. Imports from <code>react</code>, <code>react-dom/client</code> and <code>motion/react</code> work.</> : draft.previewMode === 'html' ? 'HTML, CSS and JavaScript run together in an isolated frame.' : 'For other frameworks and full libraries. People open your demo in a new tab.'}</p></div>
        <AnimatePresence mode="popLayout" initial={false}>{draft.previewMode !== 'link' ? <motion.div key="code" className={`code-panel${err('code') ? ' invalid' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }}>
          <div className="code-bar"><Segmented name="tab" size="small" label="Editor file" value={editorTab} options={tabs.map(t => ({ value: t, label: tabLabel(t) }))} onChange={setEditorTab}/>
            <label className="import-button"><input className="sr-only" type="file" accept={accepts[editorTab]} onChange={e => { void importFile(e.target.files?.[0], editorTab); e.target.value = '' }}/><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10v3.5h11V10"/></svg>Import</label></div>
          <div className="code-surface" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.currentTarget.classList.add('dropping') } }} onDragLeave={e => e.currentTarget.classList.remove('dropping')} onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dropping'); const file = e.dataTransfer.files[0]; if (file) void importFile(file, /\.css$/i.test(file.name) ? 'css' : /\.m?js$/i.test(file.name) && draft.previewMode === 'html' ? 'js' : 'code') }}>
            <textarea id={editorTab === 'code' ? fieldId('code') : `publish-${editorTab}`} className="code-editor" aria-label={tabLabel(editorTab)} aria-invalid={(editorTab === 'code' && !!err('code')) || undefined} aria-describedby={editorTab === 'code' && err('code') ? 'publish-code-error' : undefined} spellCheck={false} autoCapitalize="none" autoCorrect="off" maxLength={limits[editorTab]} value={draft[editorTab]} onChange={e => field(editorTab, e.target.value)} placeholder={editorTab === 'css' ? '/* Optional styles */' : editorTab === 'js' ? '// Optional script' : ''}/>
            <span className="code-meta">{(new Blob([draft[editorTab]]).size / 1000).toFixed(1)} / {limits[editorTab] / 1000} KB · drop a file to import</span>
          </div>
          <AnimatePresence initial={false}>{err('code') && <motion.p className="field-error" id="publish-code-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>{err('code')}</motion.p>}</AnimatePresence>
          {notice && <p className="field-hint" role="status">{notice}</p>}
        </motion.div> : <motion.div key="link" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }}>
          <Field id={fieldId('demoUrl')} label="Demo URL" error={err('demoUrl')} hint="A public HTTPS page where the work can be tried."><input id={fieldId('demoUrl')} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={draft.demoUrl} onChange={e => field('demoUrl', e.target.value.trim())} maxLength={500} placeholder="https://your-demo.dev" aria-invalid={!!err('demoUrl') || undefined} aria-describedby={describedBy(fieldId('demoUrl'), err('demoUrl'), true)}/></Field>
        </motion.div>}</AnimatePresence>
      </section>

      <section className="publish-section" aria-labelledby="publish-details-heading">
        <header><span className="step">2</span><h2 id="publish-details-heading">Details</h2></header>
        <Field id={fieldId('title')} label="Name" error={err('title')} aside={<span className="count">{draft.title.length}/80</span>}><input id={fieldId('title')} value={draft.title} onChange={e => field('title', e.target.value)} maxLength={80} placeholder="Magnetic button" aria-invalid={!!err('title') || undefined} aria-describedby={describedBy(fieldId('title'), err('title'))}/></Field>
        <Field id={fieldId('description')} label="Description" error={err('description')} hint="What it does, and where it fits." aside={<span className="count">{draft.description.trim().length < 20 ? `${draft.description.trim().length}/20 min` : `${draft.description.length}/2000`}</span>}><textarea id={fieldId('description')} value={draft.description} onChange={e => field('description', e.target.value)} maxLength={2000} rows={4} placeholder="A button that leans toward the cursor and settles back when released." aria-invalid={!!err('description') || undefined} aria-describedby={describedBy(fieldId('description'), err('description'), true)}/></Field>
        <div className="form-row">
          <Field id={fieldId('framework')} label="Framework" error={err('framework')}><Select id={fieldId('framework')} value={draft.framework} options={frameworks} onChange={chooseFramework} invalid={!!err('framework')} describedBy={describedBy(fieldId('framework'), err('framework'))}/></Field>
          <Field id="publish-category" label="Category"><Select id="publish-category" value={draft.category} options={categories} onChange={category => field('category', category)}/></Field>
        </div>
        <Field id={fieldId('tags')} label="Tags" hint={draft.tags.length >= 6 ? 'That’s the maximum of 6.' : 'Press Enter or comma to add. Up to 6.'} aside={<span className="count">{draft.tags.length}/6</span>}>
          <div className="tag-input" onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
            <AnimatePresence initial={false}>{draft.tags.map(tag => <motion.span layout="position" key={tag} className="tag-chip" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} transition={morphTransition}>{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => field('tags', draft.tags.filter(t => t !== tag))}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg></button></motion.span>)}</AnimatePresence>
            {draft.tags.length < 6 && <input id={fieldId('tags')} value={tagInput} maxLength={60} autoCapitalize="none" placeholder={draft.tags.length ? '' : 'motion, button'} aria-describedby={`${fieldId('tags')}-hint`} onChange={e => { if (e.target.value.includes(',')) addTags(e.target.value); else { setTagInput(e.target.value); setDirty(true) } }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTags(tagInput) } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) field('tags', draft.tags.slice(0, -1)) }} onBlur={() => tagInput.trim() && addTags(tagInput)}/>}
          </div>
        </Field>
      </section>

      <section className="publish-section" aria-labelledby="publish-source-heading">
        <header><span className="step">3</span><h2 id="publish-source-heading">Source</h2></header>
        <Field id={fieldId('sourceUrl')} label="Public repository" error={err('sourceUrl')} hint="Where people can read and fork the full source."><input id={fieldId('sourceUrl')} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={draft.sourceUrl} onChange={e => field('sourceUrl', e.target.value.trim())} maxLength={500} placeholder="https://github.com/you/project" aria-invalid={!!err('sourceUrl') || undefined} aria-describedby={describedBy(fieldId('sourceUrl'), err('sourceUrl'), true)}/></Field>
        <div className="form-row">
          <Field id="publish-license" label="License"><Select id="publish-license" value={draft.license} options={licenses} onChange={license => field('license', license)}/></Field>
          <Field id={fieldId('install')} label="Install command" error={err('install')}><input id={fieldId('install')} className="mono" value={draft.install} onChange={e => field('install', e.target.value)} maxLength={300} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="npm i your-package"/></Field>
        </div>
        {draft.previewMode !== 'link' && <Field id={fieldId('demoUrl')} label={<>Docs or demo <span className="optional">Optional</span></>} error={err('demoUrl')}><input id={fieldId('demoUrl')} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={draft.demoUrl} onChange={e => field('demoUrl', e.target.value.trim())} maxLength={500} placeholder="https://" aria-invalid={!!err('demoUrl') || undefined} aria-describedby={describedBy(fieldId('demoUrl'), err('demoUrl'))}/></Field>}
        <Field id={fieldId('attribution')} label={<>Credit <span className="optional">Optional</span></>} error={err('attribution')} hint="Original authors and licenses this builds on."><textarea id={fieldId('attribution')} rows={2} maxLength={500} value={draft.attribution} onChange={e => field('attribution', e.target.value)} placeholder="Based on Fancy Components by Daniel Petho, MIT" aria-describedby={describedBy(fieldId('attribution'), err('attribution'), true)}/></Field>
      </section>

      <section className="publish-section submit-section" aria-labelledby="publish-submit-heading">
        <header><span className="step">4</span><h2 id="publish-submit-heading">Submit</h2><span className="ready-count">{ready} of {checklist.length} ready</span></header>
        <ul className="checklist">{checklist.map(c => { const done = !required[c.key] && !(c.key === 'code' && (previewError || runtimeError)); return <li key={c.key} className={done ? 'done' : ''}><button type="button" onClick={() => focusIssue({ [c.key]: 'focus' })}><span className="check-dot" aria-hidden="true">{done && <motion.svg viewBox="0 0 16 16" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}><motion.path d="m3.5 8.5 3 3 6-7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .2 }}/></motion.svg>}</span>{c.label}<span className="sr-only">{done ? ', done' : ', missing'}</span></button></li> })}</ul>
        <Checkbox id={fieldId('freeOnly')} checked={confirmed} invalid={!!err('freeOnly')} describedBy={err('freeOnly') ? `${fieldId('freeOnly')}-error` : undefined} onChange={checked => { setConfirmed(checked); setDirty(true) }}>Everything it advertises is free and open-source, with no paid features or dependencies, and I have the right to share it.</Checkbox>
        <AnimatePresence initial={false}>{err('freeOnly') && <motion.p className="field-error" id={`${fieldId('freeOnly')}-error`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>{err('freeOnly')}</motion.p>}</AnimatePresence>
        {issues.form && <ErrorNotice message={issues.form}/>}
        <div className="publish-actions">
          <motion.button layout="position" className="button primary" disabled={!!busy || (inReview && !dirty)}>{inReview && !dirty ? 'In review' : submitLabel}</motion.button>
          <motion.button layout="position" type="button" className="button secondary" disabled={!!busy || (!dirty && !!item && !inReview)} onClick={() => void save(false)}>{!dirty && item && !inReview ? 'Saved' : saveLabel}</motion.button>
          <span className="shortcut">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} S saves a draft</span>
        </div>
        <p className="field-hint">Drafts are private. Reviewers check the license and source before anything goes public.</p>
      </section>
      </fieldset>
    </form>

    <aside className="publish-preview" aria-label="Live preview">
      <div className="editor-heading"><h2>{draft.title.trim() || 'Untitled'}</h2><span className={`preview-state state-${previewState.toLowerCase().replace(' ', '-')}`} role="status"><span aria-hidden="true"/>{previewState}</span></div>
      <div className="editor-preview" ref={stage}>
        {draft.previewMode === 'link' ? <div className="preview-link"><p>{https(draft.demoUrl) ? new URL(draft.demoUrl).host : 'Add a demo URL to link your preview.'}</p>{https(draft.demoUrl) && <External className="button secondary" href={draft.demoUrl}>Open demo</External>}</div> : <>
          {shown && <iframe key={shown} className="sandbox" sandbox="allow-scripts" referrerPolicy="no-referrer" title={`${draft.title || 'Your work'} preview`} src={shown}/>}
          {src && src !== shown && <iframe key={src} className="sandbox loading-frame" sandbox="allow-scripts" referrerPolicy="no-referrer" title={`${draft.title || 'Your work'} preview`} aria-hidden="true" tabIndex={-1} src={src} onLoad={() => { setShown(src); setCompiling(false) }}/>}
          {!shown && !previewError && <div className="preview-pending" aria-hidden="true"><span/></div>}
          {!shown && previewError && <p className="preview-unavailable">Fix the error below to see a preview.</p>}
        </>}
        <AnimatePresence initial={false}>{draft.previewMode !== 'link' && (previewError || runtimeError) && <motion.div key="error" className="preview-problem" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .18, ease: [.16, 1, .3, 1] }}><strong>{previewError ? shown ? 'Showing the last working version' : 'Preview failed' : 'The preview hit an error'}</strong><code>{previewError || runtimeError}</code></motion.div>}</AnimatePresence>
      </div>
      <p className="preview-hint">{draft.previewMode === 'link' ? 'External demos open in a new tab.' : 'Updates as you type. Runs isolated, with no network access.'}</p>
    </aside>
  </div></>
}
