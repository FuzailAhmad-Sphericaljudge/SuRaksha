import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const sessionName = 'suraksha_session';
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const hashPassword = (
  password: string,
  salt = randomBytes(16).toString('hex'),
) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password: string, stored: string) => {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
};

export type DemoUser = { id: string; email: string; displayName: string };

export function registerDemoUser(
  database: DatabaseSync,
  input: { email: string; displayName: string; password: string },
  now: Date,
) {
  const user = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
  };
  database
    .prepare(
      'INSERT INTO users(id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      user.id,
      user.email,
      user.displayName,
      hashPassword(input.password),
      now.toISOString(),
    );
  return { user, ...createDemoSession(database, user.id, now) };
}

export function loginDemoUser(
  database: DatabaseSync,
  email: string,
  password: string,
  now: Date,
) {
  const row = database
    .prepare(
      'SELECT id, email, display_name AS displayName, password_hash AS passwordHash FROM users WHERE email = ?',
    )
    .get(email.trim().toLowerCase()) as
    (DemoUser & { passwordHash: string }) | undefined;
  if (!row || !verifyPassword(password, row.passwordHash)) return null;
  return {
    user: { id: row.id, email: row.email, displayName: row.displayName },
    ...createDemoSession(database, row.id, now),
  };
}

function createDemoSession(database: DatabaseSync, userId: string, now: Date) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  database
    .prepare(
      'INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(hashToken(token), userId, expiresAt.toISOString(), now.toISOString());
  return { token, expiresAt };
}

export function accessDemoRole(
  database: DatabaseSync,
  role:
    | 'student'
    | 'parent_guardian'
    | 'owner_manager'
    | 'professional'
    | 'reviewer',
  now: Date,
) {
  const identities = {
    student: ['demo-student', 'student@suraksha.demo', 'Demo Student'],
    parent_guardian: ['demo-guardian', 'guardian@suraksha.demo', 'Demo Parent'],
    owner_manager: ['demo-owner', 'owner@suraksha.demo', 'Demo Owner'],
    professional: [
      'demo-professional',
      'professional@suraksha.demo',
      'Demo Inspector',
    ],
    reviewer: ['demo-reviewer', 'reviewer@suraksha.demo', 'Demo Reviewer'],
  } as const;
  const [id, email, displayName] = identities[role];
  database
    .prepare(
      `INSERT INTO users(id,email,display_name,password_hash,created_at)
       VALUES (?,?,?,'demo_quick_access',?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name`,
    )
    .run(id, email, displayName, now.toISOString());
  const profileRole = role === 'reviewer' ? 'student' : role;
  database
    .prepare(
      `INSERT INTO account_profiles(user_id,role,review_status,updated_at)
       VALUES (?,?, 'active', ?)
       ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,review_status='active',updated_at=excluded.updated_at`,
    )
    .run(id, profileRole, now.toISOString());
  return {
    user: { id, email, displayName },
    profile: { role: profileRole, reviewStatus: 'active' as const },
    ...createDemoSession(database, id, now),
  };
}

export function readDemoUser(
  database: DatabaseSync,
  cookie: string | undefined,
  now: Date,
): DemoUser | null {
  const token = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionName}=`))
    ?.slice(sessionName.length + 1);
  if (!token) return null;
  return (
    (database
      .prepare(
        `SELECT users.id, users.email, users.display_name AS displayName FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(hashToken(token), now.toISOString()) as DemoUser | undefined) ?? null
  );
}

export function revokeDemoSession(
  database: DatabaseSync,
  cookie: string | undefined,
) {
  const token = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionName}=`))
    ?.slice(sessionName.length + 1);
  if (token)
    database
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .run(hashToken(token));
}

export const sessionCookie = (token: string, expiresAt: Date) =>
  `${sessionName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
export const clearSessionCookie = `${sessionName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
