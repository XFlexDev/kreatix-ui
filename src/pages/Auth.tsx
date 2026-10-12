import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '../../server/schema'
import { post } from '../api'
import { useSession } from '../session'
import { ErrorNotice } from '../components/UI'

export function Auth({ join = false }: { join?: boolean }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setUser } = useSession()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next') || '/workspace'
  const destination = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/workspace'
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError('')
    const values = new FormData(e.currentTarget)
    const data = { username: String(values.get('username')), password: String(values.get('password')), ...(join ? { name: String(values.get('name')) } : {}) }
    try { const result = await post<{ user: User }>(join ? '/auth/register' : '/auth/login', data); setUser(result.user); navigate(destination) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="auth-layout"><section className="auth-form"><h1>{join ? 'Create account' : 'Sign in'}</h1><form onSubmit={submit}>{join && <label>Your name<input name="name" autoComplete="name" maxLength={60} required/></label>}<label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern={join ? '[A-Za-z0-9_]{3,24}' : undefined} maxLength={24} minLength={join ? 3 : undefined} required/></label><label>Password<input name="password" type="password" autoComplete={join ? 'new-password' : 'current-password'} minLength={join ? 12 : undefined} maxLength={128} required/>{join && <span className="field-hint">12 characters minimum. No email recovery.</span>}</label>{error && <ErrorNotice message={error}/>}<button className="button primary" disabled={busy}>{busy ? 'One moment…' : join ? 'Create account' : 'Sign in'}</button></form><p><Link to={`${join ? '/login' : '/join'}?next=${encodeURIComponent(destination)}`}>{join ? 'Already a member? Sign in' : 'Create an account'}</Link></p>{join && <p className="auth-terms">By joining, you agree to the <Link to="/principles">community rules</Link>.</p>}</section></div>
}
