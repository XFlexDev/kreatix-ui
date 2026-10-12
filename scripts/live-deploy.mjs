import { watch } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const [host, directory, identity] = process.argv.slice(2)
if (!host || !directory || !identity || !directory.startsWith('/')) throw new Error('Usage: node scripts/live-deploy.mjs user@host /absolute/deploy/directory /path/to/ssh-key')
const sshArgs = ['-i', identity, '-o', 'BatchMode=yes']
const ssh = `ssh -i ${identity} -o BatchMode=yes`
if ([host, directory, identity].some(v => !/^[A-Za-z0-9_@./:-]+$/.test(v))) throw new Error('Use simple paths without spaces or shell characters')
let timer
let running = false
let pending = false
let backend = false
async function deploy() {
  if (running) { pending = true; return }
  running = true
  const restart = backend
  backend = false
  try {
    console.log('Building live update…')
    await run('npm', ['run', 'build'], { maxBuffer: 2_000_000 })
    await run('rsync', ['-az', '-e', ssh, 'dist/assets/', `${host}:${directory}/dist/assets/`])
    await run('rsync', ['-az', '-e', ssh, 'dist/fonts/', `${host}:${directory}/dist/fonts/`])
    await run('rsync', ['-az', '-e', ssh, 'dist/index.html', 'dist/favicon.svg', `${host}:${directory}/dist/`])
    if (restart) {
      await run('rsync', ['-az', '-e', ssh, 'build/', `${host}:${directory}/build/`])
      await run('ssh', [...sshArgs, host, 'systemctl restart kreatix-ui'])
    }
    console.log(`Live update published at ${new Date().toISOString()}`)
  } catch (e) { console.error('Update not published:', e.stderr || e.message) }
  finally { running = false; if (pending) { pending = false; void deploy() } }
}
for (const directory of ['src', 'server', 'public']) watch(directory, { recursive: true }, (_event, file) => {
  if (!file || file.endsWith('~')) return
  if (directory === 'server') backend = true
  clearTimeout(timer)
  timer = setTimeout(deploy, 1500)
})
console.log('Watching source changes. Only successful production builds are deployed.')
