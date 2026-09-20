import { createHash, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import {
  apiErrorSchema,
  authFailureSchema,
  bootstrapResponseSchema,
  healthResponseSchema,
  sessionResponseSchema,
} from '@suraksha/contracts';
import { readWorkspaceIdentity } from './workspaceIdentity.js';
import {
  AccountProfileRepository,
  PropertyClaimRepository,
  ManagedBuildingRepository,
  EvidenceUploadRepository,
  IssueReportRepository,
  RepairRepository,
  InspectionRepository,
  NotificationRepository,
  GuardianRepository,
  ReviewerOperationsRepository,
  AnalyticsRepository,
  PrivacyRepository,
  PropertyCandidateRepository,
} from './database.js';
import {
  clearSessionCookie,
  loginDemoUser,
  readDemoUser,
  registerDemoUser,
  revokeDemoSession,
  sessionCookie,
} from './demoAuth.js';

type AppOptions = {
  now?: () => Date;
  logLevel?: string;
  webRoot?: string;
  mode?: 'demo' | 'production';
  database?: DatabaseSync;
  uploadRoot?: string;
};

function contentMatchesMediaType(mediaType: string, buffer: Buffer) {
  if (mediaType === 'image/jpeg')
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mediaType === 'image/png')
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mediaType === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP'
    );
  if (mediaType === 'video/mp4')
    return buffer.subarray(4, 8).toString() === 'ftyp';
  if (mediaType === 'video/webm')
    return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const mode = options.mode ?? 'demo';
  const database = options.database;
  const uploadRoot = options.uploadRoot ? resolve(options.uploadRoot) : null;
  const credentialsSchema = z.strictObject({
    email: z.email().max(320),
    password: z.string().min(8).max(128),
  });
  const registrationSchema = credentialsSchema.extend({
    displayName: z.string().trim().min(2).max(100),
  });
  const onboardingSchema = z.strictObject({
    role: z.enum([
      'student',
      'parent_guardian',
      'owner_manager',
      'professional',
    ]),
  });
  const candidateSchema = z.strictObject({
    name: z.string().trim().min(3).max(160),
    locality: z.string().trim().min(3).max(120),
    propertyType: z.enum(['paying_guest', 'hostel', 'coaching_institute']),
  });
  const claimSchema = z.strictObject({
    candidateId: z.uuid(),
    evidenceNote: z.string().trim().min(20).max(1000),
  });
  const claimDecisionSchema = z.strictObject({
    status: z.enum(['approved', 'rejected']),
    reason: z.string().trim().min(10).max(1000),
  });
  const buildingSchema = z.strictObject({
    candidateId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    floors: z.number().int().min(1).max(300),
  });
  const reportInputSchema = z
    .strictObject({
      candidateId: z.uuid(),
      buildingId: z.uuid().nullable(),
      category: z.enum([
        'fire_safety',
        'electrical',
        'structural',
        'water_ingress',
        'blocked_access',
        'overcrowding',
        'sanitation',
        'other_safety',
      ]),
      title: z.string().trim().min(5).max(140),
      description: z.string().trim().min(20).max(4000),
      visibility: z.enum(['private_review', 'public_redacted', 'confidential']),
      evidenceIds: z.array(z.uuid()).max(12),
    })
    .superRefine((value, context) => {
      if (new Set(value.evidenceIds).size !== value.evidenceIds.length)
        context.addIssue({
          code: 'custom',
          message: 'Evidence cannot be duplicated',
          path: ['evidenceIds'],
        });
      if (
        value.visibility === 'public_redacted' &&
        value.evidenceIds.length === 0
      )
        context.addIssue({
          code: 'custom',
          message: 'Public reports require evidence',
          path: ['evidenceIds'],
        });
    });
  const isDemoReviewer = (email: string) =>
    mode === 'demo' && email.toLowerCase() === 'reviewer@suraksha.demo';
  const currentUser = (headers: IncomingHttpHeaders) => {
    const user =
      (database && mode === 'demo'
        ? readDemoUser(
            database,
            typeof headers.cookie === 'string' ? headers.cookie : undefined,
            now(),
          )
        : null) ?? readWorkspaceIdentity(headers);
    if (user && database && mode === 'production')
      database
        .prepare(
          `INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES (?,?,?,'external_identity',?)
          ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name`,
        )
        .run(user.id, user.email, user.displayName, now().toISOString());
    return user;
  };
  const auditDecision = (
    actorUserId: string,
    entityType: string,
    entityId: string,
    action: string,
    note: string,
  ) => {
    if (!database) return;
    const operations = new ReviewerOperationsRepository(database);
    operations.complete(entityType, entityId, now().toISOString());
    operations.audit({
      id: randomUUID(),
      actorUserId,
      action,
      entityType,
      entityId,
      reasonCode: 'decision',
      note,
      createdAt: now().toISOString(),
    });
  };
  const app = Fastify({
    logger: options.logLevel
      ? {
          level: options.logLevel,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
        }
      : false,
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576,
  });
  const mergeSchema = z.strictObject({
    targetReportId: z.uuid(),
    reason: z.string().trim().min(10).max(1000),
  });
  const repairPlanSchema = z.strictObject({
    actionPlan: z.string().trim().min(20).max(3000),
    targetDate: z.iso.date(),
  });
  const reinspectionSchema = z.strictObject({
    evidenceIds: z.array(z.uuid()).min(1).max(12),
    note: z.string().trim().min(10).max(1000),
  });
  const repairDecisionSchema = z.strictObject({
    status: z.enum(['resolved', 'changes_requested']),
    reason: z.string().trim().min(10).max(1000),
  });
  const credentialSchema = z.strictObject({
    credentialType: z.string().trim().min(3).max(120),
    licenseNumber: z.string().trim().min(3).max(120),
    specialty: z.enum([
      'fire_safety',
      'electrical',
      'structural',
      'water_ingress',
      'blocked_access',
      'overcrowding',
      'sanitation',
      'other_safety',
    ]),
    expiresOn: z.iso.date(),
  });
  const assignmentSchema = z.strictObject({
    reportId: z.uuid(),
    professionalUserId: z.uuid(),
    specialty: z.string().trim().min(3).max(80),
    scheduledFor: z.iso.datetime(),
  });
  const conflictSchema = z.strictObject({
    conflict: z.boolean(),
    note: z.string().trim().min(10).max(1000),
  });
  const inspectionResultSchema = z.strictObject({
    outcome: z.enum(['compliant', 'non_compliant', 'inconclusive']),
    notes: z.string().trim().min(20).max(4000),
    inspectedAt: z.iso.datetime(),
  });
  const notificationPreferencesSchema = z
    .strictObject({
      emailEnabled: z.boolean(),
      smsEnabled: z.boolean(),
      phoneNumber: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{7,14}$/)
        .nullable(),
    })
    .refine((value) => !value.smsEnabled || value.phoneNumber, {
      message: 'A phone number is required for SMS.',
    });
  const guardianGrantSchema = z.strictObject({
    guardianEmail: z.email().max(320),
  });
  const reviewTaskSchema = z.strictObject({
    assignee: z.string().trim().min(2).max(120).optional(),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
    status: z.enum(['open', 'in_progress', 'completed']).optional(),
    escalationReason: z.string().trim().min(10).max(1000).nullable().optional(),
    reasonCode: z.enum([
      'assignment',
      'sla_risk',
      'safety_risk',
      'duplicate',
      'decision',
      'correction',
    ]),
    note: z.string().trim().min(10).max(1000),
  });
  const grievanceSchema = z.strictObject({
    entityType: z.enum(['property', 'report', 'evidence', 'profile']),
    entityId: z.string().trim().min(3).max(200),
    category: z.enum([
      'privacy',
      'misinformation',
      'harassment',
      'copyright',
      'safety',
      'other',
    ]),
    details: z.string().trim().min(20).max(4000),
  });
  const submissionAttempts = new Map<string, number[]>();
  const withinRateLimit = (key: string) => {
    const cutoff = now().getTime() - 60 * 60 * 1000;
    const recent = (submissionAttempts.get(key) ?? []).filter(
      (time) => time > cutoff,
    );
    if (recent.length >= 10) return false;
    recent.push(now().getTime());
    submissionAttempts.set(key, recent);
    return true;
  };
  app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 50_000_000, fields: 4 },
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  app.get('/api/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return healthResponseSchema.parse({
      service: 'suraksha-api',
      status: 'ok',
      timestamp: now().toISOString(),
    });
  });

  app.get('/api/ready', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!database)
      return reply.code(503).send({
        service: 'suraksha-api',
        status: 'not_ready',
        database: 'unavailable',
      });
    try {
      database.prepare('SELECT 1 AS ready').get();
      return {
        service: 'suraksha-api',
        status: 'ready',
        database: 'connected',
        mode,
      };
    } catch {
      return reply.code(503).send({
        service: 'suraksha-api',
        status: 'not_ready',
        database: 'unavailable',
      });
    }
  });

  app.get('/api/bootstrap', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return bootstrapResponseSchema.parse({ mode, demoData: mode === 'demo' });
  });

  app.get('/api/candidates', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!database) return [];
    return new PropertyCandidateRepository(database).list();
  });

  app.get('/api/candidates/search', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!database) return [];
    const parsed = z
      .strictObject({
        q: z.string().trim().max(120).default(''),
        type: z
          .enum(['paying_guest', 'hostel', 'coaching_institute'])
          .optional(),
      })
      .safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search query is invalid.',
          requestId: request.id,
        },
      });
    return new PropertyCandidateRepository(database).search(
      parsed.data.q,
      parsed.data.type,
    );
  });

  app.get('/api/public/profiles/:candidateId', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const identifier = z
      .uuid()
      .safeParse((request.params as { candidateId?: unknown }).candidateId);
    if (!database || !identifier.success)
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Property profile not found.',
          requestId: request.id,
        },
      });
    const profile = new IssueReportRepository(database).publicProfile(
      identifier.data,
    );
    return profile
      ? profile
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Property profile not found.',
            requestId: request.id,
          },
        });
  });

  app.post('/api/candidates', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Candidate intake is unavailable.',
          requestId: request.id,
        },
      });
    const parsed = candidateSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Enter a valid property name, locality and type.',
          requestId: request.id,
        },
      });
    const record = {
      id: randomUUID(),
      ...parsed.data,
      source: 'user_submission',
      createdAt: now().toISOString(),
    };
    new PropertyCandidateRepository(database).save(record);
    return reply.code(201).send(record);
  });

  app.get('/api/claims/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database) return [];
    return new PropertyClaimRepository(database).listForUser(user.id);
  });

  app.post('/api/claims', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Claims are unavailable.',
          requestId: request.id,
        },
      });
    const profile = new AccountProfileRepository(database).get(user.id);
    if (profile?.role !== 'owner_manager')
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only owner or manager accounts can submit claims.',
          requestId: request.id,
        },
      });
    const parsed = claimSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Select a property and explain your management connection.',
          requestId: request.id,
        },
      });
    const record = {
      id: randomUUID(),
      ...parsed.data,
      claimantUserId: user.id,
      status: 'submitted' as const,
      createdAt: now().toISOString(),
    };
    try {
      new PropertyClaimRepository(database).save(record);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE'))
        return reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'You already claimed this property.',
            requestId: request.id,
          },
        });
      throw error;
    }
    return reply.code(201).send(record);
  });

  app.get('/api/reviewer/claims', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database ? new PropertyClaimRepository(database).listPending() : [];
  });

  app.post('/api/reviewer/claims/:id/decision', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Review is unavailable.',
          requestId: request.id,
        },
      });
    const parsed = claimDecisionSchema.safeParse(request.body);
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    if (!parsed.success || !identifier.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid decision and reason are required.',
          requestId: request.id,
        },
      });
    const claimRepository = new PropertyClaimRepository(database);
    const claim = claimRepository
      .listPending()
      .find((item) => item.id === identifier.data);
    const decided = claimRepository.decide(
      identifier.data,
      parsed.data.status,
      parsed.data.reason,
      now().toISOString(),
    );
    if (decided && claim)
      new NotificationRepository(database).create({
        id: randomUUID(),
        userId: claim.claimantUserId,
        eventType: 'claim_decision',
        title: 'Property claim updated',
        message: `Your property claim review is complete: ${parsed.data.status}. Open SafePG for details.`,
        now: now().toISOString(),
      });
    if (decided)
      auditDecision(
        user.id,
        'claim',
        identifier.data,
        parsed.data.status,
        parsed.data.reason,
      );
    return decided
      ? { status: parsed.data.status }
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Claim not found.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/notifications', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database ? new NotificationRepository(database).list(user.id) : [];
  });

  app.post('/api/notifications/:id/read', async (request, reply) => {
    const user = currentUser(request.headers);
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !identifier.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid notification required.',
          requestId: request.id,
        },
      });
    return new NotificationRepository(database).markRead(
      identifier.data,
      user.id,
      now().toISOString(),
    )
      ? { status: 'read' }
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Notification not found.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/notification-preferences', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new NotificationRepository(database).preferences(user.id)
      : { emailEnabled: 0, smsEnabled: 0, phoneNumber: null };
  });

  app.put('/api/notification-preferences', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = notificationPreferencesSchema.safeParse(request.body);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid channel preferences are required.',
          requestId: request.id,
        },
      });
    new NotificationRepository(database).savePreferences(
      user.id,
      parsed.data.emailEnabled,
      parsed.data.smsEnabled,
      parsed.data.phoneNumber,
      now().toISOString(),
    );
    return { ...parsed.data };
  });

  app.get('/api/notification-deliveries', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new NotificationRepository(database).deliveries(user.id)
      : [];
  });

  app.post(
    '/api/reviewer/notification-deliveries/:id/attempt',
    async (request, reply) => {
      const user = currentUser(request.headers);
      const id = z
        .string()
        .min(3)
        .max(100)
        .safeParse((request.params as { id?: unknown }).id);
      const parsed = z
        .strictObject({
          success: z.boolean(),
          error: z.string().trim().min(3).max(300).nullable(),
        })
        .safeParse(request.body);
      if (!user || !isDemoReviewer(user.email))
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Reviewer access is required.',
            requestId: request.id,
          },
        });
      if (!database || !id.success || !parsed.success)
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A valid delivery attempt is required.',
            requestId: request.id,
          },
        });
      return new NotificationRepository(database).attempt(
        id.data,
        parsed.data.success,
        parsed.data.error,
        now().toISOString(),
      )
        ? { status: parsed.data.success ? 'sent' : 'failed' }
        : reply.code(409).send({
            error: {
              code: 'CONFLICT',
              message: 'Delivery is not retryable.',
              requestId: request.id,
            },
          });
    },
  );

  app.get('/api/sharing/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new GuardianRepository(database).listForStudent(user.id)
      : [];
  });
  app.post('/api/sharing', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = guardianGrantSchema.safeParse(request.body);
    const profile =
      user && database
        ? new AccountProfileRepository(database).get(user.id)
        : null;
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !parsed.success || profile?.role !== 'student')
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only students can grant guardian access.',
          requestId: request.id,
        },
      });
    const id = randomUUID();
    return new GuardianRepository(database).grant(
      id,
      user.id,
      parsed.data.guardianEmail,
      now().toISOString(),
    )
      ? reply.code(201).send({ id, status: 'active' })
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Registered parent or guardian not found.',
            requestId: request.id,
          },
        });
  });
  app.post('/api/sharing/:id/revoke', async (request, reply) => {
    const user = currentUser(request.headers);
    const id = z.uuid().safeParse((request.params as { id?: unknown }).id);
    if (!user || !database || !id.success)
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Active share not found.',
          requestId: request.id,
        },
      });
    return new GuardianRepository(database).revoke(
      id.data,
      user.id,
      now().toISOString(),
    )
      ? { status: 'revoked' }
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Active share not found.',
            requestId: request.id,
          },
        });
  });
  app.get('/api/guardian/students', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new GuardianRepository(database).sharedStudents(user.id)
      : [];
  });
  app.get(
    '/api/guardian/students/:studentId/summary',
    async (request, reply) => {
      const user = currentUser(request.headers);
      const studentId = z
        .uuid()
        .safeParse((request.params as { studentId?: unknown }).studentId);
      if (!user || !database || !studentId.success)
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Shared summary not found.',
            requestId: request.id,
          },
        });
      return (
        new GuardianRepository(database).summary(user.id, studentId.data) ??
        reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Student permission is required.',
            requestId: request.id,
          },
        })
      );
    },
  );
  app.get('/api/saved-properties', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new GuardianRepository(database).savedProperties(user.id)
      : [];
  });
  app.post('/api/saved-properties/:candidateId', async (request, reply) => {
    const user = currentUser(request.headers);
    const candidateId = z
      .uuid()
      .safeParse((request.params as { candidateId?: unknown }).candidateId);
    if (!user || !database || !candidateId.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid property required.',
          requestId: request.id,
        },
      });
    return new GuardianRepository(database).saveProperty(
      user.id,
      candidateId.data,
      now().toISOString(),
    )
      ? reply.code(201).send({ status: 'saved' })
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Property not found.',
            requestId: request.id,
          },
        });
  });
  app.delete('/api/saved-properties/:candidateId', async (request, reply) => {
    const user = currentUser(request.headers);
    const candidateId = z
      .uuid()
      .safeParse((request.params as { candidateId?: unknown }).candidateId);
    if (!user || !database || !candidateId.success)
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Saved property not found.',
          requestId: request.id,
        },
      });
    return new GuardianRepository(database).removeProperty(
      user.id,
      candidateId.data,
    )
      ? reply.code(204).send()
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Saved property not found.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/reviewer/tasks', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    const filters = z
      .strictObject({
        status: z.enum(['open', 'in_progress', 'completed']).optional(),
        assignee: z.string().max(120).optional(),
        overdue: z.enum(['true', 'false']).optional(),
      })
      .safeParse(request.query);
    if (!database || !filters.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid queue filters.',
          requestId: request.id,
        },
      });
    return new ReviewerOperationsRepository(database).list(
      { ...filters.data, overdue: filters.data.overdue === 'true' },
      now().toISOString(),
    );
  });
  app.patch('/api/reviewer/tasks/:id', async (request, reply) => {
    const user = currentUser(request.headers);
    const id = z
      .string()
      .min(6)
      .max(200)
      .safeParse((request.params as { id?: unknown }).id);
    const parsed = reviewTaskSchema.safeParse(request.body);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database || !id.success || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid task update and reason are required.',
          requestId: request.id,
        },
      });
    const { reasonCode, note, ...update } = parsed.data;
    const repository = new ReviewerOperationsRepository(database);
    if (!repository.updateTask(id.data, update, now().toISOString()))
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Review task not found.',
          requestId: request.id,
        },
      });
    repository.audit({
      id: randomUUID(),
      actorUserId: user.id,
      action: 'review_task_updated',
      entityType: 'review_task',
      entityId: id.data,
      reasonCode,
      note,
      createdAt: now().toISOString(),
    });
    return { status: 'updated' };
  });
  app.get('/api/reviewer/audit', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    const parsed = z
      .strictObject({
        q: z.string().trim().max(120).default(''),
        entityType: z.string().trim().max(80).optional(),
      })
      .safeParse(request.query);
    if (!database || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid audit search.',
          requestId: request.id,
        },
      });
    return new ReviewerOperationsRepository(database).auditSearch(
      parsed.data.q,
      parsed.data.entityType,
    );
  });
  app.get('/api/reviewer/analytics', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database
      ? new AnalyticsRepository(database).snapshot(now().toISOString())
      : reply.code(503).send({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Analytics are unavailable.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/privacy/consent', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return {
      currentVersion: '2026-09-20',
      receipts: database
        ? new PrivacyRepository(database).consent(user.id)
        : [],
    };
  });
  app.post('/api/privacy/consent', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = z
      .strictObject({
        noticeVersion: z.literal('2026-09-20'),
        accepted: z.literal(true),
      })
      .safeParse(request.body);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Current privacy notice acceptance is required.',
          requestId: request.id,
        },
      });
    new PrivacyRepository(database).acceptConsent(
      user.id,
      parsed.data.noticeVersion,
      now().toISOString(),
    );
    return reply.code(201).send({ status: 'accepted' });
  });
  app.get('/api/privacy/export', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !database)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    reply.header(
      'Content-Disposition',
      'attachment; filename="suraksha-account-export.json"',
    );
    return new PrivacyRepository(database).exportAccount(user.id);
  });
  app.post('/api/privacy/deletion-requests', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = z
      .strictObject({ reason: z.string().trim().min(10).max(1000) })
      .safeParse(request.body);
    if (!user || !database)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A deletion reason is required.',
          requestId: request.id,
        },
      });
    new PrivacyRepository(database).requestDeletion(
      randomUUID(),
      user.id,
      parsed.data.reason,
      now().toISOString(),
    );
    return reply.code(202).send({ status: 'submitted' });
  });
  app.get('/api/grievances/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database ? new PrivacyRepository(database).grievances(user.id) : [];
  });
  app.post('/api/grievances', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = grievanceSchema.safeParse(request.body);
    if (!user || !database)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Complete grievance details are required.',
          requestId: request.id,
        },
      });
    if (!withinRateLimit(`grievance:${user.id}`))
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many submissions. Try again later.',
          requestId: request.id,
        },
      });
    const record = {
      id: randomUUID(),
      userId: user.id,
      ...parsed.data,
      now: now().toISOString(),
    };
    new PrivacyRepository(database).submitGrievance(record);
    return reply.code(201).send({ id: record.id, status: 'submitted' });
  });
  app.get('/api/reviewer/grievances', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database ? new PrivacyRepository(database).grievances() : [];
  });
  app.post('/api/reviewer/grievances/:id/decision', async (request, reply) => {
    const user = currentUser(request.headers);
    const id = z.uuid().safeParse((request.params as { id?: unknown }).id);
    const parsed = z
      .strictObject({
        status: z.enum(['actioned', 'dismissed']),
        reason: z.string().trim().min(10).max(1000),
      })
      .safeParse(request.body);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database || !id.success || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid grievance decision is required.',
          requestId: request.id,
        },
      });
    const decided = new PrivacyRepository(database).decideGrievance(
      id.data,
      parsed.data.status,
      parsed.data.reason,
      now().toISOString(),
    );
    if (decided)
      auditDecision(
        user.id,
        'grievance',
        id.data,
        parsed.data.status,
        parsed.data.reason,
      );
    return decided
      ? { status: parsed.data.status }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Grievance is not pending.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/buildings/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new ManagedBuildingRepository(database).listForOwner(user.id)
      : [];
  });

  app.get('/api/buildings', async (request, reply) => {
    if (!database) return [];
    const parsed = z
      .strictObject({ candidateId: z.uuid() })
      .safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid property candidate is required.',
          requestId: request.id,
        },
      });
    return new ManagedBuildingRepository(database)
      .listForCandidate(parsed.data.candidateId)
      .map(({ ownerUserId: _ownerUserId, ...record }) => record);
  });

  app.get('/api/evidence/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database) return [];
    return new EvidenceUploadRepository(database)
      .listForUser(user.id)
      .map(({ storageKey: _storageKey, userId: _userId, ...record }) => record);
  });

  app.post('/api/evidence/upload', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !uploadRoot)
      return reply.code(503).send({
        error: {
          code: 'UPLOAD_UNAVAILABLE',
          message: 'Private upload storage is unavailable.',
          requestId: request.id,
        },
      });
    const part = await request.file();
    if (!part)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Choose one photo or video.',
          requestId: request.id,
        },
      });
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    const extension = extensions[part.mimetype];
    if (!extension)
      return reply.code(415).send({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Only JPEG, PNG, WebP, MP4 and WebM files are accepted.',
          requestId: request.id,
        },
      });
    const buffer = await part.toBuffer();
    const maximum = part.mimetype.startsWith('image/')
      ? 10_000_000
      : 50_000_000;
    if (buffer.length === 0 || buffer.length > maximum)
      return reply.code(413).send({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Photo limit is 10 MB and video limit is 50 MB.',
          requestId: request.id,
        },
      });
    if (!contentMatchesMediaType(part.mimetype, buffer))
      return reply.code(415).send({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'File content does not match its declared media type.',
          requestId: request.id,
        },
      });
    const id = randomUUID();
    const storageKey = `${user.id}/${id}.${extension}`;
    const path = resolve(uploadRoot, storageKey);
    if (
      !path.startsWith(`${uploadRoot}\\`) &&
      !path.startsWith(`${uploadRoot}/`)
    )
      throw new Error('Invalid storage path');
    await mkdir(resolve(uploadRoot, user.id), { recursive: true });
    await writeFile(path, buffer, { flag: 'wx' });
    const record = {
      id,
      userId: user.id,
      originalName: basename(part.filename).slice(0, 180),
      mediaType: part.mimetype,
      byteSize: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      storageKey,
      moderationStatus: 'pending' as const,
      createdAt: now().toISOString(),
    };
    new EvidenceUploadRepository(database).save(record);
    const {
      storageKey: _storageKey,
      userId: _userId,
      ...publicRecord
    } = record;
    return reply.code(201).send(publicRecord);
  });

  app.get('/api/evidence/:id/file', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const record =
      identifier.success && database
        ? new EvidenceUploadRepository(database).getForUser(
            identifier.data,
            user.id,
          )
        : null;
    if (!record || !uploadRoot)
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Evidence not found.',
          requestId: request.id,
        },
      });
    reply.header('Content-Type', record.mediaType);
    reply.header(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(record.originalName)}"`,
    );
    return reply.send(createReadStream(resolve(uploadRoot, record.storageKey)));
  });

  app.get('/api/reports/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new IssueReportRepository(database).listForUser(user.id)
      : [];
  });

  app.post('/api/reports', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Reporting is unavailable.',
          requestId: request.id,
        },
      });
    const parsed = reportInputSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Complete the location, issue details and evidence requirements.',
          requestId: request.id,
        },
      });
    if (
      parsed.data.buildingId &&
      !new ManagedBuildingRepository(database).belongsToCandidate(
        parsed.data.buildingId,
        parsed.data.candidateId,
      )
    )
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Selected building does not belong to this property.',
          requestId: request.id,
        },
      });
    if (
      !new EvidenceUploadRepository(database).ownsAll(
        user.id,
        parsed.data.evidenceIds,
      )
    )
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reports may only attach your own evidence.',
          requestId: request.id,
        },
      });
    const record = {
      id: randomUUID(),
      ...parsed.data,
      reporterUserId: user.id,
      status: 'submitted' as const,
      createdAt: now().toISOString(),
    };
    try {
      new IssueReportRepository(database).save(record);
    } catch {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The selected property or evidence is unavailable.',
          requestId: request.id,
        },
      });
    }
    return reply.code(201).send(record);
  });

  app.get('/api/reviewer/evidence', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database
      ? new EvidenceUploadRepository(database)
          .listPending()
          .map(({ storageKey: _storageKey, ...record }) => record)
      : [];
  });

  app.post('/api/reviewer/evidence/:id/decision', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Moderation is unavailable.',
          requestId: request.id,
        },
      });
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const decision = claimDecisionSchema.safeParse(request.body);
    if (!identifier.success || !decision.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid decision and reason are required.',
          requestId: request.id,
        },
      });
    const decided = new EvidenceUploadRepository(database).decide(
      identifier.data,
      decision.data.status,
      decision.data.reason,
    );
    if (decided)
      auditDecision(
        user.id,
        'evidence',
        identifier.data,
        decision.data.status,
        decision.data.reason,
      );
    return decided
      ? { status: decision.data.status }
      : reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Pending evidence not found.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/reviewer/reports', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database ? new IssueReportRepository(database).listForReview() : [];
  });

  app.post('/api/reviewer/reports/:id/decision', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const decision = claimDecisionSchema.safeParse(request.body);
    if (!database || !identifier.success || !decision.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid decision and reason are required.',
          requestId: request.id,
        },
      });
    const decided = new IssueReportRepository(database).decide(
      identifier.data,
      decision.data.status,
      decision.data.reason,
    );
    if (decided)
      auditDecision(
        user.id,
        'report',
        identifier.data,
        decision.data.status,
        decision.data.reason,
      );
    return decided
      ? { status: decision.data.status }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Only a submitted, unmerged report can be reviewed.',
            requestId: request.id,
          },
        });
  });

  app.post('/api/reviewer/reports/:id/merge', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const parsed = mergeSchema.safeParse(request.body);
    if (!database || !identifier.success || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Select a compatible target report and provide a reason.',
          requestId: request.id,
        },
      });
    return new IssueReportRepository(database).merge(
      identifier.data,
      parsed.data.targetReportId,
      parsed.data.reason,
    )
      ? { status: 'merged' }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message:
              'Reports must be distinct, unmerged and on the same property.',
            requestId: request.id,
          },
        });
  });

  app.post('/api/reviewer/reports/:id/unmerge', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const reason = z
      .strictObject({ reason: z.string().trim().min(10).max(1000) })
      .safeParse(request.body);
    if (!database || !identifier.success || !reason.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid report and reason are required.',
          requestId: request.id,
        },
      });
    return new IssueReportRepository(database).unmerge(
      identifier.data,
      reason.data.reason,
    )
      ? { status: 'submitted' }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Report is not merged.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/repairs/mine', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database ? new RepairRepository(database).list(user.id) : [];
  });

  app.get('/api/repairs/eligible', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database ? new RepairRepository(database).listEligible(user.id) : [];
  });

  app.post('/api/reports/:id/repair-plan', async (request, reply) => {
    const user = currentUser(request.headers);
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const parsed = repairPlanSchema.safeParse(request.body);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !identifier.success || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid action plan and target date are required.',
          requestId: request.id,
        },
      });
    const repository = new RepairRepository(database);
    if (!repository.ownerCanManage(user.id, identifier.data))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'An approved property claim is required.',
          requestId: request.id,
        },
      });
    repository.savePlan({
      reportId: identifier.data,
      ownerUserId: user.id,
      ...parsed.data,
      now: now().toISOString(),
      eventId: randomUUID(),
    });
    return reply.code(201).send({ status: 'action_planned' });
  });

  app.post('/api/reports/:id/request-reinspection', async (request, reply) => {
    const user = currentUser(request.headers);
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const parsed = reinspectionSchema.safeParse(request.body);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !identifier.success || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Repair evidence and a note are required.',
          requestId: request.id,
        },
      });
    const repository = new RepairRepository(database);
    if (
      !repository.ownerCanManage(user.id, identifier.data) ||
      !new EvidenceUploadRepository(database).ownsAll(
        user.id,
        parsed.data.evidenceIds,
      )
    )
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only the approved owner may attach their evidence.',
          requestId: request.id,
        },
      });
    return repository.requestReinspection({
      reportId: identifier.data,
      ownerUserId: user.id,
      ...parsed.data,
      now: now().toISOString(),
      eventId: randomUUID(),
    })
      ? { status: 'reinspection_requested' }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Create an action plan before requesting reinspection.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/reviewer/repairs', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database ? new RepairRepository(database).list() : [];
  });

  app.post('/api/reviewer/repairs/:id/decision', async (request, reply) => {
    const user = currentUser(request.headers);
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const parsed = repairDecisionSchema.safeParse(request.body);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database || !identifier.success || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid repair decision is required.',
          requestId: request.id,
        },
      });
    const decided = new RepairRepository(database).decide(
      identifier.data,
      parsed.data.status === 'resolved',
      parsed.data.reason,
      now().toISOString(),
      randomUUID(),
    );
    if (decided)
      auditDecision(
        user.id,
        'repair',
        identifier.data,
        parsed.data.status,
        parsed.data.reason,
      );
    return decided
      ? { status: parsed.data.status }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Reinspection and approved repair evidence are required.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/professional/credentials', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new InspectionRepository(database).credentials(user.id)
      : [];
  });

  app.post('/api/professional/credentials', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = credentialSchema.safeParse(request.body);
    const profile =
      user && database
        ? new AccountProfileRepository(database).get(user.id)
        : null;
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database || !parsed.success || profile?.role !== 'professional')
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Professional onboarding and valid credential details are required.',
          requestId: request.id,
        },
      });
    if (parsed.data.expiresOn < now().toISOString().slice(0, 10))
      return reply.code(400).send({
        error: {
          code: 'EXPIRED',
          message: 'Expired credentials cannot be submitted.',
          requestId: request.id,
        },
      });
    try {
      const record = {
        id: randomUUID(),
        userId: user.id,
        ...parsed.data,
        status: 'submitted' as const,
        createdAt: now().toISOString(),
      };
      new InspectionRepository(database).saveCredential(record);
      return reply.code(201).send(record);
    } catch {
      return reply.code(409).send({
        error: {
          code: 'CONFLICT',
          message: 'This license is already registered.',
          requestId: request.id,
        },
      });
    }
  });

  app.get('/api/reviewer/credentials', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    return database ? new InspectionRepository(database).credentials() : [];
  });

  app.post('/api/reviewer/credentials/:id/decision', async (request, reply) => {
    const user = currentUser(request.headers);
    const identifier = z
      .uuid()
      .safeParse((request.params as { id?: unknown }).id);
    const decision = claimDecisionSchema.safeParse(request.body);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database || !identifier.success || !decision.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid credential decision is required.',
          requestId: request.id,
        },
      });
    const decided = new InspectionRepository(database).decideCredential(
      identifier.data,
      decision.data.status,
      decision.data.reason,
    );
    if (decided)
      auditDecision(
        user.id,
        'credential',
        identifier.data,
        decision.data.status,
        decision.data.reason,
      );
    return decided
      ? { status: decision.data.status }
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Credential is not awaiting review.',
            requestId: request.id,
          },
        });
  });

  app.post('/api/reviewer/inspections', async (request, reply) => {
    const user = currentUser(request.headers);
    const parsed = assignmentSchema.safeParse(request.body);
    if (!user || !isDemoReviewer(user.email))
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Reviewer access is required.',
          requestId: request.id,
        },
      });
    if (!database || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid assignment details are required.',
          requestId: request.id,
        },
      });
    const record = {
      id: randomUUID(),
      ...parsed.data,
      createdAt: now().toISOString(),
    };
    return new InspectionRepository(database).assign(record)
      ? reply.code(201).send(record)
      : reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message:
              'Professional must have a current approved credential matching the report category.',
            requestId: request.id,
          },
        });
  });

  app.get('/api/professional/inspections', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    return database
      ? new InspectionRepository(database).assignments(user.id)
      : [];
  });

  app.post(
    '/api/professional/inspections/:id/conflict',
    async (request, reply) => {
      const user = currentUser(request.headers);
      const identifier = z
        .uuid()
        .safeParse((request.params as { id?: unknown }).id);
      const parsed = conflictSchema.safeParse(request.body);
      if (!user)
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Sign-in is required.',
            requestId: request.id,
          },
        });
      if (!database || !identifier.success || !parsed.success)
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A conflict declaration is required.',
            requestId: request.id,
          },
        });
      return new InspectionRepository(database).declareConflict(
        identifier.data,
        user.id,
        parsed.data.conflict,
        parsed.data.note,
      )
        ? { status: parsed.data.conflict ? 'conflicted' : 'accepted' }
        : reply.code(409).send({
            error: {
              code: 'CONFLICT',
              message: 'Assignment cannot be accepted.',
              requestId: request.id,
            },
          });
    },
  );

  app.post(
    '/api/professional/inspections/:id/result',
    async (request, reply) => {
      const user = currentUser(request.headers);
      const identifier = z
        .uuid()
        .safeParse((request.params as { id?: unknown }).id);
      const parsed = inspectionResultSchema.safeParse(request.body);
      if (!user)
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Sign-in is required.',
            requestId: request.id,
          },
        });
      if (!database || !identifier.success || !parsed.success)
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A valid inspection result is required.',
            requestId: request.id,
          },
        });
      return new InspectionRepository(database).submitResult({
        id: randomUUID(),
        assignmentId: identifier.data,
        userId: user.id,
        ...parsed.data,
        createdAt: now().toISOString(),
      })
        ? reply.code(201).send({ status: 'completed' })
        : reply.code(409).send({
            error: {
              code: 'CONFLICT',
              message:
                'Accepted, conflict-free assignment and current matching credential required.',
              requestId: request.id,
            },
          });
    },
  );

  app.post('/api/buildings', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Building management is unavailable.',
          requestId: request.id,
        },
      });
    const parsed = buildingSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Enter a valid approved property, building name and floor count.',
          requestId: request.id,
        },
      });
    if (
      !new PropertyClaimRepository(database).hasApproved(
        user.id,
        parsed.data.candidateId,
      )
    )
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'An approved owner claim is required.',
          requestId: request.id,
        },
      });
    const record = {
      id: randomUUID(),
      ...parsed.data,
      ownerUserId: user.id,
      createdAt: now().toISOString(),
    };
    new ManagedBuildingRepository(database).save(record);
    return reply.code(201).send(record);
  });

  app.get('/api/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = currentUser(request.headers);
    const profile =
      user && database
        ? new AccountProfileRepository(database).get(user.id)
        : null;
    return sessionResponseSchema.parse(
      user
        ? { authenticated: true, user, memberships: [], profile }
        : { authenticated: false },
    );
  });

  app.post('/api/onboarding', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign-in is required.',
          requestId: request.id,
        },
      });
    if (!database)
      return reply.code(503).send({
        error: {
          code: 'ONBOARDING_UNAVAILABLE',
          message: 'Onboarding is not configured.',
          requestId: request.id,
        },
      });
    const parsed = onboardingSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Choose a supported account role.',
          requestId: request.id,
        },
      });
    const profile = new AccountProfileRepository(database).save(
      user.id,
      parsed.data.role,
      now(),
    );
    return { authenticated: true, user, memberships: [], profile };
  });

  app.post('/api/auth/register', async (request, reply) => {
    if (mode !== 'demo' || !database)
      return reply.code(503).send({
        error: {
          code: 'AUTH_UNAVAILABLE',
          message: 'Authentication provider is not configured.',
          requestId: request.id,
        },
      });
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Enter a valid name, email and password of at least 8 characters.',
          requestId: request.id,
        },
      });
    try {
      const result = registerDemoUser(database, parsed.data, now());
      reply.header('Set-Cookie', sessionCookie(result.token, result.expiresAt));
      return reply.code(201).send({
        authenticated: true,
        user: result.user,
        memberships: [],
        profile: null,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE'))
        return reply.code(409).send({
          error: {
            code: 'CONFLICT',
            message: 'An account with this email already exists.',
            requestId: request.id,
          },
        });
      throw error;
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    if (mode !== 'demo' || !database)
      return reply.code(503).send({
        error: {
          code: 'AUTH_UNAVAILABLE',
          message: 'Authentication provider is not configured.',
          requestId: request.id,
        },
      });
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Enter a valid email and password.',
          requestId: request.id,
        },
      });
    const result = loginDemoUser(
      database,
      parsed.data.email,
      parsed.data.password,
      now(),
    );
    if (!result)
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Email or password is incorrect.',
          requestId: request.id,
        },
      });
    reply.header('Set-Cookie', sessionCookie(result.token, result.expiresAt));
    return {
      authenticated: true,
      user: result.user,
      memberships: [],
      profile: new AccountProfileRepository(database).get(result.user.id),
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (database) revokeDemoSession(database, request.headers.cookie);
    reply.header('Set-Cookie', clearSessionCookie);
    return reply.code(204).send();
  });

  app.get('/api/private/check', async (request, reply) => {
    const user = currentUser(request.headers);
    if (!user)
      return reply.code(401).send(
        authFailureSchema.parse({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Sign-in is required for this action.',
            requestId: request.id,
          },
        }),
      );
    return { authenticated: true };
  });

  if (options.webRoot) {
    app.register(fastifyStatic, { root: options.webRoot });
  }

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(
      apiErrorSchema.parse({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found.',
          requestId: request.id,
        },
      }),
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : 500;
    request.log.error({ err: error }, 'Request failed');
    return reply.code(status).send(
      apiErrorSchema.parse({
        error: {
          code: status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
          message:
            status < 500
              ? 'Request could not be accepted.'
              : 'An unexpected error occurred.',
          requestId: request.id,
        },
      }),
    );
  });

  return app;
}
