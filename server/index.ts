import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openDatabase } from './db'
import { createApp } from './app'
import { seed } from './seed'

if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN')
const db = openDatabase()
seed(db)
const api = createApp(db)
const app = new Hono()
app.get('/api/version', c => {
  c.header('Cache-Control', 'no-store')
  return c.json({ version: createHash('sha256').update(readFileSync('./dist/index.html')).digest('hex').slice(0, 16) })
})
app.use('/api/*', async (c, next) => {
  const address = getConnInfo(c).remote.address || 'unknown'
  const ip = process.env.TRUST_PROXY === '1' ? c.req.header('x-real-ip') || address : address
  c.set('ip' as never, ip as never)
  await next()
})
app.route('/', api)
app.get('/api/*', c => c.json({ error: 'Endpoint not found' }, 404))
app.use('/assets/*', async (c, next) => { c.header('Cache-Control', 'public,max-age=31536000,immutable'); await next() })
app.use('*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))
const server = serve({ fetch: app.fetch, hostname: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8462) }, info => console.log(`Kreatix UI listening on ${info.address}:${info.port}`))
const close = () => server.close(() => { db.close(); process.exit(0) })
process.on('SIGTERM', close)
process.on('SIGINT', close)
