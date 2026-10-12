import { backup } from 'node:sqlite'
import { resolve } from 'node:path'
import { openDatabase } from '../server/db'
const destination = process.argv[2]
if (!destination) throw new Error('Usage: npm run backup -- /existing/directory/community-backup.sqlite')
const db = openDatabase()
await backup(db, resolve(destination))
db.close()
console.log('Consistent SQLite backup created')
