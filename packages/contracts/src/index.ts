import { z } from 'zod';

// UTC only. A local timestamp or offset must not silently cross API boundaries.
export const utcTimestampSchema = z.iso.datetime({ offset: false });

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
