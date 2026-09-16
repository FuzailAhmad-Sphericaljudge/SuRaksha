import { z } from 'zod';
import {
  dataClassificationSchema,
  entityIdSchema,
  recordMetaSchema,
  utcTimestampSchema,
} from './common.js';

export const evidenceUploadIntentSchema = z
  .strictObject({
    reportId: entityIdSchema,
    kind: z.enum(['photo', 'video', 'document']),
    mediaType: z.string().regex(/^(image|video|application)\/[a-z0-9.+-]+$/i),
    byteSize: z.number().int().positive().max(500_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,120}$/),
  })
  .superRefine((value, context) => {
    if (
      value.kind === 'photo' &&
      !value.mediaType.toLowerCase().startsWith('image/')
    )
      context.addIssue({
        code: 'custom',
        message: 'Photos require an image media type',
        path: ['mediaType'],
      });
    if (
      value.kind === 'video' &&
      !value.mediaType.toLowerCase().startsWith('video/')
    )
      context.addIssue({
        code: 'custom',
        message: 'Videos require a video media type',
        path: ['mediaType'],
      });
    if (
      value.kind === 'document' &&
      !value.mediaType.toLowerCase().startsWith('application/')
    )
      context.addIssue({
        code: 'custom',
        message: 'Documents require an application media type',
        path: ['mediaType'],
      });
  });

export type EvidenceUploadIntent = z.infer<typeof evidenceUploadIntentSchema>;

export const evidenceSchema = z
  .strictObject({
    id: entityIdSchema,
    reportId: entityIdSchema,
    submittedByUserId: entityIdSchema,
    kind: z.enum(['photo', 'video', 'document']),
    purpose: z.enum(['initial', 'corroboration', 'repair', 'recheck']),
    objectKey: z
      .string()
      .regex(
        /^restricted\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/,
      )
      .max(500),
    mediaType: z.string().regex(/^(image|video|application)\/[a-z0-9.+-]+$/i),
    byteSize: z.number().int().positive().max(500_000_000),
    uploadedAt: utcTimestampSchema,
    claimedCapturedAt: utcTimestampSchema.nullable(),
    relevantVideoSecond: z.number().finite().min(0).nullable(),
    moderationStatus: z.enum(['pending', 'approved', 'rejected', 'redacted']),
    classification: dataClassificationSchema,
    publicDerivativeKey: z
      .string()
      .regex(
        /^public\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/,
      )
      .max(500)
      .nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .and(recordMetaSchema)
  .superRefine((value, context) => {
    if (value.relevantVideoSecond !== null && value.kind !== 'video')
      context.addIssue({
        code: 'custom',
        message: 'A video timestamp is only valid for video evidence',
        path: ['relevantVideoSecond'],
      });
    if (
      value.publicDerivativeKey !== null &&
      !['approved', 'redacted'].includes(value.moderationStatus)
    )
      context.addIssue({
        code: 'custom',
        message: 'Only cleared media can have a public derivative',
        path: ['publicDerivativeKey'],
      });
    if (value.publicDerivativeKey !== null && value.classification !== 'public')
      context.addIssue({
        code: 'custom',
        message: 'Public derivatives require public classification',
        path: ['classification'],
      });
  });
export type Evidence = z.infer<typeof evidenceSchema>;
