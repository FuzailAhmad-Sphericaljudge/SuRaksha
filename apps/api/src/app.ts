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
  const currentUser = (headers: IncomingHttpHeaders) =>
    (database && mode === 'demo'
      ? readDemoUser(
          database,
          typeof headers.cookie === 'string' ? headers.cookie : undefined,
          now(),
        )
      : null) ?? readWorkspaceIdentity(headers);
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
    const decided = new PropertyClaimRepository(database).decide(
      identifier.data,
      parsed.data.status,
      parsed.data.reason,
      now().toISOString(),
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
    if (mode !== 'demo' || !database)
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
