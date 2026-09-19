import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  apiErrorSchema,
  bootstrapResponseSchema,
  healthResponseSchema,
} from '@suraksha/contracts';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase } from './database.js';

const apps: ReturnType<typeof createApp>[] = [];
const uploadDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of uploadDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
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
    const uploadRoot = mkdtempSync(join(tmpdir(), 'suraksha-upload-'));
    uploadDirectories.push(uploadRoot);
    const app = createApp({
      mode: 'demo',
      database,
      uploadRoot,
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
    const boundary = 'suraksha-test-boundary';
    const uploadBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="issue.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/evidence/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: uploadBody,
    });
    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({
      mediaType: 'image/jpeg',
      moderationStatus: 'pending',
    });
    expect(upload.body).not.toContain('storageKey');
    expect(
      (
        await app.inject({ url: '/api/evidence/mine', headers: { cookie } })
      ).json(),
    ).toHaveLength(1);
    expect(
      (await app.inject(`/api/evidence/${upload.json().id}/file`)).statusCode,
    ).toBe(401);
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
    const candidate = await app.inject({
      method: 'POST',
      url: '/api/candidates',
      headers: { cookie },
      payload: {
        name: 'Real Student Hostel',
        locality: 'Kota, Rajasthan',
        propertyType: 'hostel',
      },
    });
    expect(candidate.statusCode).toBe(201);
    expect(candidate.json()).toMatchObject({
      name: 'Real Student Hostel',
      source: 'user_submission',
    });
    const report = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: { cookie },
      payload: {
        candidateId: candidate.json().id,
        buildingId: null,
        category: 'fire_safety',
        title: 'Blocked fire exit',
        description:
          'The marked fire exit was blocked by stored furniture this morning.',
        visibility: 'public_redacted',
        evidenceIds: [upload.json().id],
      },
    });
    expect(report.statusCode).toBe(201);
    expect(
      (
        await app.inject({ url: '/api/reports/mine', headers: { cookie } })
      ).json()[0],
    ).toMatchObject({
      title: 'Blocked fire exit',
      status: 'submitted',
      evidenceIds: [upload.json().id],
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: { cookie },
      payload: {
        candidateId: candidate.json().id,
        buildingId: null,
        category: 'fire_safety',
        title: 'Fire exit obstruction',
        description:
          'Furniture blocks the same marked fire exit near the entrance.',
        visibility: 'private_review',
        evidenceIds: [],
      },
    });
    const reviewer = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Media Reviewer',
        email: 'reviewer@suraksha.demo',
        password: 'review-password',
      },
    });
    const reviewerCookie = reviewer.headers['set-cookie'];
    expect(
      (
        await app.inject({
          url: '/api/reviewer/evidence',
          headers: { cookie: reviewerCookie },
        })
      ).json(),
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/evidence/${upload.json().id}/decision`,
          headers: { cookie: reviewerCookie },
          payload: {
            status: 'approved',
            reason:
              'Image content is relevant and contains no visible personal data.',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/reports/${report.json().id}/decision`,
          headers: { cookie: reviewerCookie },
          payload: {
            status: 'approved',
            reason: 'Public wording and location have been reviewed.',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/reports/${duplicate.json().id}/merge`,
          headers: { cookie: reviewerCookie },
          payload: {
            targetReportId: report.json().id,
            reason: 'Same property, category and obstruction location.',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/reports/${duplicate.json().id}/unmerge`,
          headers: { cookie: reviewerCookie },
          payload: { reason: 'Reporter supplied distinct timing information.' },
        })
      ).statusCode,
    ).toBe(200);
    const publicProfile = await app.inject(
      `/api/public/profiles/${candidate.json().id}`,
    );
    expect(publicProfile.statusCode).toBe(200);
    expect(publicProfile.json()).toMatchObject({
      candidate: { name: 'Real Student Hostel' },
      verification: { level: 'evidence_reviewed', openFindings: 1 },
      categories: [{ category: 'fire_safety', openFindings: 1 }],
    });
    expect(publicProfile.json().findings).toHaveLength(1);
    expect(publicProfile.body).not.toContain('reporterUserId');
    expect((await app.inject('/api/candidates')).json()).toHaveLength(1);
    expect(
      (await app.inject('/api/candidates/search?q=kota&type=hostel')).json(),
    ).toHaveLength(1);
    expect((await app.inject('/api/candidates/search?q=delhi')).json()).toEqual(
      [],
    );
    expect(
      (
        await app.inject(
          '/api/public/profiles/20000000-0000-4000-8000-000000000099',
        )
      ).statusCode,
    ).toBe(404);
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
    const candidate = await app.inject({
      method: 'POST',
      url: '/api/candidates',
      headers: { cookie: registration.headers['set-cookie'] },
      payload: {
        name: 'Owner Test PG',
        locality: 'Kota, Rajasthan',
        propertyType: 'paying_guest',
      },
    });
    const claimPayload = {
      candidateId: candidate.json().id,
      evidenceNote:
        'I manage this property and can provide the registered lease document.',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/claims',
          headers: { cookie: registration.headers['set-cookie'] },
          payload: claimPayload,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          url: '/api/claims/mine',
          headers: { cookie: registration.headers['set-cookie'] },
        })
      ).json()[0],
    ).toMatchObject({ candidateName: 'Owner Test PG', status: 'submitted' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/claims',
          headers: { cookie: registration.headers['set-cookie'] },
          payload: claimPayload,
        })
      ).statusCode,
    ).toBe(409);
    const reviewer = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Demo Reviewer',
        email: 'reviewer@suraksha.demo',
        password: 'review-password',
      },
    });
    const reviewerCookie = reviewer.headers['set-cookie'];
    const queue = await app.inject({
      url: '/api/reviewer/claims',
      headers: { cookie: reviewerCookie },
    });
    expect(queue.json()).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/claims/${queue.json()[0].id}/decision`,
          headers: { cookie: reviewerCookie },
          payload: {
            status: 'approved',
            reason: 'Management connection checked in demo review.',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: '/api/session',
          headers: { cookie: registration.headers['set-cookie'] },
        })
      ).json().profile.reviewStatus,
    ).toBe('active');
    const building = await app.inject({
      method: 'POST',
      url: '/api/buildings',
      headers: { cookie: registration.headers['set-cookie'] },
      payload: {
        candidateId: candidate.json().id,
        name: 'Main Block',
        floors: 4,
      },
    });
    expect(building.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          url: '/api/buildings/mine',
          headers: { cookie: registration.headers['set-cookie'] },
        })
      ).json(),
    ).toHaveLength(1);
    database.close();
  });

  it('keeps repair closure under reviewer control and preserves public history', async () => {
    const database = openDatabase(':memory:');
    const app = createApp({ mode: 'demo', database });
    apps.push(app);
    const ownerId = '30000000-0000-4000-8000-000000000001';
    const reporterId = '30000000-0000-4000-8000-000000000002';
    const candidateId = '30000000-0000-4000-8000-000000000003';
    const reportId = '30000000-0000-4000-8000-000000000004';
    const evidenceId = '30000000-0000-4000-8000-000000000005';
    const repairEvidenceId = '30000000-0000-4000-8000-000000000006';
    database
      .prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)')
      .run(
        ownerId,
        'repair-owner@test.local',
        'Repair Owner',
        'unused',
        '2026-09-20T00:00:00Z',
      );
    database
      .prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)')
      .run(
        reporterId,
        'reporter@test.local',
        'Reporter',
        'unused',
        '2026-09-20T00:00:00Z',
      );
    database
      .prepare(
        'INSERT INTO property_candidates(id,name,locality,source,created_at,property_type) VALUES (?,?,?,?,?,?)',
      )
      .run(
        candidateId,
        'Repair Test Hostel',
        'Kota',
        'test',
        '2026-09-20T00:00:00Z',
        'hostel',
      );
    database
      .prepare(
        'INSERT INTO property_claims(id,candidate_id,claimant_user_id,evidence_note,status,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(
        'claim-repair',
        candidateId,
        ownerId,
        'Approved ownership evidence for repair workflow.',
        'approved',
        '2026-09-20T00:00:00Z',
      );
    database
      .prepare(
        'INSERT INTO evidence_uploads(id,user_id,original_name,media_type,byte_size,sha256,storage_key,moderation_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        evidenceId,
        reporterId,
        'finding.jpg',
        'image/jpeg',
        10,
        'finding-hash',
        'finding.jpg',
        'approved',
        '2026-09-20T00:00:00Z',
      );
    database
      .prepare(
        'INSERT INTO evidence_uploads(id,user_id,original_name,media_type,byte_size,sha256,storage_key,moderation_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        repairEvidenceId,
        ownerId,
        'repair.jpg',
        'image/jpeg',
        10,
        'repair-hash',
        'repair.jpg',
        'pending',
        '2026-09-20T00:00:00Z',
      );
    database
      .prepare(
        'INSERT INTO issue_reports(id,candidate_id,building_id,reporter_user_id,category,title,description,visibility,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        reportId,
        candidateId,
        null,
        reporterId,
        'electrical',
        'Exposed wiring',
        'Approved public finding requiring an owner repair.',
        'public_redacted',
        'approved',
        '2026-09-20T00:00:00Z',
      );
    database
      .prepare('INSERT INTO report_evidence VALUES (?, ?)')
      .run(reportId, evidenceId);
    const ownerHeaders = {
      'oai-authenticated-user-id': ownerId,
      'oai-authenticated-user-email': 'repair-owner@test.local',
      'oai-authenticated-user-full-name': 'Repair%20Owner',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    };
    const reviewerHeaders = {
      ...ownerHeaders,
      'oai-authenticated-user-id': 'reviewer-workspace',
      'oai-authenticated-user-email': 'reviewer@suraksha.demo',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reports/${reportId}/repair-plan`,
          headers: ownerHeaders,
          payload: {
            actionPlan: 'Replace exposed wiring and install a sealed conduit.',
            targetDate: '2026-10-01',
          },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reports/${reportId}/request-reinspection`,
          headers: ownerHeaders,
          payload: {
            evidenceIds: [repairEvidenceId],
            note: 'Wiring replaced and conduit installed.',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/repairs/${reportId}/decision`,
          headers: reviewerHeaders,
          payload: {
            status: 'resolved',
            reason: 'Fix is not verified while repair evidence is pending.',
          },
        })
      ).statusCode,
    ).toBe(409);
    database
      .prepare(
        "UPDATE evidence_uploads SET moderation_status = 'approved' WHERE id = ?",
      )
      .run(repairEvidenceId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/repairs/${reportId}/decision`,
          headers: reviewerHeaders,
          payload: {
            status: 'resolved',
            reason:
              'Approved repair evidence confirms enclosed replacement wiring.',
          },
        })
      ).statusCode,
    ).toBe(200);
    const profile = (
      await app.inject(`/api/public/profiles/${candidateId}`)
    ).json();
    expect(profile.verification.openFindings).toBe(0);
    expect(profile.findings[0]).toMatchObject({
      reportStatus: 'resolved',
      repair: { status: 'resolved' },
    });
    expect(profile.findings[0].repair.history).toHaveLength(3);
    database.close();
  });

  it('enforces credential specialty, expiry and conflict checks for inspections', async () => {
    const database = openDatabase(':memory:');
    const app = createApp({
      mode: 'demo',
      database,
      now: () => new Date('2026-09-20T10:00:00Z'),
    });
    apps.push(app);
    const professional = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Fire Inspector',
        email: 'inspector@test.local',
        password: 'safe-password',
      },
    });
    const professionalCookie = professional.headers['set-cookie'];
    const professionalId = professional.json().user.id;
    await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { cookie: professionalCookie },
      payload: { role: 'professional' },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/professional/credentials',
          headers: { cookie: professionalCookie },
          payload: {
            credentialType: 'Fire safety license',
            licenseNumber: 'FIRE-2026-01',
            specialty: 'fire_safety',
            expiresOn: '2026-09-19',
          },
        })
      ).statusCode,
    ).toBe(400);
    const credential = await app.inject({
      method: 'POST',
      url: '/api/professional/credentials',
      headers: { cookie: professionalCookie },
      payload: {
        credentialType: 'Fire safety license',
        licenseNumber: 'FIRE-2026-02',
        specialty: 'fire_safety',
        expiresOn: '2027-09-20',
      },
    });
    expect(credential.statusCode).toBe(201);
    const reviewer = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Credential Reviewer',
        email: 'reviewer@suraksha.demo',
        password: 'review-password',
      },
    });
    const reviewerCookie = reviewer.headers['set-cookie'];
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/reviewer/credentials/${credential.json().id}/decision`,
          headers: { cookie: reviewerCookie },
          payload: {
            status: 'approved',
            reason: 'License number and expiry verified for demo.',
          },
        })
      ).statusCode,
    ).toBe(200);
    const candidateId = '40000000-0000-4000-8000-000000000001';
    const reportId = '40000000-0000-4000-8000-000000000002';
    database
      .prepare(
        'INSERT INTO property_candidates(id,name,locality,source,created_at,property_type) VALUES (?,?,?,?,?,?)',
      )
      .run(
        candidateId,
        'Inspection Hostel',
        'Kota',
        'test',
        '2026-09-20T00:00:00Z',
        'hostel',
      );
    database
      .prepare(
        'INSERT INTO issue_reports(id,candidate_id,building_id,reporter_user_id,category,title,description,visibility,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        reportId,
        candidateId,
        null,
        professionalId,
        'fire_safety',
        'Fire door check',
        'Professional inspection is needed for the fire door.',
        'public_redacted',
        'approved',
        '2026-09-20T00:00:00Z',
      );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reviewer/inspections',
          headers: { cookie: reviewerCookie },
          payload: {
            reportId,
            professionalUserId: professionalId,
            specialty: 'electrical',
            scheduledFor: '2026-09-25T10:00:00Z',
          },
        })
      ).statusCode,
    ).toBe(409);
    const assignment = await app.inject({
      method: 'POST',
      url: '/api/reviewer/inspections',
      headers: { cookie: reviewerCookie },
      payload: {
        reportId,
        professionalUserId: professionalId,
        specialty: 'fire_safety',
        scheduledFor: '2026-09-25T10:00:00Z',
      },
    });
    expect(assignment.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/professional/inspections/${assignment.json().id}/conflict`,
          headers: { cookie: professionalCookie },
          payload: {
            conflict: false,
            note: 'No financial or management relationship exists.',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/professional/inspections/${assignment.json().id}/result`,
          headers: { cookie: professionalCookie },
          payload: {
            outcome: 'non_compliant',
            notes:
              'Fire door does not close automatically and requires adjustment.',
            inspectedAt: '2026-09-25T11:00:00Z',
          },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          url: '/api/professional/inspections',
          headers: { cookie: professionalCookie },
        })
      ).json()[0].status,
    ).toBe('completed');
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
