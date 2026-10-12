import { writeFile } from 'node:fs/promises'

const commit = 'f9f62c61207b2dd3210476dd98af3c9a5be24094'
const entries = [
  { file: 'text/letter-swap-forward-anim', title: 'Letter swap', component: 'LetterSwapForward', demo: '<LetterSwapForward label="Make it yours." transition={{type:"tween",duration:0.35,ease:[0.16,1,0.3,1]}} staggerDuration={0.018}/>', category: 'Text', description: 'A letter-by-letter hover interaction. Each character rolls into its next position, with adjustable direction, timing, and stagger.' },
  { file: 'text/scramble-hover', title: 'Scramble hover', component: 'ScrambleHover', demo: '<ScrambleHover text="Unexpected." maxIterations={6}/>', category: 'Text', description: 'A hover-triggered text scramble that resolves back to your original words. Tune the character set, sequence, and reveal direction.' },
  { file: 'text/underline-comes-in-goes-out', title: 'Passing underline', component: 'ComesInGoesOutUnderline', demo: '<ComesInGoesOutUnderline underlineHeightRatio={0.04}>A little emphasis.</ComesInGoesOutUnderline>', category: 'Text', description: 'An underline that travels across a word instead of switching on. A small interaction for links, navigation, and expressive typography.' },
  { file: 'text/typewriter', title: 'Typewriter', component: 'Typewriter', demo: '<Typewriter text={["Hello, stranger.","Stay a little."]} speed={80} waitTime={2400}/>', category: 'Text', description: 'Text that types, pauses, and deletes. Supports multiple phrases, custom cursors, and configurable timing.' },
]
const items = []
for (const e of entries) {
  const response = await fetch(`https://raw.githubusercontent.com/danielpetho/fancy/${commit}/src/fancy/components/${e.file}.tsx`)
  if (!response.ok) throw new Error(`Failed to fetch ${e.file}: ${response.status}`)
  const original = await response.text()
  const adapted = original.replace(/import \{ cn \} from "@\/lib\/utils"/g, 'const cn = (...values: unknown[]) => values.filter(Boolean).join(" ")').replace('import cn from "clsx"', 'const cn = (...values: unknown[]) => values.filter(Boolean).join(" ")')
  const code = `// MIT License. Copyright (c) 2024 Daniel Petho.\n// Source: https://github.com/danielpetho/fancy/blob/${commit}/src/fancy/components/${e.file}.tsx\n// Local adaptation: class-name utility and example wrapper.\n${adapted}\nfunction App(){return <div className="demo">${e.demo}</div>}`
  items.push({ id: `fancy-${e.file.split('/').at(-1)}`, slug: e.title.toLowerCase().replaceAll(' ', '-'), payload: {
    title: e.title, description: e.description, kind: 'component', framework: 'React', category: e.category, license: 'MIT',
    sourceUrl: `https://github.com/danielpetho/fancy/blob/${commit}/src/fancy/components/${e.file}.tsx`,
    demoUrl: `https://fancycomponents.dev/docs/components/${e.file}`, install: '', tags: ['typography', 'interaction', 'motion'], previewMode: 'react', code,
    css: '.demo{font-size:clamp(28px,5vw,52px);letter-spacing:-.035em;text-align:center;font-weight:500;padding:10px}.flex{display:flex}.justify-center{justify-content:center}.items-center{align-items:center}.relative{position:relative}.absolute{position:absolute}.overflow-hidden{overflow:hidden}.whitespace-pre{white-space:pre}.whitespace-pre-wrap{white-space:pre-wrap}.inline-block{display:inline-block}.inline{display:inline}.bg-current{background:currentColor}.w-0{width:0}.left-0{left:0}.right-0{right:0}.tracking-tight{letter-spacing:-.03em}.cursor-pointer{cursor:pointer}.hidden{display:none}.ml-1{margin-left:4px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
    js: '', freeOnly: true, attribution: 'Daniel Petho, Fancy Components. MIT. Community-listed example, not a submission or endorsement by the maintainer.'
  } })
}
items.push({ id: 'fancy-library', slug: 'fancy-components', payload: { title: 'Fancy Components', description: 'A free, open-source collection of expressive React components and microinteractions by Daniel Petho. Browse the documentation for installation and examples.', kind: 'library', framework: 'React', category: 'Motion', license: 'MIT', sourceUrl: 'https://github.com/danielpetho/fancy', demoUrl: 'https://fancycomponents.dev', install: '', tags: ['interaction', 'typography', 'motion'], previewMode: 'link', code: '', css: '', js: '', freeOnly: true, attribution: 'Daniel Petho. Community-listed library, not an endorsement or maintainer-submitted listing.' } })
await writeFile('server/seed-data.json', JSON.stringify(items, null, 2) + '\n')
console.log(`Imported ${items.length} verified Fancy Components entries at ${commit}`)
