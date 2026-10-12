import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/db'
import { createApp } from '../server/app'
import { seed } from '../server/seed'

test('Persisted lifecycle, permissions, sessions, and moderated revisions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'kreatix-ui-test-'))
  const db = openDatabase(dir); seed(db)
  const origin = 'https://ui.test'
  const app = createApp(db, { origin, production: true })
  const request = (path: string, method = 'GET', data?: unknown, cookie = '') => app.request(`http://localhost/api${path}`, { method, headers: { origin, 'content-type': 'application/json', 'x-kreatix-ui': '1', cookie }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  let owner = '', other = '', admin = '', id = '', ownerId = ''
  const payload = { title: 'Counter button', description: 'A button that keeps a count locally.', kind: 'component', framework: 'HTML/CSS', category: 'Buttons', license: 'MIT', sourceUrl: 'https://github.com/example/counter', previewMode: 'html', code: '<button>Original version</button>', css: '', js: '', freeOnly: true }
  try {
    await t.test('Public discovery; CSRF protection', async () => {
      const r = await request('/submissions'); assert.equal(r.status, 200); assert.equal((await r.json()).total, 5)
      assert.equal((await app.request('http://localhost/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403)
      assert.equal((await request('/moderation')).status, 401)
    })
    await t.test('Registration, password hashes, and secure cookies', async () => {
      const register = async (username: string) => { const r = await request('/auth/register', 'POST', { username, name: username, password: 'test-password-twelve-characters' }); assert.equal(r.status, 201); assert.match(r.headers.get('set-cookie')!, /HttpOnly/); assert.match(r.headers.get('set-cookie')!, /Secure/); return r.headers.get('set-cookie')!.split(';')[0] }
      owner = await register('maker'); other = await register('visitor'); admin = await register('reviewer')
      ownerId = (await (await request('/session', 'GET', undefined, owner)).json()).user.id
      assert.notEqual(db.prepare('SELECT password FROM users WHERE id=?').get(ownerId)!.password, 'test-password-twelve-characters')
      db.prepare('UPDATE users SET role=\'admin\' WHERE username=\'reviewer\'').run()
      assert.equal((await request('/moderation', 'GET', undefined, other)).status, 403)
    })
    await t.test('Private editor sandbox', async () => {
      const r = await request('/preview', 'POST', { previewMode: 'html', code: '<p>Private code</p>' }, owner); assert.equal(r.status, 200)
      const src = (await r.json()).src as string
      const frame = await request(src.slice(4), 'GET', undefined, owner); assert.equal(frame.status, 200); assert.match(frame.headers.get('content-security-policy')!, /sandbox allow-scripts/)
      assert.equal((await request(src.slice(4), 'GET', undefined, other)).status, 404)
    })
    await t.test('Incomplete drafts persist privately but cannot be submitted or approved', async () => {
      const incomplete = { ...payload, title: '', description: '', sourceUrl: '', code: '', freeOnly: false }
      const created = await request('/submissions', 'POST', incomplete, owner)
      assert.equal(created.status, 201)
      const draftId = (await created.json()).item.id
      assert.equal((await request(`/submissions/${draftId}`)).status, 404)
      const retrieved = (await (await request(`/submissions/${draftId}`, 'GET', undefined, owner)).json()).item
      assert.equal(retrieved.title, ''); assert.equal(retrieved.freeOnly, false)
      const submitted = await request(`/submissions/${draftId}/submit`, 'POST', {}, owner)
      assert.equal(submitted.status, 400)
      const fields = (await submitted.json()).fields
      for (const field of ['title', 'description', 'sourceUrl', 'freeOnly']) assert.ok(fields.some((issue: { path: string[] }) => issue.path[0] === field))
      assert.equal((await request(`/moderation/${draftId}`, 'POST', { action: 'approve' }, admin)).status, 409)
      assert.equal((await request(`/submissions/${draftId}`, 'PUT', { ...incomplete, title: 'Work in progress' }, owner)).status, 200)
      assert.equal((await request('/submissions', 'POST', { ...incomplete, sourceUrl: 'http://github.com/example' }, owner)).status, 400)
      assert.equal((await request('/submissions', 'POST', { ...incomplete, code: 'x'.repeat(80_001) }, owner)).status, 400)
    })
    await t.test('Private drafts, ownership, and moderation', async () => {
      const r = await request('/submissions', 'POST', payload, owner); assert.equal(r.status, 201); id = (await r.json()).item.id
      assert.equal((await request(`/submissions/${id}`)).status, 404)
      assert.equal((await request(`/submissions/${id}`, 'PUT', payload, other)).status, 404)
      assert.equal((await request(`/submissions/${id}/submit`, 'POST', {}, other)).status, 404)
      assert.equal((await request(`/moderation/${id}`, 'POST', { action: 'approve' }, other)).status, 403)
      assert.equal((await request(`/submissions/${id}/submit`, 'POST', {}, owner)).status, 200)
      const edited = await request(`/submissions/${id}`, 'PUT', payload, owner)
      assert.equal((await edited.json()).item.status, 'draft')
      assert.equal((await request(`/moderation/${id}`, 'POST', { action: 'approve' }, admin)).status, 409)
      assert.equal((await request(`/submissions/${id}/submit`, 'POST', {}, owner)).status, 200)
      assert.equal((await request(`/moderation/${id}`, 'POST', { action: 'approve' }, admin)).status, 200)
      assert.equal((await request(`/submissions/${id}`)).status, 200)
    })
    await t.test('Saves, comments, and follows', async () => {
      assert.equal((await request(`/submissions/${id}/save`, 'POST', { saved: true }, other)).status, 200)
      assert.equal((await (await request('/submissions?feed=saved', 'GET', undefined, other)).json()).total, 1)
      assert.equal((await request(`/submissions/${id}/comments`, 'POST', { body: 'Useful component, thank you.' }, other)).status, 201)
      const comment = (await (await request(`/submissions/${id}`, 'GET', undefined, owner)).json()).comments[0]
      assert.equal((await request(`/comments/${comment.id}`, 'DELETE', {}, owner)).status, 404)
      assert.equal((await request(`/comments/${comment.id}`, 'DELETE', {}, other)).status, 200)
      assert.equal((await request(`/creators/${ownerId}/follow`, 'POST', { following: true }, other)).status, 200)
    })
    await t.test('Public version remains unchanged while revisions await review', async () => {
      const draftRevision = await request(`/submissions/${id}`, 'PUT', { ...payload, description: '', freeOnly: false }, owner)
      assert.equal(draftRevision.status, 200)
      assert.equal((await draftRevision.json()).item.published, true)
      assert.equal((await request(`/submissions/${id}/submit`, 'POST', {}, owner)).status, 400)
      assert.match(await (await request(`/submissions/${id}/frame`)).text(), /Original version/)
      assert.equal((await request(`/submissions/${id}`, 'PUT', { ...payload, code: '<button>Revised version</button>' }, owner)).status, 200)
      assert.match(await (await request(`/submissions/${id}/frame`)).text(), /Original version/)
      assert.match(await (await request(`/submissions/${id}/frame`, 'GET', undefined, admin)).text(), /Revised version/)
      assert.equal((await request(`/submissions/${id}/submit`, 'POST', {}, owner)).status, 200)
      assert.equal((await request(`/moderation/${id}`, 'POST', { action: 'approve' }, admin)).status, 200)
      assert.match(await (await request(`/submissions/${id}/frame`)).text(), /Revised version/)
    })
    await t.test('Reports and logout', async () => {
      assert.equal((await request(`/submissions/${id}/report`, 'POST', { reason: 'Attribution needs another source link.' }, other)).status, 201)
      const report = (await (await request('/moderation', 'GET', undefined, admin)).json()).reports[0]
      assert.equal((await request(`/moderation/reports/${report.id}/resolve`, 'POST', {}, admin)).status, 200)
      assert.equal((await request('/auth/logout', 'POST', {}, owner)).status, 200)
      assert.equal((await (await request('/session', 'GET', undefined, owner)).json()).user, null)
    })
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('GitHub OAuth protects state, identity, account linking, and password login', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kreatix-github-test-'))
  const db = openDatabase(dir)
  let githubId = 12345
  let login = 'maker'
  let calls = 0
  let expectedChallenge = ''
  const githubFetch: typeof fetch = async (input, init) => {
    calls++
    if (String(input) === 'https://github.com/login/oauth/access_token') {
      const body = new URLSearchParams(init?.body as string)
      assert.equal(body.get('client_secret'), 'test-secret')
      assert.equal(body.get('redirect_uri'), 'https://ui.test/api/auth/github/callback')
      assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), expectedChallenge)
      return Response.json({ access_token: 'test-token', token_type: 'bearer' })
    }
    assert.equal(String(input), 'https://api.github.com/user')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token')
    return Response.json({ id: githubId, login, name: 'GitHub creator' })
  }
  const app = createApp(db, { origin: 'https://ui.test', production: true, github: { clientId: 'test-client', clientSecret: 'test-secret', fetch: githubFetch } })
  const request = (path: string, cookie = '', init: RequestInit = {}) => app.request(`https://ui.test/api${path}`, { ...init, headers: { 'content-type': 'application/json', origin: 'https://ui.test', 'x-kreatix-ui': '1', cookie } })
  const sessionCookie = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith('__Host-kreatix_ui='))!.split(';')[0]
  const begin = async (path = '/auth/github', cookie = '') => {
    const response = await request(path, cookie)
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location')!)
    assert.equal(location.origin, 'https://github.com')
    assert.equal(location.pathname, '/login/oauth/authorize')
    assert.equal(location.searchParams.get('scope'), 'read:user')
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256')
    expectedChallenge = location.searchParams.get('code_challenge')!
    return { state: location.searchParams.get('state')!, cookie: response.headers.getSetCookie().find(value => value.startsWith('__Host-kreatix_ui_oauth='))!.split(';')[0] }
  }
  const finish = async (state: string, cookie: string) => request(`/auth/github/callback?code=test-code&state=${state}`, cookie)
  try {
    assert.deepEqual(await (await request('/auth/providers')).json(), { github: true })
    const register = await request('/auth/register', '', { method: 'POST', body: JSON.stringify({ username: 'maker', name: 'Local maker', password: 'test-password-twelve-characters' }) })
    assert.equal(register.status, 201)
    const localCookie = sessionCookie(register)
    const localId = (await (await request('/session', localCookie)).json()).user.id as string

    const invalid = await begin()
    assert.equal((await finish('wrong-state', invalid.cookie)).status, 302)
    assert.equal(calls, 0)
    assert.equal((await finish(invalid.state, invalid.cookie)).status, 302)
    assert.equal(calls, 2)

    const fresh = await begin('/auth/github?next=https://attacker.test')
    const loginResult = await finish(fresh.state, fresh.cookie)
    assert.equal(loginResult.headers.get('location'), 'https://ui.test/workspace')
    const githubCookie = sessionCookie(loginResult)
    const githubUser = (await (await request('/session', githubCookie)).json()).user
    assert.notEqual(githubUser.id, localId)
    assert.notEqual(githubUser.username, 'maker')
    assert.equal((await request('/auth/login', '', { method: 'POST', body: JSON.stringify({ username: githubUser.username, password: 'invalid-password' }) })).status, 401)
    assert.equal((await request('/me/password', githubCookie, { method: 'POST', body: JSON.stringify({ current: 'x', password: 'test-password-twelve-characters' }) })).status, 403)
    assert.equal((await finish(fresh.state, fresh.cookie)).headers.get('location'), 'https://ui.test/login?github=failed')
    assert.equal(calls, 4)

    const linkExisting = await begin('/auth/github?link=1', localCookie)
    githubId = 67890
    login = 'linked-creator'
    const linkedResult = await finish(linkExisting.state, `${localCookie}; ${linkExisting.cookie}`)
    assert.equal(linkedResult.headers.get('location'), 'https://ui.test/settings?github=connected')
    assert.equal((await (await request('/me/auth', localCookie)).json()).github, true)
    const reauth = await begin()
    const reauthResult = await finish(reauth.state, reauth.cookie)
    const reauthUser = (await (await request('/session', sessionCookie(reauthResult))).json()).user
    assert.equal(reauthUser.id, localId)
    assert.equal(reauthUser.username, 'maker')

    const foreign = await begin('/auth/github?link=1', githubCookie)
    const conflict = await finish(foreign.state, `${githubCookie}; ${foreign.cookie}`)
    assert.equal(conflict.headers.get('location'), 'https://ui.test/settings?github=conflict')
    assert.equal((await (await request('/me/auth', githubCookie)).json()).github, true)

    const unauthorized = await begin('/auth/github?link=1', localCookie)
    assert.equal((await finish(unauthorized.state, unauthorized.cookie)).headers.get('location'), 'https://ui.test/login?github=failed')
    const beforeInvalid = calls
    assert.equal((await finish('é'.repeat(43), unauthorized.cookie)).headers.get('location'), 'https://ui.test/login?github=failed')
    const expired = await begin()
    db.prepare('UPDATE oauth_flows SET expires=0 WHERE hash=?').run(createHash('sha256').update(expired.state).digest('hex'))
    assert.equal((await finish(expired.state, expired.cookie)).headers.get('location'), 'https://ui.test/login?github=failed')
    const denied = await begin()
    assert.equal((await request(`/auth/github/callback?error=access_denied&state=${denied.state}`, denied.cookie)).headers.get('location'), 'https://ui.test/login?github=failed')
    const control = await begin('/auth/github?next=/%00')
    assert.equal((db.prepare('SELECT next FROM oauth_flows WHERE hash=?').get(createHash('sha256').update(control.state).digest('hex')) as { next: string }).next, '/workspace')
    assert.equal(calls, beforeInvalid)
    const disabled = createApp(db, { github: false })
    assert.deepEqual(await (await disabled.request('http://localhost/api/auth/providers')).json(), { github: false })
    assert.equal((await disabled.request('http://localhost/api/auth/github')).status, 503)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
