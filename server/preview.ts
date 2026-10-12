import { build } from 'esbuild'
import { resolve } from 'node:path'
import type { SubmissionInput } from './schema'

const header = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`
const style = `html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101010;color:#f4f4f4;font-family:Arial,sans-serif;padding:24px}#root{width:100%;display:grid;place-items:center}button,input{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #fff;outline-offset:5px}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}`
const scriptEscape = (s: string) => s.replace(/<\/script/gi, '<\\/script')
const styleEscape = (s: string) => s.replace(/<\/style/gi, '<\\/style')

export async function compilePreview(s: Pick<SubmissionInput, 'previewMode' | 'code' | 'css' | 'js'>) {
  if (s.previewMode === 'link') return ''
  let body = s.code
  let script = s.js
  if (s.previewMode === 'react') {
    const entry = `${s.code}\nimport {createRoot as __createRoot} from 'react-dom/client';__createRoot(document.getElementById('root')).render(<App/>);`
    const result = await build({
      stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'component.tsx' },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', minify: true,
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      plugins: [{ name: 'fixed-imports', setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          if ((args.importer === 'component.tsx' || args.importer === resolve('component.tsx')) && !['react', 'react/jsx-runtime', 'react-dom/client', 'motion/react'].includes(args.path)) return { errors: [{ text: `Only react, react-dom/client, and motion/react imports are supported. Unsupported: ${args.path}` }] }
          if (/^(https?:|node:|file:)/.test(args.path)) return { errors: [{ text: 'Remote and server imports are not allowed' }] }
          return undefined
        })
      } }],
    })
    script = result.outputFiles[0].text
    body = '<div id="root"></div>'
  }
  return `<!doctype html><html lang="en"><head>${header}<style>${style}\n${styleEscape(s.css)}</style></head><body>${body}<script>${scriptEscape(script)}</script></body></html>`
}
