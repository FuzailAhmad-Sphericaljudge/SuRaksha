import { afterEach, describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from '@suraksha/contracts';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('API foundation', () => {
  it('returns validated UTC liveness on repeated read-only requests', async () => {
    const app = createApp({ now: () => new Date('2026-09-16T10:30:00Z') });
    apps.push(app);
    const responses = await Promise.all([
      app.inject('/api/health'),
      app.inject('/api/health'),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(healthResponseSchema.parse(response.json()).timestamp).toBe(
        '2026-09-16T10:30:00.000Z',
      );
    }
    expect(responses[0]?.body).toBe(responses[1]?.body);
  });

  it('returns contract errors for missing routes and never accepts POST as a read', async () => {
    const app = createApp();
    apps.push(app);
    for (const response of [
      await app.inject('/api/missing'),
      await app.inject({ method: 'POST', url: '/api/health' }),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(
        'NOT_FOUND',
      );
    }
  });

  it('redacts internal failures and recovers on a subsequent request', async () => {
    let first = true;
    const app = createApp({
      now: () => {
        if (first) {
          first = false;
          throw new Error('private-provider-secret');
        }
        return new Date('2026-09-16T10:30:00Z');
      },
    });
    apps.push(app);
    const failure = await app.inject('/api/health');
    expect(failure.statusCode).toBe(500);
    expect(apiErrorSchema.parse(failure.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(failure.body).not.toContain('private-provider-secret');
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });

  it('fails fast on invalid environment without including values', () => {
    expect(readConfig({}).PORT).toBe(3001);
    for (const PORT of ['0', '65536', 'abc', '1.5', '']) {
      expect(() => readConfig({ PORT })).toThrow('PORT');
    }
    expect(() => readConfig({ LOG_LEVEL: 'private-provider-secret' })).toThrow(
      'LOG_LEVEL',
    );
    expect(() =>
      readConfig({ LOG_LEVEL: 'private-provider-secret' }),
    ).not.toThrow('private-provider-secret');
  });
});
