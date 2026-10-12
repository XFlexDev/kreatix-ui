import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '../server/schema'
import { api, post, clearPrefetched } from './api'

type Session = { user: User | null; loading: boolean; setUser: (user: User | null) => void; logout: () => Promise<void> }
const SessionContext = createContext<Session | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { api<{ user: User | null }>('/session').then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false)) }, [])
  const logout = async () => { await post('/auth/logout'); clearPrefetched(); setUser(null) }
  return <SessionContext.Provider value={{ user, setUser, loading, logout }}>{children}</SessionContext.Provider>
}
export const useSession = () => { const session = useContext(SessionContext); if (!session) throw new Error('Missing session provider'); return session }
