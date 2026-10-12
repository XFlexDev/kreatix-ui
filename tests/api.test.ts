import test from 'node:test'
import assert from 'node:assert/strict'
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
    await t.test('Private drafts, ownership, and moderation', async () => {
      const r = await request('/submissions', 'POST', payload, owner); assert.equal(r.status, 201); id = (await r.json()).item.id
      assert.equal((await request(`/submissions/${id}`)).status, 404)
      assert.equal((await request(`/submissions/${id}`, 'PUT', payload, other)).status, 404)
      assert.equal((await request(`/submissions/${id}/submit`, 'POST', {}, other)).status, 404)
      assert.equal((await request(`/moderation/${id}`, 'POST', { action: 'approve' }, other)).status, 403)
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
