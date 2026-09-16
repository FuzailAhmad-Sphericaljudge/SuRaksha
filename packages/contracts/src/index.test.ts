import { describe, expect, it } from 'vitest';
import {
  authenticatedUserSchema,
  apiErrorSchema,
  healthResponseSchema,
  sessionResponseSchema,
  utcTimestampSchema,
} from './index.js';

describe('public foundation contracts', () => {
  it('accepts UTC and rejects missing timezone, offsets and invalid dates', () => {
    expect(utcTimestampSchema.parse('2026-09-16T10:30:00.000Z')).toBe(
      '2026-09-16T10:30:00.000Z',
    );
    for (const value of [
      '2026-09-16T10:30:00',
      '2026-09-16T10:30:00+05:30',
      '2026-02-30T10:30:00Z',
    ]) {
      expect(utcTimestampSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects extra fields and unsupported statuses on a public response', () => {
    const payload = {
      service: 'suraksha-api',
      status: 'ok',
      timestamp: '2026-09-16T10:30:00Z',
    };
    expect(healthResponseSchema.safeParse(payload).success).toBe(true);
    expect(
      healthResponseSchema.safeParse({ ...payload, secret: 'private' }).success,
    ).toBe(false);
    expect(
      healthResponseSchema.safeParse({ ...payload, status: 'safe' }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({
        error: { code: 'INTERNAL_ERROR', message: 'Failed', requestId: '' },
      }).success,
    ).toBe(false);
  });

  it('keeps anonymous and authenticated sessions explicit', () => {
    expect(
      sessionResponseSchema.safeParse({ authenticated: false }).success,
    ).toBe(true);
    const user = {
      id: 'workspace-user-1',
      email: 'student@example.test',
      displayName: 'Demo Student',
    };
    expect(authenticatedUserSchema.safeParse(user).success).toBe(true);
    expect(
      sessionResponseSchema.safeParse({
        authenticated: true,
        user,
        memberships: [],
      }).success,
    ).toBe(true);
    expect(
      sessionResponseSchema.safeParse({
        authenticated: true,
        user: { ...user, email: 'not-an-email' },
        memberships: [],
      }).success,
    ).toBe(false);
    expect(
      sessionResponseSchema.safeParse({
        authenticated: true,
        user,
        memberships: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            propertyId: null,
            role: 'internal_reviewer',
            status: 'active',
            expiresAt: null,
            createdAt: '2026-09-16T08:00:00Z',
            updatedAt: '2026-09-16T09:00:00Z',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
