import { afterEach, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  bootstrapResponseSchema,
  healthResponseSchema,
} from '@suraksha/contracts';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase } from './database.js';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('API foundation', () => {
  it('selects mode on the server and ignores client query overrides', async () => {
    const demo = createApp({ mode: 'demo' });
    const production = createApp({ mode: 'production' });
    apps.push(demo, production);
    expect(
      bootstrapResponseSchema.parse(
        (await demo.inject('/api/bootstrap?mode=production')).json(),
      ),
    ).toEqual({ mode: 'demo', demoData: true });
    expect(
      bootstrapResponseSchema.parse(
        (await production.inject('/api/bootstrap?mode=demo')).json(),
      ),
    ).toEqual({ mode: 'production', demoData: false });
  });
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

  it('returns anonymous sessions publicly and protects identity-aware routes', async () => {
    const app = createApp();
    apps.push(app);
    const anonymous = await app.inject('/api/session');
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ authenticated: false });
    const denied = await app.inject('/api/private/check');
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error.code).toBe('UNAUTHORIZED');
    const headers = {
      'oai-authenticated-user-id': 'workspace-1',
      'oai-authenticated-user-email': 'student@example.test',
      'oai-authenticated-user-full-name': 'Demo%20Student',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    };
    const session = await app.inject({ url: '/api/session', headers });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      user: {
        id: 'workspace-1',
        email: 'student@example.test',
        displayName: 'Demo Student',
      },
      memberships: [],
    });
    expect(
      (await app.inject({ url: '/api/private/check', headers })).statusCode,
    ).toBe(200);
  });

  it('registers, restores and revokes a demo session through an HttpOnly cookie', async () => {
    const database = openDatabase(':memory:');
    const app = createApp({
      mode: 'demo',
      database,
      now: () => new Date('2026-09-16T10:30:00Z'),
    });
    apps.push(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Demo Student',
        email: 'student@example.test',
        password: 'safe-password',
      },
    });
    expect(registration.statusCode).toBe(201);
    const cookie = registration.headers['set-cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(
      (await app.inject({ url: '/api/session', headers: { cookie } })).json(),
    ).toMatchObject({
      authenticated: true,
      user: { email: 'student@example.test' },
      profile: null,
    });
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { cookie },
      payload: { role: 'student' },
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.json().profile).toEqual({
      role: 'student',
      reviewStatus: 'active',
    });
    expect(
      (await app.inject({ url: '/api/session', headers: { cookie } })).json()
        .profile,
    ).toEqual({ role: 'student', reviewStatus: 'active' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: '/api/session', headers: { cookie } })).json(),
    ).toEqual({ authenticated: false });
    database.close();
  });

  it('keeps owner onboarding pending review', async () => {
    const database = openDatabase(':memory:');
    const app = createApp({ mode: 'demo', database });
    apps.push(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Demo Owner',
        email: 'owner@example.test',
        password: 'safe-password',
      },
    });
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { cookie: registration.headers['set-cookie'] },
      payload: { role: 'owner_manager' },
    });
    expect(onboarding.json().profile).toEqual({
      role: 'owner_manager',
      reviewStatus: 'pending_review',
    });
    database.close();
  });

  it('rejects duplicate registration and incorrect passwords', async () => {
    const database = openDatabase(':memory:');
    const app = createApp({ mode: 'demo', database });
    apps.push(app);
    const payload = {
      displayName: 'Demo Student',
      email: 'student@example.test',
      password: 'safe-password',
    };
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/register', payload }))
        .statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/register', payload }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: payload.email, password: 'wrong-password' },
        })
      ).statusCode,
    ).toBe(401);
    database.close();
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
    expect(readConfig({}).APP_MODE).toBe('demo');
    expect(
      readConfig({
        APP_MODE: 'production',
        DATABASE_PATH: 'data/production.sqlite',
      }).APP_MODE,
    ).toBe('production');
    expect(() => readConfig({ APP_MODE: 'production' })).toThrow(
      'DATABASE_PATH',
    );
    expect(() => readConfig({ APP_MODE: 'preview' })).toThrow('APP_MODE');
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
