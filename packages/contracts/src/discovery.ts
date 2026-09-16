import { z } from 'zod';
import {
  entityIdSchema,
  paginationMetaSchema,
  nonEmptyTextSchema,
} from './common.js';
import { propertyTypeSchema } from './property.js';

export const discoveryQuerySchema = z.strictObject({
  query: z.string().trim().max(160).default(''),
  type: propertyTypeSchema.or(z.literal('all')).default('all'),
});

export const discoveryResultSchema = z.strictObject({
  propertyId: entityIdSchema,
  name: nonEmptyTextSchema.max(160),
  type: propertyTypeSchema,
  displayAddress: nonEmptyTextSchema.max(240),
  matchReason: z.enum(['name', 'address', 'landmark', 'nearby']),
  identityStatus: z.enum(['unconfirmed', 'reviewed']),
  dataMode: z.literal('demo'),
});

export const discoveryResponseSchema = z.strictObject({
  results: z.array(discoveryResultSchema).max(100),
  pagination: paginationMetaSchema,
});

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
