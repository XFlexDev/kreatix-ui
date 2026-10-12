import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...init,
    headers: { 'Content-Type': 'application/json', 'x-kreatix-ui': '1', ...init.headers },
  })
  const result = await response.json().catch(() => ({ error: 'The server could not be reached. Try again.' }))
  if (!response.ok) throw new ApiError(result.error || 'Request failed', response.status)
  return result as T
}
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
const prefetched = new Map<string, { data: unknown; expires: number }>()
export function primeResource(path: string, data: unknown) { prefetched.clear(); prefetched.set(path, { data, expires: Date.now() + 5000 }) }
export function clearPrefetched() { prefetched.clear() }
export function useResource<T>(path: string | null, keepPrevious = false) {
  const initial = path && prefetched.get(path)
  const [data, setData] = useState<T | null>(initial && initial.expires > Date.now() ? initial.data as T : null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const current = ++generation.current
    if (!path) { setData(null); setLoading(false); return }
    setLoading(true); setError('')
    try { const result = await api<T>(path); if (current === generation.current) setData(result) }
    catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Request failed') }
    finally { if (current === generation.current) setLoading(false) }
  }, [path])
  useEffect(() => {
    const cached = path && prefetched.get(path)
    if (path) prefetched.delete(path)
    if (cached && cached.expires > Date.now()) setData(cached.data as T)
    else if (!keepPrevious) setData(null)
    void reload(); return () => { generation.current++ }
  }, [reload, keepPrevious, path])
  return { data, error, loading, reload, setData }
}
