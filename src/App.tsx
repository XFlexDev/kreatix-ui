import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { SessionProvider } from './session'
import { Header, Footer, Empty } from './components/UI'
import { Discover } from './pages/Discover'
import { Auth } from './pages/Auth'
import { Creators, CreatorProfile } from './pages/Creators'
import { Detail } from './pages/Detail'
import { MorphNavigation } from './components/Morph'
import { Publish } from './pages/Publish'
import { Workspace } from './pages/Workspace'
import { Settings } from './pages/Settings'
import { Moderation } from './pages/Moderation'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
function LiveUpdates() {
  useEffect(() => {
    let version = ''
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/version', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (version && data.version !== version && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '') && !location.pathname.startsWith('/publish')) location.reload()
        version ||= data.version
      } catch { /* Keep the current page usable during a deployment. */ }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])
  return null
}
export function App() {
  return <BrowserRouter><MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 460, damping: 42, mass: 0.8 }}><SessionProvider><MorphNavigation><ScrollTop/><LiveUpdates/><Header/><main id="main" className="page"><Routes>
    <Route path="/" element={<Discover/>}/><Route path="/libraries" element={<Discover kind="library"/>}/><Route path="/saved" element={<Discover saved/>}/>
    <Route path="/creators" element={<Creators/>}/><Route path="/creators/:username" element={<CreatorProfile/>}/><Route path="/work/:slug" element={<Detail/>}/>
    <Route path="/login" element={<Auth/>}/><Route path="/join" element={<Auth join/>}/>
    <Route path="/publish" element={<Publish/>}/><Route path="/publish/:id" element={<Publish/>}/><Route path="/workspace" element={<Workspace/>}/><Route path="/settings" element={<Settings/>}/><Route path="/moderation" element={<Moderation/>}/>
    <Route path="/principles" element={<Empty title="Nothing paid. Ever.">Every listing must be free and open-source. No paid features, promoted rankings, Pro tiers, or paywalled components. Original licenses and creator credit stay intact.</Empty>}/>
    <Route path="*" element={<Empty title="Nothing at this address.">Head back to discovery.</Empty>}/>
  </Routes></main><Footer/></MorphNavigation></SessionProvider></MotionConfig></BrowserRouter>
}
