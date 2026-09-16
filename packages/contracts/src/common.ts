import { z } from 'zod';

export const utcTimestampSchema = z.iso.datetime({ offset: false });
export const localDateSchema = z.iso.date();
export const entityIdSchema = z.uuid();
export const nonEmptyTextSchema = z.string().trim().min(1);

export const paginationQuerySchema = z.strictObject({
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(512)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationMetaSchema = z.strictObject({
  nextCursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(512)
    .nullable(),
  hasMore: z.boolean(),
});

export const recordMetaSchema = z
  .strictObject({
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
  })
  .refine((value) => value.updatedAt >= value.createdAt, {
    message: 'updatedAt must be at or after createdAt',
    path: ['updatedAt'],
  });

export const dataClassificationSchema = z.enum([
  'public',
  'restricted',
  'confidential',
]);

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
