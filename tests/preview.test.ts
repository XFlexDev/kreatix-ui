import test from 'node:test'
import assert from 'node:assert/strict'
import { compilePreview } from '../server/preview'
import { submissionSchema } from '../server/schema'

test('HTML preview isolates network and forms and escapes closing script tags', async () => {
  const html = await compilePreview({ previewMode: 'html', code: '<button>Hello</button>', css: '', js: 'window.example="</script><img>"' })
  assert.match(html, /connect-src 'none'/); assert.match(html, /form-action 'none'/)
  assert.match(html, /<button>Hello<\/button>/); assert.ok(!html.includes('window.example="</script>'))
})
test('React and Motion preview compiles', async () => {
  const html = await compilePreview({ previewMode: 'react', code: 'import React from "react"; import {motion} from "motion/react"; function App(){return <motion.button>Example</motion.button>}', css: '', js: '' })
  assert.match(html, /<div id="root">/); assert.match(html, /Example/)
})
test('Missing React App produces actionable guidance, and previews report runtime errors', async () => {
  await assert.rejects(compilePreview({ previewMode: 'react', code: '<button>HTML</button>', css: '', js: '' }), /component named App/)
  const html = await compilePreview({ previewMode: 'html', code: '<button>Example</button>', css: '', js: 'throw new Error("broken")' })
  assert.match(html, /kreatix-preview-error/)
  assert.match(html, /unhandledrejection/)
})
test('React preview refuses server, relative, remote, and arbitrary dependency imports', async () => {
  for (const path of ['node:fs', './package.json', '/etc/passwd', 'https://example.com/x.js', 'hono', 'file:///etc/passwd']) await assert.rejects(compilePreview({ previewMode: 'react', code: `import value from ${JSON.stringify(path)}; function App(){return <div>{String(value)}</div>}`, css: '', js: '' }), /supported|allowed/)
})
test('Syntax errors, code size limits, and free-only schema', async () => {
  await assert.rejects(compilePreview({ previewMode: 'react', code: 'function App( { return', css: '', js: '' }))
  const base = { title: 'Example', description: 'A useful example component.', kind: 'component', framework: 'React', category: 'Buttons', license: 'MIT', sourceUrl: 'https://github.com/example/work', previewMode: 'react', code: 'function App(){return <button>Example</button>}', freeOnly: true }
  assert.equal(submissionSchema.safeParse(base).success, true)
  for (const update of [{ freeOnly: false }, { code: 'x'.repeat(80_001) }, { license: 'Commercial' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:pass@example.com/' }, { previewMode: 'link' }]) assert.equal(submissionSchema.safeParse({ ...base, ...update }).success, false)
})
