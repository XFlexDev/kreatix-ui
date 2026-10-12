import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../session'
import { motion } from 'motion/react'

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="alert"><p>{message}</p>{retry && <button type="button" onClick={retry}>Try again</button>}</div>
}
export function Loading({ label = 'Loading…' }: { label?: string }) { return <div className="loading" role="status"><span className="loading-line"/>{label}</div> }
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h2>{title}</h2><p>{children}</p>{action}</div>
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  const location = useLocation()
  if (loading) return <Loading/>
  if (!user) return <Empty title="Sign in to continue" action={<Link className="button primary" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>}><Link to={`/join?next=${encodeURIComponent(location.pathname + location.search)}`}>Create an account</Link></Empty>
  return children
}
export function Header() {
  const { user, logout } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const leave = async () => { try { await logout(); navigate('/') } catch (e) { setError((e as Error).message) } }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link className="wordmark" to="/" aria-label="Kreatix UI home">kreatix<span>ui</span><span className="wordmark-dot"/></Link>
      <nav className="primary-nav" aria-label="Main navigation">{[['/', 'Discover'], ['/libraries', 'Libraries'], ['/creators', 'Creators'], ['/saved', 'Saved']].map(([path, label]) => <Link key={path} className={location.pathname === path ? 'active' : ''} to={path} aria-current={location.pathname === path ? 'page' : undefined}>{label}{location.pathname === path && <motion.span className="nav-marker" layoutId="nav-marker"/>}</Link>)}</nav>
      <div className="header-actions">
        {user ? <Link className="account-link" to="/workspace">@{user.username}</Link> : <Link className="account-link" to="/login">Sign in</Link>}
        <Link className="button primary publish-link" to="/publish">Publish</Link>
        {user && <button className="signout" onClick={leave}>Sign out</button>}
      </div>
    </header>
    {error && <ErrorNotice message={error}/>}
  </>
}
export function Footer() {
  return <footer className="site-footer"><div><a href="https://github.com/XFlexDev/kreatix-ui" target="_blank" rel="noreferrer">Source</a></div><span className="footer-brand">kreatix ui</span></footer>
}
export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}
export function DateLabel({ value }: { value: string }) { return <time dateTime={value}>{new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time> }
export function External({ href, children, className }: { href: string; children: ReactNode; className?: string }) { return <a href={href} className={className} target="_blank" rel="noreferrer">{children}<svg className="external-mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg></a> }
