import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type PropertyCandidateRecord = {
  id: string;
  name: string;
  locality: string;
  propertyType: 'paying_guest' | 'hostel' | 'coaching_institute';
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
    CREATE TABLE IF NOT EXISTS account_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('student', 'parent_guardian', 'owner_manager', 'professional')),
      review_status TEXT NOT NULL CHECK(review_status IN ('active', 'pending_review')),
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);
  const candidateColumns = database
    .prepare('PRAGMA table_info(property_candidates)')
    .all() as Array<{ name: string }>;
  if (!candidateColumns.some((column) => column.name === 'property_type'))
    database.exec(
      "ALTER TABLE property_candidates ADD COLUMN property_type TEXT NOT NULL DEFAULT 'paying_guest'",
    );
  database.exec(
    "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
  );
  return database;
}

export type AccountProfileRecord = {
  role: 'student' | 'parent_guardian' | 'owner_manager' | 'professional';
  reviewStatus: 'active' | 'pending_review';
};
export class AccountProfileRepository {
  constructor(private readonly database: DatabaseSync) {}
  get(userId: string): AccountProfileRecord | null {
    return (
      (this.database
        .prepare(
          'SELECT role, review_status AS reviewStatus FROM account_profiles WHERE user_id = ?',
        )
        .get(userId) as AccountProfileRecord | undefined) ?? null
    );
  }
  save(
    userId: string,
    role: AccountProfileRecord['role'],
    now: Date,
  ): AccountProfileRecord {
    const reviewStatus =
      role === 'owner_manager' || role === 'professional'
        ? 'pending_review'
        : 'active';
    this.database
      .prepare(
        `INSERT INTO account_profiles(user_id, role, review_status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, review_status = excluded.review_status, updated_at = excluded.updated_at`,
      )
      .run(userId, role, reviewStatus, now.toISOString());
    return { role, reviewStatus };
  }
}

export class PropertyCandidateRepository {
  constructor(private readonly database: DatabaseSync) {}
  save(record: PropertyCandidateRecord) {
    this.database
      .prepare(
        'INSERT INTO property_candidates(id, name, locality, property_type, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.id,
        record.name,
        record.locality,
        record.propertyType,
        record.source,
        record.createdAt,
      );
  }
  list(): PropertyCandidateRecord[] {
    return this.database
      .prepare(
        'SELECT id, name, locality, property_type AS propertyType, source, created_at AS createdAt FROM property_candidates ORDER BY created_at DESC, id ASC',
      )
      .all() as PropertyCandidateRecord[];
  }
}
