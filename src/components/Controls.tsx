import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { morph, morphTransition } from './Morph'

export function Field({ id, label, hint, error, aside, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; aside?: ReactNode; children: ReactNode }) {
  return <div className={`field${error ? ' invalid' : ''}`}>
    <div className="field-top"><label htmlFor={id}>{label}</label>{aside}</div>
    {children}
    <AnimatePresence initial={false}>{error ? <motion.p key="error" className="field-error" id={`${id}-error`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .18, ease: [.16, 1, .3, 1] }}>{error}</motion.p> : hint ? <p className="field-hint" id={`${id}-hint`}>{hint}</p> : null}</AnimatePresence>
  </div>
}
export const describedBy = (id: string, error?: string, hint?: boolean) => error ? `${id}-error` : hint ? `${id}-hint` : undefined

export function Segmented<T extends string>({ name, label, value, options, onChange, size = 'regular', id }: { name: string; label: string; value: T; options: readonly { value: T; label: ReactNode }[]; onChange: (value: T) => void; size?: 'regular' | 'small'; id?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = options.findIndex(o => o.value === value)
  const move = (to: number) => { const next = (to + options.length) % options.length; refs.current[next]?.focus(); morph(() => onChange(options[next].value)) }
  return <div className={`segmented ${size}`} role="radiogroup" aria-label={label} id={id} onKeyDown={e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(index + 1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(index - 1) }
  }}>{options.map((o, i) => <button key={o.value} ref={node => { refs.current[i] = node }} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} className={o.value === value ? 'active' : ''} onClick={() => o.value !== value && morph(() => onChange(o.value))}>
    {o.value === value && <motion.span layoutId={`segment-${name}`} className="segment-marker" transition={morphTransition}/>}<span className="tab-label">{o.label}</span>
  </button>)}</div>
}

export function Select<T extends string>({ id, value, options, onChange, invalid, describedBy: described }: { id: string; value: T; options: readonly T[]; onChange: (value: T) => void; invalid?: boolean; describedBy?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(Math.max(0, options.indexOf(value)))
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const typed = useRef({ text: '', at: 0 })
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' }) }, [active, open])
  const show = () => { setActive(Math.max(0, options.indexOf(value))); setOpen(true) }
  const choose = (option: T) => { setOpen(false); if (option !== value) onChange(option) }
  return <div className={`select${open ? ' open' : ''}`} ref={root}>
    <button id={id} type="button" role="combobox" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? `${listId}-${active}` : undefined} aria-invalid={invalid || undefined} aria-describedby={described}
      onClick={() => open ? setOpen(false) : show()}
      onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false) }}
      onKeyDown={event => {
        const last = options.length - 1
        if (!open) {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() }
          return
        }
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(a => Math.min(last, a + 1)) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(a => Math.max(0, a - 1)) }
        else if (event.key === 'Home') { event.preventDefault(); setActive(0) }
        else if (event.key === 'End') { event.preventDefault(); setActive(last) }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(options[active]) }
        else if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
        else if (event.key === 'Tab') setOpen(false)
        else if (event.key.length === 1) {
          const now = Date.now()
          typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + event.key.toLowerCase(), at: now }
          const match = options.findIndex(o => o.toLowerCase().startsWith(typed.current.text))
          if (match >= 0) setActive(match)
        }
      }}>
      <span>{value}</span><svg className="select-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    <AnimatePresence>{open && <motion.ul ref={list} id={listId} role="listbox" aria-labelledby={id} className="select-list" tabIndex={-1}
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .14, ease: [.16, 1, .3, 1] }}>
      {options.map((option, i) => <li key={option} id={`${listId}-${i}`} role="option" aria-selected={option === value} className={i === active ? 'active' : ''}
        onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(i)} onClick={() => choose(option)}>
        {i === active && <motion.span layoutId={`select-highlight-${id}`} className="select-highlight" transition={morphTransition}/>}
        <span className="tab-label">{option}</span>{option === value && <svg className="select-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>}
      </li>)}
    </motion.ul>}</AnimatePresence>
  </div>
}

export function Checkbox({ id, checked, onChange, children, invalid, describedBy: described }: { id: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; invalid?: boolean; describedBy?: string }) {
  return <label className={`check${invalid ? ' invalid' : ''}`} htmlFor={id}>
    <input id={id} type="checkbox" checked={checked} aria-invalid={invalid || undefined} aria-describedby={described} onChange={e => onChange(e.target.checked)}/>
    <span className="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
    <span className="check-label">{children}</span>
  </label>
}
