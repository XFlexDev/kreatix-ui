import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import type { DB } from './db'
import { submissionSchema, draftSchema, previewInputSchema, type SubmissionInput, type User, type Creator, type Submission } from './schema'
import { compilePreview } from './preview'

type Env = { Variables: { user: User | null; ip: string } }
type Row = { id: string; slug: string; owner_id: string | null; creator_id: string; status: Submission['status']; reason: string; payload: string; curated: number; created_at: string; updated_at: string }
type Revision = { id: string; payload: string; status: Submission['status']; reason: string; created_at: string }
type CreatorRow = { id: string; username: string; name: string; bio: string; website: string; curated: number; joined: string }
const scrypt = (password: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }) => new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key)))
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const now = () => new Date().toISOString()
const reservedUsernames = ['admin', 'api', 'moderation', 'kreatix', 'support', 'settings']
const safeNext = (next: string | undefined) => next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && ![...next].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? next : '/workspace'
const publicCreator = (r: CreatorRow): Creator => ({ id: r.id, username: r.username, name: r.name, bio: r.bio, website: r.website, curated: !!r.curated, joined: r.joined })
function fail(status: 400 | 401 | 403 | 404 | 409 | 429 | 503, message: string): never { throw new HTTPException(status, { message }) }

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }) as Buffer
  return `${salt}:${key.toString('hex')}`
}
async function verifyPassword(password: string, hashed: string) {
  const [salt, value] = hashed.split(':')
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }) as Buffer
  const expected = Buffer.from(value, 'hex')
  return expected.length === key.length && timingSafeEqual(expected, key)
}

export function createApp(db: DB, options: { origin?: string; production?: boolean; github?: false | { clientId: string; clientSecret: string; fetch?: typeof fetch } } = {}) {
  const app = new Hono<Env>()
  const origin = options.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173'
  const production = options.production ?? process.env.NODE_ENV === 'production'
  const cookieName = production ? '__Host-kreatix_ui' : 'kreatix_ui'
  const flowCookie = production ? '__Host-kreatix_ui_oauth' : 'kreatix_ui_oauth'
  const github = options.github === false ? undefined : options.github ?? (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } : undefined)
  const redirectUri = `${origin}/api/auth/github/callback`
  const cache = new Map<string, string>()
  const documents = new Map<string, { html: string; userId: string; expires: number }>()
  let builds = 0
  function limit(key: string, max: number, seconds: number) {
    const time = Date.now()
    const row = db.prepare('SELECT count,expires FROM rate_limits WHERE key=?').get(key) as { count: number; expires: number } | undefined
    if (row && row.expires > time && row.count >= max) fail(429, 'Too many requests. Please try again shortly.')
    db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires>? THEN count+1 ELSE 1 END, expires=CASE WHEN expires>? THEN expires ELSE excluded.expires END').run(key, time + seconds * 1000, time, time)
    db.prepare('DELETE FROM rate_limits WHERE expires<?').run(time)
  }
  async function preview(payload: Pick<SubmissionInput, 'previewMode' | 'code' | 'css' | 'js'>) {
    const key = hashToken(JSON.stringify([payload.previewMode, payload.code, payload.css, payload.js]))
    const existing = cache.get(key)
    if (existing !== undefined) return existing
    if (builds >= 2) fail(503, 'Preview compiler is busy. Try again in a moment.')
    builds++
    try {
      const html = await compilePreview(payload)
      if (cache.size >= 40) cache.delete(cache.keys().next().value!)
      cache.set(key, html)
      return html
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not compile preview'
      fail(400, message.slice(0, 800))
    } finally { builds-- }
  }
  function requireUser(c: Context<Env>) {
    const user = c.get('user')
    if (!user) fail(401, 'Sign in to continue')
    return user
  }
  function admin(c: Context<Env>) {
    const user = requireUser(c)
    if (user.role !== 'admin') fail(403, 'Moderator access is required')
    return user
  }
  function rowFor(id: string) {
    return db.prepare('SELECT * FROM submissions WHERE id=? OR slug=?').get(id, id) as Row | undefined
  }
  function revisionFor(id: string) {
    return db.prepare('SELECT * FROM revisions WHERE submission_id=? AND status IN (\'draft\',\'pending\',\'rejected\') ORDER BY created_at DESC LIMIT 1').get(id) as Revision | undefined
  }
  function serialize(row: Row, user: User | null, includeRevision = false): Submission {
    const revision = includeRevision ? revisionFor(row.id) : undefined
    const payload = JSON.parse(revision?.payload ?? row.payload) as SubmissionInput
    const creator = db.prepare('SELECT * FROM creators WHERE id=?').get(row.creator_id) as CreatorRow
    return { ...payload, id: row.id, slug: row.slug, ownerId: row.owner_id, published: row.status === 'approved', status: revision?.status ?? row.status, reason: revision?.reason ?? row.reason, creator: publicCreator(creator), createdAt: row.created_at, updatedAt: revision?.created_at ?? row.updated_at, saves: Number(db.prepare('SELECT COUNT(*) AS n FROM saves WHERE submission_id=?').get(row.id)?.n), saved: !!(user && db.prepare('SELECT 1 FROM saves WHERE user_id=? AND submission_id=?').get(user.id, row.id)), curated: !!row.curated }
  }
  function visible(c: Context<Env>, id: string) {
    const row = rowFor(id)
    if (!row || (row.status !== 'approved' && row.owner_id !== c.get('user')?.id && c.get('user')?.role !== 'admin')) fail(404, 'Submission not found')
    return row
  }
  function owned(c: Context<Env>, id: string) {
    const user = requireUser(c)
    const row = rowFor(id)
    if (!row || row.owner_id !== user.id) fail(404, 'Submission not found')
    return row
  }
  function audit(userId: string, action: string, target: string, detail = '') {
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(), userId, action, target, detail, now())
  }
  function session(c: Context<Env>, userId: string) {
    const token = randomBytes(32).toString('base64url')
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token), userId, Date.now() + 30 * 86400_000)
    setCookie(c, cookieName, token, { httpOnly: true, secure: production, sameSite: 'Lax', path: '/', maxAge: 30 * 86400 })
  }

  app.use('/api/*', bodyLimit({ maxSize: 160_000, onError: c => c.json({ error: 'Request is too large. Preview code is limited to 80 KB.' }, 413) }))
  const security = secureHeaders({ contentSecurityPolicy: production ? { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], connectSrc: ["'self'"], frameSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"] } : undefined, crossOriginEmbedderPolicy: false })
  app.use('*', async (c, next) => {
    if (/^\/api\/(submissions|previews)\/[^/]+\/frame$/.test(c.req.path)) {
      c.header('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
      c.header('X-Content-Type-Options', 'nosniff')
      c.header('Referrer-Policy', 'no-referrer')
      return next()
    }
    return security(c, next)
  })
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.set('user', null)
    if (!c.get('ip')) c.set('ip', 'local')
    const token = getCookie(c, cookieName)
    if (token) {
      const user = db.prepare('SELECT u.id,u.username,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?').get(hashToken(token), Date.now()) as User | undefined
      if (user) c.set('user', user)
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      if (c.req.header('origin') !== origin || c.req.header('x-kreatix-ui') !== '1') fail(403, 'Request origin could not be verified. Reload the page and try again.')
      if (!c.req.header('content-type')?.startsWith('application/json')) fail(400, 'Send JSON')
      limit(`write:${c.get('ip')}`, 100, 60)
    }
    await next()
  })
  app.onError((e, c) => {
    if (e instanceof z.ZodError) return c.json({ error: e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), fields: e.issues }, 400)
    if (e instanceof HTTPException) return c.json({ error: e.message }, e.status)
    if (e instanceof SyntaxError) return c.json({ error: 'Invalid JSON' }, 400)
    console.error('Request failed:', e instanceof Error ? e.message : 'unknown error')
    return c.json({ error: 'Something went wrong. Try again.' }, 500)
  })
  app.get('/api/health', c => c.json({ ok: true }))
  app.get('/api/session', c => c.json({ user: c.get('user') }))
  app.get('/api/auth/providers', c => c.json({ github: !!github }))
  app.get('/api/auth/github', c => {
    if (!github) fail(503, 'GitHub sign-in is not configured')
    limit(`oauth-start:${c.get('ip')}`, 20, 900)
    const userId = c.req.query('link') === '1' ? requireUser(c).id : null
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    db.prepare('DELETE FROM oauth_flows WHERE expires<?').run(Date.now())
    db.prepare('INSERT INTO oauth_flows VALUES(?,?,?,?,?)').run(hashToken(state), verifier, userId ? '/settings' : safeNext(c.req.query('next')), userId, Date.now() + 600_000)
    setCookie(c, flowCookie, state, { httpOnly: true, secure: production, sameSite: 'Lax', path: '/', maxAge: 600 })
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', github.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', 'read:user')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
    return c.redirect(url.toString())
  })
  app.get('/api/auth/github/callback', async c => {
    limit(`oauth-callback:${c.get('ip')}`, 20, 900)
    const state = c.req.query('state')
    const cookie = getCookie(c, flowCookie)
    deleteCookie(c, flowCookie, { path: '/', secure: production })
    if (!github || !state || !cookie || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookie) || !timingSafeEqual(Buffer.from(cookie), Buffer.from(state))) return c.redirect(`${origin}/login?github=failed`)
    const flow = db.prepare('SELECT verifier,next,user_id,expires FROM oauth_flows WHERE hash=?').get(hashToken(state)) as { verifier: string; next: string; user_id: string | null; expires: number } | undefined
    db.prepare('DELETE FROM oauth_flows WHERE hash=?').run(hashToken(state))
    if (!flow || flow.expires < Date.now() || !c.req.query('code') || c.req.query('code')!.length > 2048) return c.redirect(`${origin}/login?github=failed`)
    if (flow.user_id && c.get('user')?.id !== flow.user_id) return c.redirect(`${origin}/login?github=failed`)
    try {
      const response = await (github.fetch ?? fetch)('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: github.clientId, client_secret: github.clientSecret, code: c.req.query('code')!, redirect_uri: redirectUri, code_verifier: flow.verifier }),
        signal: AbortSignal.timeout(10_000)
      })
      if (!response.ok) throw new Error('OAuth exchange failed')
      const token = z.object({ access_token: z.string().min(1), token_type: z.literal('bearer') }).parse(await response.json()).access_token
      const profileResponse = await (github.fetch ?? fetch)('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(10_000)
      })
      if (!profileResponse.ok) throw new Error('GitHub profile request failed')
      const profile = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), login: z.string().min(1).max(128), name: z.string().nullable().optional() }).parse(await profileResponse.json())
      const githubId = String(profile.id)
      const linked = db.prepare('SELECT user_id FROM github_identities WHERE github_id=?').get(githubId) as { user_id: string } | undefined
      if (flow.user_id) {
        if (linked && linked.user_id !== flow.user_id) return c.redirect(`${origin}/settings?github=conflict`)
        if (!linked && db.prepare('SELECT 1 FROM github_identities WHERE user_id=?').get(flow.user_id)) return c.redirect(`${origin}/settings?github=conflict`)
        db.prepare('INSERT INTO github_identities(github_id,user_id,login,created_at) VALUES(?,?,?,?) ON CONFLICT(github_id) DO UPDATE SET login=excluded.login').run(githubId, flow.user_id, profile.login, now())
        return c.redirect(`${origin}/settings?github=connected`)
      }
      let userId = linked?.user_id
      if (!userId) {
        const base = profile.login.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
        let username = base.length >= 3 ? base : `gh_${githubId}`
        let suffix = 0
        while (reservedUsernames.includes(username) || db.prepare('SELECT 1 FROM creators WHERE username=?').get(username) || db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
          const tail = `_${githubId}${suffix ? `_${suffix}` : ''}`
          username = `${(base.length >= 3 ? base : 'gh').slice(0, 24 - tail.length)}${tail}`
          suffix++
        }
        userId = randomUUID()
        const name = profile.name?.trim().slice(0, 60) || profile.login.slice(0, 60)
        db.exec('BEGIN IMMEDIATE')
        try {
          db.prepare('INSERT INTO users(id,username,name,password,created_at) VALUES(?,?,?,?,?)').run(userId, username, name, '!github', now())
          db.prepare('INSERT INTO creators(id,user_id,username,name,joined) VALUES(?,?,?,?,?)').run(userId, userId, username, name, now())
          db.prepare('INSERT INTO github_identities VALUES(?,?,?,?)').run(githubId, userId, profile.login, now())
          db.exec('COMMIT')
        } catch (error) { db.exec('ROLLBACK'); throw error }
      } else db.prepare('UPDATE github_identities SET login=? WHERE github_id=?').run(profile.login, githubId)
      const old = getCookie(c, cookieName)
      if (old) db.prepare('DELETE FROM sessions WHERE hash=?').run(hashToken(old))
      session(c, userId)
      return c.redirect(`${origin}${safeNext(flow.next)}`)
    } catch {
      return c.redirect(`${origin}/login?github=failed`)
    }
  })
  app.get('/api/me/auth', c => {
    const user = requireUser(c)
    const row = db.prepare('SELECT password FROM users WHERE id=?').get(user.id) as { password: string }
    return c.json({ github: !!db.prepare('SELECT 1 FROM github_identities WHERE user_id=?').get(user.id), hasPassword: row.password !== '!github', githubAvailable: !!github })
  })
  app.post('/api/auth/register', async c => {
    limit(`auth:${c.get('ip')}`, 8, 900)
    const data = z.object({ username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, 'Use 3 to 24 letters, numbers, or underscores'), name: z.string().trim().min(1).max(60), password: z.string().min(12).max(128) }).strict().parse(await c.req.json())
    const username = data.username.toLowerCase()
    if (reservedUsernames.includes(username) || db.prepare('SELECT 1 FROM creators WHERE username=?').get(username)) fail(409, 'That username is already taken')
    const id = randomUUID()
    const password = await hashPassword(data.password)
    try {
      db.exec('BEGIN IMMEDIATE')
      db.prepare('INSERT INTO users(id,username,name,password,created_at) VALUES(?,?,?,?,?)').run(id, username, data.name, password, now())
      db.prepare('INSERT INTO creators(id,user_id,username,name,joined) VALUES(?,?,?,?,?)').run(id, id, username, data.name, now())
      db.exec('COMMIT')
    } catch { db.exec('ROLLBACK'); fail(409, 'That username is already taken') }
    session(c, id)
    return c.json({ user: { id, username, name: data.name, role: 'member' } }, 201)
  })
  app.post('/api/auth/login', async c => {
    limit(`auth:${c.get('ip')}`, 8, 900)
    const data = z.object({ username: z.string().trim().min(1).max(24), password: z.string().min(1).max(128) }).strict().parse(await c.req.json())
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(data.username) as (User & { password: string }) | undefined
    const dummy = `${'0'.repeat(32)}:${'0'.repeat(128)}`
    const matches = await verifyPassword(data.password, user?.password === '!github' ? dummy : user?.password ?? dummy)
    if (!user || !matches) fail(401, 'Incorrect username or password')
    const old = getCookie(c, cookieName)
    if (old) db.prepare('DELETE FROM sessions WHERE hash=?').run(hashToken(old))
    session(c, user.id)
    return c.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } })
  })
  app.post('/api/auth/logout', c => {
    const token = getCookie(c, cookieName)
    if (token) db.prepare('DELETE FROM sessions WHERE hash=?').run(hashToken(token))
    deleteCookie(c, cookieName, { path: '/', secure: production })
    return c.json({ ok: true })
  })
  app.get('/api/submissions', c => {
    const user = c.get('user')
    const query = c.req.query()
    if (['saved', 'following'].includes(query.feed) && !user) fail(401, 'Sign in to see your collection and following feed')
    let rows = db.prepare('SELECT * FROM submissions WHERE status=\'approved\' ORDER BY approved_at DESC, id DESC LIMIT 2000').all() as Row[]
    const q = (query.q || '').toLowerCase().slice(0, 100)
    rows = rows.filter(row => {
      const s = JSON.parse(row.payload) as SubmissionInput
      if (query.kind && s.kind !== query.kind) return false
      if (query.framework && s.framework !== query.framework) return false
      if (query.category && s.category !== query.category) return false
      if (query.creator && row.creator_id !== query.creator) return false
      if (query.feed === 'saved' && !db.prepare('SELECT 1 FROM saves WHERE user_id=? AND submission_id=?').get(user!.id, row.id)) return false
      if (query.feed === 'following' && !db.prepare('SELECT 1 FROM follows WHERE user_id=? AND creator_id=?').get(user!.id, row.creator_id)) return false
      if (query.feed === 'newcreators' && (row.curated || Number(db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE creator_id=? AND status=\'approved\'').get(row.creator_id)?.n) > 3)) return false
      const creator = db.prepare('SELECT name,username FROM creators WHERE id=?').get(row.creator_id) as { name: string; username: string }
      return !q || `${s.title} ${s.description} ${s.tags.join(' ')} ${creator.name} ${creator.username}`.toLowerCase().includes(q)
    })
    if (query.feed !== 'new' && query.feed !== 'saved') {
      const groups = new Map<string, Row[]>()
      for (const row of rows) groups.set(row.creator_id, [...(groups.get(row.creator_id) || []), row])
      rows = []
      while ([...groups.values()].some(g => g.length)) for (const group of groups.values()) if (group.length) rows.push(group.shift()!)
    }
    const page = Math.max(1, Math.min(100, Number(query.page) || 1))
    const size = 12
    return c.json({ items: rows.slice((page - 1) * size, page * size).map(r => serialize(r, user)), total: rows.length, page })
  })
  app.get('/api/submissions/:id', c => {
    const row = visible(c, c.req.param('id'))
    const user = c.get('user')
    const comments = db.prepare('SELECT c.id,c.body,c.created_at,u.id AS creator_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.submission_id=? ORDER BY c.created_at DESC LIMIT 100').all(row.id).map(r => ({ id: r.id, body: r.body, createdAt: r.created_at, author: publicCreator(db.prepare('SELECT * FROM creators WHERE id=?').get(r.creator_id as string) as CreatorRow) }))
    return c.json({ item: serialize(row, user, row.owner_id === user?.id), comments })
  })
  app.get('/api/submissions/:id/preview', async c => {
    limit(`preview:${c.get('ip')}`, 80, 60)
    const row = visible(c, c.req.param('id'))
    const privileged = c.get('user')?.id === row.owner_id || c.get('user')?.role === 'admin'
    await preview(JSON.parse((privileged ? revisionFor(row.id)?.payload : undefined) ?? row.payload) as SubmissionInput)
    return c.json({ src: `/api/submissions/${row.id}/frame` })
  })
  app.get('/api/submissions/:id/frame', async c => {
    limit(`preview:${c.get('ip')}`, 80, 60)
    const row = visible(c, c.req.param('id'))
    const privileged = c.get('user')?.id === row.owner_id || c.get('user')?.role === 'admin'
    return c.html(await preview(JSON.parse((privileged ? revisionFor(row.id)?.payload : undefined) ?? row.payload) as SubmissionInput))
  })
  app.post('/api/preview', async c => {
    const user = requireUser(c)
    limit(`build:${user.id}`, 60, 60)
    const payload = previewInputSchema.parse(await c.req.json())
    const html = await preview(payload)
    for (const [key, document] of documents) if (document.expires < Date.now()) documents.delete(key)
    while (documents.size >= 80) documents.delete(documents.keys().next().value!)
    const token = randomBytes(24).toString('hex')
    documents.set(token, { html, userId: user.id, expires: Date.now() + 5 * 60_000 })
    return c.json({ src: `/api/previews/${token}/frame` })
  })
  app.get('/api/previews/:token/frame', c => {
    const user = requireUser(c)
    const document = documents.get(c.req.param('token'))
    if (!document || document.expires < Date.now() || document.userId !== user.id) fail(404, 'Preview expired. Edit the code to refresh it.')
    return c.html(document.html)
  })
  app.post('/api/submissions', async c => {
    const user = requireUser(c)
    limit(`draft:${user.id}`, 20, 86400)
    const data = draftSchema.parse(await c.req.json())
    const id = randomUUID()
    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component'}-${id.slice(0, 8)}`
    db.prepare('INSERT INTO submissions(id,slug,owner_id,creator_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, slug, user.id, user.id, JSON.stringify(data), now(), now())
    return c.json({ item: serialize(rowFor(id)!, user, true) }, 201)
  })
  app.put('/api/submissions/:id', async c => {
    const row = owned(c, c.req.param('id'))
    const data = draftSchema.parse(await c.req.json())
    if (row.status === 'approved') {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('DELETE FROM revisions WHERE submission_id=? AND status!=\'approved\'').run(row.id)
        db.prepare('INSERT INTO revisions(id,submission_id,payload,created_at) VALUES(?,?,?,?)').run(randomUUID(), row.id, JSON.stringify(data), now())
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK'); throw e }
    } else db.prepare('UPDATE submissions SET payload=?,status=\'draft\',reason=\'\',updated_at=? WHERE id=?').run(JSON.stringify(data), now(), row.id)
    return c.json({ item: serialize(rowFor(row.id)!, c.get('user'), true) })
  })
  app.post('/api/submissions/:id/submit', async c => {
    const row = owned(c, c.req.param('id'))
    const revision = revisionFor(row.id)
    if (row.status === 'approved' && !revision) fail(409, 'This submission is already published')
    const data = submissionSchema.parse(JSON.parse(revision?.payload ?? row.payload))
    await preview(data)
    if (revision) db.prepare('UPDATE revisions SET status=\'pending\',reason=\'\' WHERE id=?').run(revision.id)
    else db.prepare('UPDATE submissions SET status=\'pending\',reason=\'\',updated_at=? WHERE id=?').run(now(), row.id)
    audit(requireUser(c).id, 'submit', row.id)
    return c.json({ item: serialize(rowFor(row.id)!, c.get('user'), true) })
  })
  app.post('/api/submissions/:id/save', async c => {
    const user = requireUser(c)
    const row = visible(c, c.req.param('id'))
    if (row.status !== 'approved') fail(404, 'Submission not found')
    const { saved } = z.object({ saved: z.boolean() }).strict().parse(await c.req.json())
    if (saved) db.prepare('INSERT OR IGNORE INTO saves VALUES(?,?,?)').run(user.id, row.id, now())
    else db.prepare('DELETE FROM saves WHERE user_id=? AND submission_id=?').run(user.id, row.id)
    return c.json({ saved, saves: Number(db.prepare('SELECT COUNT(*) AS n FROM saves WHERE submission_id=?').get(row.id)?.n) })
  })
  app.post('/api/submissions/:id/comments', async c => {
    const user = requireUser(c)
    const row = visible(c, c.req.param('id'))
    if (row.status !== 'approved') fail(404, 'Submission not found')
    limit(`comment:${user.id}`, 10, 600)
    const { body } = z.object({ body: z.string().trim().min(2).max(2000) }).strict().parse(await c.req.json())
    const id = randomUUID()
    db.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run(id, user.id, row.id, body, now())
    return c.json({ ok: true }, 201)
  })
  app.delete('/api/comments/:id', c => {
    const user = requireUser(c)
    const row = db.prepare('SELECT user_id FROM comments WHERE id=?').get(c.req.param('id'))
    if (!row || (row.user_id !== user.id && user.role !== 'admin')) fail(404, 'Comment not found')
    db.prepare('DELETE FROM comments WHERE id=?').run(c.req.param('id'))
    return c.json({ ok: true })
  })
  app.post('/api/submissions/:id/report', async c => {
    const user = requireUser(c)
    const row = visible(c, c.req.param('id'))
    limit(`report:${user.id}`, 5, 3600)
    const { reason } = z.object({ reason: z.string().trim().min(10).max(1500) }).strict().parse(await c.req.json())
    db.prepare('INSERT INTO reports(id,user_id,submission_id,reason,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), user.id, row.id, reason, now())
    return c.json({ ok: true }, 201)
  })
  app.get('/api/creators', c => {
    const q = (c.req.query('q') || '').toLowerCase().slice(0, 100)
    const creators = (db.prepare('SELECT c.* FROM creators c WHERE EXISTS(SELECT 1 FROM submissions s WHERE s.creator_id=c.id AND s.status=\'approved\') ORDER BY c.joined DESC LIMIT 200').all() as CreatorRow[]).filter(r => `${r.username} ${r.name} ${r.bio}`.toLowerCase().includes(q)).map(r => ({ ...publicCreator(r), works: Number(db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE creator_id=? AND status=\'approved\'').get(r.id)?.n) }))
    return c.json({ creators })
  })
  app.get('/api/creators/:username', c => {
    const creator = db.prepare('SELECT * FROM creators WHERE username=?').get(c.req.param('username')) as CreatorRow | undefined
    if (!creator) fail(404, 'Creator not found')
    const rows = db.prepare('SELECT * FROM submissions WHERE creator_id=? AND status=\'approved\' ORDER BY approved_at DESC').all(creator.id) as Row[]
    const user = c.get('user')
    return c.json({ creator: publicCreator(creator), items: rows.map(r => serialize(r, user)), followers: Number(db.prepare('SELECT COUNT(*) AS n FROM follows WHERE creator_id=?').get(creator.id)?.n), following: !!(user && db.prepare('SELECT 1 FROM follows WHERE user_id=? AND creator_id=?').get(user.id, creator.id)) })
  })
  app.post('/api/creators/:id/follow', async c => {
    const user = requireUser(c)
    const id = c.req.param('id')
    if (id === user.id || !db.prepare('SELECT 1 FROM creators WHERE id=?').get(id)) fail(400, 'Choose another creator to follow')
    const { following } = z.object({ following: z.boolean() }).strict().parse(await c.req.json())
    if (following) db.prepare('INSERT OR IGNORE INTO follows VALUES(?,?)').run(user.id, id)
    else db.prepare('DELETE FROM follows WHERE user_id=? AND creator_id=?').run(user.id, id)
    return c.json({ following })
  })
  app.get('/api/me/submissions', c => {
    const user = requireUser(c)
    const rows = db.prepare('SELECT * FROM submissions WHERE owner_id=? ORDER BY updated_at DESC').all(user.id) as Row[]
    return c.json({ items: rows.map(r => serialize(r, user, true)) })
  })
  app.patch('/api/me', async c => {
    const user = requireUser(c)
    const data = z.object({ name: z.string().trim().min(1).max(60), bio: z.string().trim().max(800), website: z.union([z.literal(''), z.url().max(500).refine(s => s.startsWith('https://'), 'Use HTTPS')]) }).strict().parse(await c.req.json())
    db.prepare('UPDATE users SET name=? WHERE id=?').run(data.name, user.id)
    db.prepare('UPDATE creators SET name=?,bio=?,website=? WHERE user_id=?').run(data.name, data.bio, data.website, user.id)
    return c.json({ user: { ...user, name: data.name } })
  })
  app.post('/api/me/password', async c => {
    const user = requireUser(c)
    limit(`password:${user.id}`, 5, 900)
    const data = z.object({ current: z.string().min(1).max(128), password: z.string().min(12).max(128) }).strict().parse(await c.req.json())
    const row = db.prepare('SELECT password FROM users WHERE id=?').get(user.id) as { password: string }
    if (row.password === '!github') fail(403, 'This account uses GitHub sign-in')
    if (!await verifyPassword(data.current, row.password)) fail(401, 'Current password is incorrect')
    db.prepare('UPDATE users SET password=? WHERE id=?').run(await hashPassword(data.password), user.id)
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)
    session(c, user.id)
    return c.json({ ok: true })
  })
  app.get('/api/moderation', c => {
    admin(c)
    const rows = db.prepare('SELECT * FROM submissions WHERE status=\'pending\' OR id IN(SELECT submission_id FROM revisions WHERE status=\'pending\') ORDER BY updated_at').all() as Row[]
    const reports = db.prepare('SELECT r.*,s.slug,json_extract(s.payload,\'$.title\') AS title FROM reports r JOIN submissions s ON s.id=r.submission_id WHERE r.status=\'open\' ORDER BY r.created_at').all()
    return c.json({ items: rows.map(r => serialize(r, c.get('user'), true)), reports })
  })
  app.post('/api/moderation/:id', async c => {
    const user = admin(c)
    const row = rowFor(c.req.param('id'))
    if (!row) fail(404, 'Submission not found')
    const data = z.object({ action: z.enum(['approve', 'reject', 'remove']), reason: z.string().trim().max(1500).default('') }).strict().parse(await c.req.json())
    if (data.action !== 'approve' && data.reason.length < 10) fail(400, 'Give the creator a reason of at least 10 characters')
    const revision = revisionFor(row.id)
    if (data.action !== 'remove' && (revision?.status ?? row.status) !== 'pending') fail(409, 'Only pending submissions can be reviewed')
    if (data.action === 'approve') {
      const payload = JSON.parse(revision?.payload ?? row.payload) as SubmissionInput
      await preview(payload)
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE submissions SET payload=?,status=\'approved\',reason=\'\',approved_at=?,updated_at=? WHERE id=?').run(JSON.stringify(payload), now(), now(), row.id)
        if (revision) db.prepare('UPDATE revisions SET status=\'approved\',reason=\'\' WHERE id=?').run(revision.id)
        audit(user.id, 'approve', row.id)
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK'); throw e }
    } else {
      if (revision && data.action === 'reject') db.prepare('UPDATE revisions SET status=\'rejected\',reason=? WHERE id=?').run(data.reason, revision.id)
      else {
        db.prepare('UPDATE submissions SET status=\'rejected\',reason=?,updated_at=? WHERE id=?').run(data.reason, now(), row.id)
        db.prepare('DELETE FROM revisions WHERE submission_id=? AND status!=\'approved\'').run(row.id)
      }
      audit(user.id, data.action, row.id, data.reason)
    }
    return c.json({ ok: true })
  })
  app.post('/api/moderation/reports/:id/resolve', c => {
    const user = admin(c)
    db.prepare('UPDATE reports SET status=\'resolved\' WHERE id=?').run(c.req.param('id'))
    audit(user.id, 'resolve-report', c.req.param('id'))
    return c.json({ ok: true })
  })
  return app
}
