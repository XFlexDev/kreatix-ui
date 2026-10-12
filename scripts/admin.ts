import { openDatabase } from '../server/db'
const username = process.argv[2]
if (!username) throw new Error('Usage: npm run admin -- username')
const db = openDatabase()
const result = db.prepare('UPDATE users SET role=\'admin\' WHERE username=?').run(username)
if (!result.changes) throw new Error('User not found. Register the account first.')
console.log(`Moderator access granted to ${username}`)
db.close()
