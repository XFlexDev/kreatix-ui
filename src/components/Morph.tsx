import { useEffect, useRef, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LayoutGroup, motion } from 'motion/react'
import { api, primeResource } from '../api'

export const morphTransition = { type: 'spring' as const, stiffness: 460, damping: 42, mass: 0.8 }
export function morph(change: () => void, sharedElement = false) {
  if (!sharedElement || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { change(); return }
  document.startViewTransition(() => { flushSync(change) })
}
export function MorphNavigation({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const navigation = useRef(0)
  useEffect(() => {
    const handle = async (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element).closest('a')
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href')?.startsWith('#')) return
      const url = new URL(link.href)
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return
      event.preventDefault()
      const sequence = ++navigation.current
      const work = url.pathname.startsWith('/work/')
      const returning = location.pathname.startsWith('/work/') && url.pathname === '/'
      if (work || returning) {
        try {
          const path = work ? `/submissions/${url.pathname.slice(6)}` : `/submissions?${url.search.slice(1)}`
          const result = await api(path)
          if (sequence !== navigation.current) return
          primeResource(path, result)
        } catch { /* The detail route presents the request error. */ }
      }
      if (sequence !== navigation.current) return
      morph(() => {
        navigate(url.pathname + url.search + url.hash)
        if (!url.hash) window.scrollTo({ top: 0, behavior: 'instant' })
      }, work || returning)
    }
    document.addEventListener('click', handle, { capture: true })
    return () => document.removeEventListener('click', handle, { capture: true })
  }, [navigate])
  return <LayoutGroup id="community">{children}</LayoutGroup>
}
export function MorphPanel({ children, id }: { children: ReactNode; id: string }) {
  return <motion.div key={id} layout initial={false}>{children}</motion.div>
}
