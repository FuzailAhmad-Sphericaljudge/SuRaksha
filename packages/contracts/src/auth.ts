import { z } from 'zod';
import {
  entityIdSchema,
  recordMetaSchema,
  utcTimestampSchema,
} from './common.js';
import { roleSchema } from './identity.js';

export const authenticatedUserSchema = z.strictObject({
  id: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  displayName: z.string().trim().min(1).max(100),
});

export const sessionResponseSchema = z.discriminatedUnion('authenticated', [
  z.strictObject({ authenticated: z.literal(false) }),
  z.strictObject({
    authenticated: z.literal(true),
    user: authenticatedUserSchema,
    memberships: z
      .array(
        z
          .strictObject({
            id: entityIdSchema,
            propertyId: entityIdSchema.nullable(),
            role: roleSchema,
            status: z.literal('active'),
            expiresAt: utcTimestampSchema.nullable(),
          })
          .and(recordMetaSchema),
      )
      .max(20),
  }),
]);

export const authFailureSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(['UNAUTHORIZED', 'FORBIDDEN']),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
