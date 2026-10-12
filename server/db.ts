import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function openDatabase(dir = process.env.DATA_DIR || './data') {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(resolve(dir, 'community.sqlite'))
  db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS creators (id TEXT PRIMARY KEY, user_id TEXT UNIQUE REFERENCES users(id), username TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', curated INTEGER NOT NULL DEFAULT 0, joined TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS github_identities (github_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, login TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_flows (hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, next TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, owner_id TEXT REFERENCES users(id), creator_id TEXT NOT NULL REFERENCES creators(id), status TEXT NOT NULL DEFAULT 'draft', reason TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL, curated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT);
    CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS saves (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(user_id,submission_id));
    CREATE TABLE IF NOT EXISTS follows (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE, PRIMARY KEY(user_id,creator_id));
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), submission_id TEXT NOT NULL REFERENCES submissions(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status,approved_at);
    CREATE INDEX IF NOT EXISTS comments_submission ON comments(submission_id,created_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
  `)
  return db
}
export type DB = ReturnType<typeof openDatabase>
