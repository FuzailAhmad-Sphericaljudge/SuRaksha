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
    CREATE TABLE IF NOT EXISTS property_claims (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES property_candidates(id) ON DELETE CASCADE,
      claimant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      evidence_note TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn')),
      created_at TEXT NOT NULL,
      UNIQUE(candidate_id, claimant_user_id)
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    CREATE TABLE IF NOT EXISTS managed_buildings (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES property_candidates(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      floors INTEGER NOT NULL CHECK(floors BETWEEN 1 AND 300),
      created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    CREATE TABLE IF NOT EXISTS evidence_uploads (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
      moderation_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    CREATE TABLE IF NOT EXISTS issue_reports (
      id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES property_candidates(id),
      building_id TEXT REFERENCES managed_buildings(id), reporter_user_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK(visibility IN ('private_review', 'public_redacted', 'confidential')),
      status TEXT NOT NULL DEFAULT 'submitted', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report_evidence (
      report_id TEXT NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL REFERENCES evidence_uploads(id), PRIMARY KEY(report_id, evidence_id)
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES (8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
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
  const claimColumns = database
    .prepare('PRAGMA table_info(property_claims)')
    .all() as Array<{ name: string }>;
  if (!claimColumns.some((column) => column.name === 'review_reason'))
    database.exec('ALTER TABLE property_claims ADD COLUMN review_reason TEXT');
  if (!claimColumns.some((column) => column.name === 'reviewed_at'))
    database.exec('ALTER TABLE property_claims ADD COLUMN reviewed_at TEXT');
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
  search(
    query: string,
    propertyType?: PropertyCandidateRecord['propertyType'],
  ): PropertyCandidateRecord[] {
    const normalized = query.trim().toLowerCase();
    return this.database
      .prepare(
        `SELECT id, name, locality, property_type AS propertyType, source, created_at AS createdAt
        FROM property_candidates
        WHERE (? = '' OR instr(lower(name || ' ' || locality), ?) > 0)
          AND (? IS NULL OR property_type = ?)
        ORDER BY created_at DESC, id ASC LIMIT 50`,
      )
      .all(
        normalized,
        normalized,
        propertyType ?? null,
        propertyType ?? null,
      ) as PropertyCandidateRecord[];
  }
}

export type PropertyClaimRecord = {
  id: string;
  candidateId: string;
  candidateName: string;
  claimantUserId: string;
  evidenceNote: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  reviewReason: string | null;
  reviewedAt: string | null;
};
export class PropertyClaimRepository {
  constructor(private readonly database: DatabaseSync) {}
  save(
    record: Omit<
      PropertyClaimRecord,
      'candidateName' | 'reviewReason' | 'reviewedAt'
    >,
  ) {
    this.database
      .prepare(
        'INSERT INTO property_claims(id, candidate_id, claimant_user_id, evidence_note, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.id,
        record.candidateId,
        record.claimantUserId,
        record.evidenceNote,
        record.status,
        record.createdAt,
      );
  }
  listForUser(userId: string): PropertyClaimRecord[] {
    return this.database
      .prepare(
        `SELECT property_claims.id, candidate_id AS candidateId, property_candidates.name AS candidateName,
      claimant_user_id AS claimantUserId, evidence_note AS evidenceNote, status, property_claims.created_at AS createdAt, review_reason AS reviewReason, reviewed_at AS reviewedAt
      FROM property_claims JOIN property_candidates ON property_candidates.id = property_claims.candidate_id
      WHERE claimant_user_id = ? ORDER BY property_claims.created_at DESC`,
      )
      .all(userId) as PropertyClaimRecord[];
  }
  listPending(): PropertyClaimRecord[] {
    return this.database
      .prepare(
        `SELECT property_claims.id, candidate_id AS candidateId, property_candidates.name AS candidateName,
      claimant_user_id AS claimantUserId, evidence_note AS evidenceNote, status, property_claims.created_at AS createdAt, review_reason AS reviewReason, reviewed_at AS reviewedAt
      FROM property_claims JOIN property_candidates ON property_candidates.id = property_claims.candidate_id
      WHERE status IN ('submitted', 'under_review') ORDER BY property_claims.created_at ASC`,
      )
      .all() as PropertyClaimRecord[];
  }
  decide(
    id: string,
    status: 'approved' | 'rejected',
    reason: string,
    reviewedAt: string,
  ) {
    const claim = this.database
      .prepare(
        'SELECT claimant_user_id AS claimantUserId FROM property_claims WHERE id = ?',
      )
      .get(id) as { claimantUserId: string } | undefined;
    if (!claim) return false;
    this.database.exec('BEGIN');
    try {
      this.database
        .prepare(
          'UPDATE property_claims SET status = ?, review_reason = ?, reviewed_at = ? WHERE id = ?',
        )
        .run(status, reason, reviewedAt, id);
      if (status === 'approved')
        this.database
          .prepare(
            "UPDATE account_profiles SET review_status = 'active' WHERE user_id = ? AND role = 'owner_manager'",
          )
          .run(claim.claimantUserId);
      this.database.exec('COMMIT');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  hasApproved(userId: string, candidateId: string): boolean {
    return Boolean(
      this.database
        .prepare(
          "SELECT 1 AS present FROM property_claims WHERE claimant_user_id = ? AND candidate_id = ? AND status = 'approved'",
        )
        .get(userId, candidateId),
    );
  }
}

export type ManagedBuildingRecord = {
  id: string;
  candidateId: string;
  ownerUserId: string;
  name: string;
  floors: number;
  createdAt: string;
};
export class ManagedBuildingRepository {
  constructor(private readonly database: DatabaseSync) {}
  save(record: ManagedBuildingRecord) {
    this.database
      .prepare(
        'INSERT INTO managed_buildings(id, candidate_id, owner_user_id, name, floors, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.id,
        record.candidateId,
        record.ownerUserId,
        record.name,
        record.floors,
        record.createdAt,
      );
  }
  listForOwner(userId: string): ManagedBuildingRecord[] {
    return this.database
      .prepare(
        'SELECT id, candidate_id AS candidateId, owner_user_id AS ownerUserId, name, floors, created_at AS createdAt FROM managed_buildings WHERE owner_user_id = ? ORDER BY created_at DESC',
      )
      .all(userId) as ManagedBuildingRecord[];
  }
  listForCandidate(candidateId: string): ManagedBuildingRecord[] {
    return this.database
      .prepare(
        'SELECT id, candidate_id AS candidateId, owner_user_id AS ownerUserId, name, floors, created_at AS createdAt FROM managed_buildings WHERE candidate_id = ? ORDER BY name ASC',
      )
      .all(candidateId) as ManagedBuildingRecord[];
  }
  belongsToCandidate(id: string, candidateId: string): boolean {
    return Boolean(
      this.database
        .prepare(
          'SELECT 1 AS present FROM managed_buildings WHERE id = ? AND candidate_id = ?',
        )
        .get(id, candidateId),
    );
  }
}

export type EvidenceUploadRecord = {
  id: string;
  userId: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};
export class EvidenceUploadRepository {
  constructor(private readonly database: DatabaseSync) {}
  save(record: EvidenceUploadRecord) {
    this.database
      .prepare(
        'INSERT INTO evidence_uploads(id, user_id, original_name, media_type, byte_size, sha256, storage_key, moderation_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.id,
        record.userId,
        record.originalName,
        record.mediaType,
        record.byteSize,
        record.sha256,
        record.storageKey,
        record.moderationStatus,
        record.createdAt,
      );
  }
  listForUser(userId: string): EvidenceUploadRecord[] {
    return this.database
      .prepare(
        'SELECT id, user_id AS userId, original_name AS originalName, media_type AS mediaType, byte_size AS byteSize, sha256, storage_key AS storageKey, moderation_status AS moderationStatus, created_at AS createdAt FROM evidence_uploads WHERE user_id = ? ORDER BY created_at DESC',
      )
      .all(userId) as EvidenceUploadRecord[];
  }
  getForUser(id: string, userId: string): EvidenceUploadRecord | null {
    return (
      (this.database
        .prepare(
          'SELECT id, user_id AS userId, original_name AS originalName, media_type AS mediaType, byte_size AS byteSize, sha256, storage_key AS storageKey, moderation_status AS moderationStatus, created_at AS createdAt FROM evidence_uploads WHERE id = ? AND user_id = ?',
        )
        .get(id, userId) as EvidenceUploadRecord | undefined) ?? null
    );
  }
  ownsAll(userId: string, ids: string[]): boolean {
    return ids.every((id) =>
      Boolean(
        this.database
          .prepare(
            'SELECT 1 AS present FROM evidence_uploads WHERE id = ? AND user_id = ?',
          )
          .get(id, userId),
      ),
    );
  }
}

export type IssueReportRecord = {
  id: string;
  candidateId: string;
  candidateName: string;
  buildingId: string | null;
  buildingName: string | null;
  reporterUserId: string;
  category: string;
  title: string;
  description: string;
  visibility: 'private_review' | 'public_redacted' | 'confidential';
  status: 'submitted';
  createdAt: string;
  evidenceIds: string[];
};
export class IssueReportRepository {
  constructor(private readonly database: DatabaseSync) {}
  save(record: Omit<IssueReportRecord, 'candidateName' | 'buildingName'>) {
    this.database.exec('BEGIN');
    try {
      this.database
        .prepare(
          'INSERT INTO issue_reports(id, candidate_id, building_id, reporter_user_id, category, title, description, visibility, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          record.id,
          record.candidateId,
          record.buildingId,
          record.reporterUserId,
          record.category,
          record.title,
          record.description,
          record.visibility,
          record.status,
          record.createdAt,
        );
      const statement = this.database.prepare(
        'INSERT INTO report_evidence(report_id, evidence_id) VALUES (?, ?)',
      );
      for (const evidenceId of record.evidenceIds)
        statement.run(record.id, evidenceId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  listForUser(userId: string): IssueReportRecord[] {
    const rows = this.database
      .prepare(
        `SELECT issue_reports.id, issue_reports.candidate_id AS candidateId, property_candidates.name AS candidateName,
      issue_reports.building_id AS buildingId, managed_buildings.name AS buildingName, reporter_user_id AS reporterUserId, category, title,
      description, visibility, status, issue_reports.created_at AS createdAt
      FROM issue_reports JOIN property_candidates ON property_candidates.id = issue_reports.candidate_id
      LEFT JOIN managed_buildings ON managed_buildings.id = issue_reports.building_id
      WHERE reporter_user_id = ? ORDER BY issue_reports.created_at DESC`,
      )
      .all(userId) as Array<Omit<IssueReportRecord, 'evidenceIds'>>;
    const evidence = this.database.prepare(
      'SELECT evidence_id AS evidenceId FROM report_evidence WHERE report_id = ?',
    );
    return rows.map((row) => ({
      ...row,
      evidenceIds: (evidence.all(row.id) as Array<{ evidenceId: string }>).map(
        (item) => item.evidenceId,
      ),
    }));
  }
}
