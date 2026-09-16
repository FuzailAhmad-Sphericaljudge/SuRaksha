import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import {
  apiErrorSchema,
  authFailureSchema,
  healthResponseSchema,
  sessionResponseSchema,
} from '@suraksha/contracts';
import { readWorkspaceIdentity } from './workspaceIdentity.js';

type AppOptions = {
  now?: () => Date;
  logLevel?: string;
  webRoot?: string;
};

export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
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

  app.get('/api/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = readWorkspaceIdentity(request.headers);
    return sessionResponseSchema.parse(
      user
        ? { authenticated: true, user, memberships: [] }
        : { authenticated: false },
    );
  });

  app.get('/api/private/check', async (request, reply) => {
    const user = readWorkspaceIdentity(request.headers);
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
