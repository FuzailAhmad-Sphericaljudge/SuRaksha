import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  healthResponseSchema,
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
});
