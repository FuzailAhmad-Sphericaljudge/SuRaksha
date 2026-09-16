import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
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
};

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const mode = options.mode ?? 'demo';
  const database = options.database;
  const credentialsSchema = z.strictObject({
    email: z.email().max(320),
    password: z.string().min(8).max(128),
  });
  const registrationSchema = credentialsSchema.extend({
    displayName: z.string().trim().min(2).max(100),
  });
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

  app.get('/api/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = currentUser(request.headers);
    return sessionResponseSchema.parse(
      user
        ? { authenticated: true, user, memberships: [] }
        : { authenticated: false },
    );
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
      return reply
        .code(201)
        .send({ authenticated: true, user: result.user, memberships: [] });
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
    return { authenticated: true, user: result.user, memberships: [] };
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
