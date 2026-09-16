import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type PropertyCandidateRecord = {
  id: string;
  name: string;
  locality: string;
  source: string;
  createdAt: string;
};

export function openDatabase(path: string) {
  const resolved = path === ':memory:' ? path : resolve(path);
  if (resolved !== ':memory:')
    mkdirSync(dirname(resolved), { recursive: true });
  const database = new DatabaseSync(resolved);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS property_candidates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, locality TEXT NOT NULL,
      source TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);
  return database;
}

export class PropertyCandidateRepository {
  constructor(private readonly database: DatabaseSync) {}
  save(record: PropertyCandidateRecord) {
    this.database
      .prepare(
        'INSERT INTO property_candidates(id, name, locality, source, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        record.id,
        record.name,
        record.locality,
        record.source,
        record.createdAt,
      );
  }
  list(): PropertyCandidateRecord[] {
    return this.database
      .prepare(
        'SELECT id, name, locality, source, created_at AS createdAt FROM property_candidates ORDER BY created_at DESC, id ASC',
      )
      .all() as PropertyCandidateRecord[];
  }
}
