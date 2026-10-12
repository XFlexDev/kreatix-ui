import type { DB } from './db'
import entries from './seed-data.json'

export function seed(db: DB) {
  const joined = '2026-10-12T00:00:00.000Z'
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('INSERT OR IGNORE INTO creators(id,username,name,bio,website,curated,joined) VALUES(?,?,?,?,?,1,?)').run('fancy-creator', 'danielpetho', 'Daniel Petho', 'Creator of Fancy Components. These projects were listed by the community, not submitted by the maintainer.', 'https://danielpetho.com', joined)
    const insert = db.prepare('INSERT OR IGNORE INTO submissions(id,slug,creator_id,status,payload,curated,created_at,updated_at,approved_at) VALUES(?,?,?,\'approved\',?,1,?,?,?)')
    for (const entry of entries) insert.run(entry.id, entry.slug, 'fancy-creator', JSON.stringify(entry.payload), joined, joined, joined)
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
}
