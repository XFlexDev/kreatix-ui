import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '../../server/schema'
import { api, post } from '../api'
import { useSession } from '../session'
import { ErrorNotice } from '../components/UI'

function NameField() {
  const present = useIsPresent()
  const reduced = useReducedMotion()
  return <motion.div className="auth-animated-field" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : undefined}><label>Your name<input name="name" autoComplete="name" maxLength={60} required={present} disabled={!present}/></label></motion.div>
}

export function Auth({ join = false }: { join?: boolean }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setUser } = useSession()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [github, setGithub] = useState(false)
  const next = params.get('next') || '/workspace'
  const destination = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/workspace'
  useEffect(() => { api<{ github: boolean }>('/auth/providers').then(result => setGithub(result.github)).catch(() => setGithub(false)) }, [])
  useEffect(() => { setError('') }, [join])
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const values = new FormData(e.currentTarget)
    const data = { username: String(values.get('username')), password: String(values.get('password')), ...(join ? { name: String(values.get('name')) } : {}) }
    try {
      const result = await post<{ user: User }>(join ? '/auth/register' : '/auth/login', data)
      setUser(result.user)
      navigate(destination)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const path = (page: string) => `${page}?next=${encodeURIComponent(destination)}`
  return <div className="auth-layout"><section className="auth-form">
    <nav className="auth-tabs" aria-label="Account">
      <Link to={path('/login')} aria-current={!join ? 'page' : undefined}>{!join && <motion.span layoutId="auth-selector" className="morph-tab"/>}<span className="tab-label">Sign in</span></Link>
      <Link to={path('/join')} aria-current={join ? 'page' : undefined}>{join && <motion.span layoutId="auth-selector" className="morph-tab"/>}<span className="tab-label">Create account</span></Link>
    </nav>
    <h1 className="sr-only">{join ? 'Create account' : 'Sign in'}</h1>
    <form onSubmit={submit}>
      <AnimatePresence initial={false}>{join && <NameField key="name"/>}</AnimatePresence>
      <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern={join ? '[A-Za-z0-9_]{3,24}' : undefined} maxLength={24} minLength={join ? 3 : undefined} required/></label>
      <label>Password<input key={join ? 'new' : 'current'} name="password" type="password" autoComplete={join ? 'new-password' : 'current-password'} minLength={join ? 12 : undefined} maxLength={128} required/>{join && <span className="field-hint">12 characters minimum. No email recovery.</span>}</label>
      {(error || params.get('github') === 'failed') && <ErrorNotice message={error || 'GitHub sign-in failed. Please try again.'}/>}
      <button className="button primary" disabled={busy}>{busy ? 'One moment…' : join ? 'Create account' : 'Sign in'}</button>
    </form>
    {github && <a className="button secondary auth-github" href={`/api/auth/github?next=${encodeURIComponent(destination)}`}>Continue with GitHub</a>}
  </section></div>
}
