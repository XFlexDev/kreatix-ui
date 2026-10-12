import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../session'
import { api, post, useResource } from '../api'
import { AuthGate, ErrorNotice, Loading, PageHeading } from '../components/UI'
import type { Creator, User } from '../../server/schema'

export function Settings() { return <AuthGate><Account/></AuthGate> }
function Account() {
  const [params] = useSearchParams()
  const { user, setUser } = useSession()
  const { data, error, loading, reload } = useResource<{ creator: Creator }>(`/creators/${user!.username}`)
  const { data: auth, error: authError, loading: authLoading, reload: reloadAuth } = useResource<{ github: boolean; hasPassword: boolean; githubAvailable: boolean }>('/me/auth')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const save = async (e: FormEvent<HTMLFormElement>, password: boolean) => {
    e.preventDefault(); setBusy(true); setMessage(''); setFailure('')
    const form = e.currentTarget
    const values = Object.fromEntries(new FormData(form))
    try {
      if (password) { await post('/me/password', values); form.reset(); setMessage('Password changed. Other sessions have been signed out.') }
      else { const result = await api<{ user: User }>('/me', { method: 'PATCH', body: JSON.stringify(values) }); setUser(result.user); setMessage('Profile saved.') }
    } catch (e) { setFailure((e as Error).message) } finally { setBusy(false) }
  }
  if (loading || authLoading) return <Loading/>
  if (error || authError) return <ErrorNotice message={error || authError} retry={error ? reload : reloadAuth}/>
  return <><PageHeading title="Settings"/><div className="settings-layout"><section><h2>Profile</h2><form className="settings-form" onSubmit={e => void save(e, false)}><label>Name<input name="name" defaultValue={user!.name} minLength={1} maxLength={60} required autoComplete="name"/></label><label>Bio<textarea name="bio" defaultValue={data?.creator.bio} maxLength={800} rows={4}/></label><label>Website<input name="website" type="url" pattern="https://.*" defaultValue={data?.creator.website} maxLength={500} placeholder="https://…"/></label><button className="button primary" disabled={busy}>Save profile</button></form></section><section><h2>Sign-in methods</h2>{auth!.hasPassword && <form className="settings-form" onSubmit={e => void save(e, true)}><label>Current password<input name="current" type="password" autoComplete="current-password" required maxLength={128}/></label><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/><span className="field-hint">12 characters minimum. No email recovery.</span></label><button className="button secondary" disabled={busy}>Change password</button></form>}{auth!.github ? <p className="status-notice">GitHub connected</p> : auth!.githubAvailable ? <a className="button secondary" href="/api/auth/github?link=1">Connect GitHub</a> : null}{!auth!.hasPassword && <p className="status-notice">Sign in with GitHub.</p>}{params.get('github') === 'conflict' && <ErrorNotice message="This GitHub account is already connected to another profile."/>}{params.get('github') === 'connected' && <p role="status">GitHub connected.</p>}</section></div>{failure && <ErrorNotice message={failure}/>}<p className="status-notice" role="status">{message}</p></>
}
