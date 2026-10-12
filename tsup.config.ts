import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'server/index.ts', admin: 'scripts/admin.ts', backup: 'scripts/backup.ts' },
  format: ['esm'], outDir: 'build', splitting: false,
  external: ['esbuild', '@hono/node-server', 'node:sqlite'],
  removeNodeProtocol: false,
})
