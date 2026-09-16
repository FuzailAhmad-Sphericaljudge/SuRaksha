import { z } from 'zod';
import { utcTimestampSchema } from './common.js';

export * from './common.js';
export * from './discovery.js';
export * from './evidence.js';
export * from './fixtures.js';
export * from './identity.js';
export * from './property.js';
export * from './report.js';
export * from './review.js';

// Liveness only: this is not a building safety or dependency-readiness claim.
export const healthResponseSchema = z.strictObject({
  service: z.literal('suraksha-api'),
  status: z.literal('ok'),
  timestamp: utcTimestampSchema,
});

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(['NOT_FOUND', 'BAD_REQUEST', 'INTERNAL_ERROR']),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
