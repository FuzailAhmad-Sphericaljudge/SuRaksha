import { z } from 'zod';
import {
  entityIdSchema,
  nonEmptyTextSchema,
  recordMetaSchema,
  utcTimestampSchema,
} from './common.js';
import { issueCategorySchema } from './report.js';

export const propertyClaimSchema = z
  .strictObject({
    id: entityIdSchema,
    propertyId: entityIdSchema,
    claimantUserId: entityIdSchema,
    status: z.enum([
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'withdrawn',
    ]),
    reviewedByUserId: entityIdSchema.nullable(),
    reviewedAt: utcTimestampSchema.nullable(),
    decisionReason: z.string().trim().min(1).max(1000).nullable(),
  })
  .and(recordMetaSchema)
  .superRefine((value, context) => {
    const decided = ['approved', 'rejected'].includes(value.status);
    const hasDecision =
      value.reviewedByUserId !== null &&
      value.reviewedAt !== null &&
      value.decisionReason !== null;
    if (decided !== hasDecision)
      context.addIssue({
        code: 'custom',
        message: 'Claim decision requires reviewer, time and reason',
        path: ['status'],
      });
  });

export const inspectionSchema = z
  .strictObject({
    id: entityIdSchema,
    propertyId: entityIdSchema,
    buildingId: entityIdSchema,
    reportId: entityIdSchema.nullable(),
    inspectorMembershipId: entityIdSchema.nullable(),
    scope: z.array(issueCategorySchema).min(1).max(8),
    status: z.enum([
      'requested',
      'assigned',
      'scheduled',
      'completed',
      'cancelled',
    ]),
    scheduledFor: utcTimestampSchema.nullable(),
    completedAt: utcTimestampSchema.nullable(),
    limitations: nonEmptyTextSchema.max(2000).nullable(),
  })
  .and(recordMetaSchema)
  .superRefine((value, context) => {
    if (new Set(value.scope).size !== value.scope.length)
      context.addIssue({
        code: 'custom',
        message: 'Inspection scope cannot contain duplicates',
        path: ['scope'],
      });
    if (
      ['assigned', 'scheduled', 'completed'].includes(value.status) &&
      value.inspectorMembershipId === null
    )
      context.addIssue({
        code: 'custom',
        message: 'Assigned inspections require an inspector',
        path: ['inspectorMembershipId'],
      });
    if (
      value.status === 'completed' &&
      (value.completedAt === null || value.limitations === null)
    )
      context.addIssue({
        code: 'custom',
        message:
          'Completed inspections require completion time and limitations',
        path: ['completedAt'],
      });
    if (value.status !== 'completed' && value.completedAt !== null)
      context.addIssue({
        code: 'custom',
        message: 'Only completed inspections have completedAt',
        path: ['completedAt'],
      });
  });

export const auditEntrySchema = z
  .strictObject({
    id: entityIdSchema,
    actorUserId: entityIdSchema.nullable(),
    actorType: z.enum(['user', 'system']),
    action: z.enum([
      'created',
      'updated',
      'status_changed',
      'merged',
      'unmerged',
      'claim_decided',
      'inspection_completed',
      'visibility_changed',
    ]),
    entityType: z.enum([
      'property',
      'building',
      'membership',
      'report',
      'evidence',
      'claim',
      'inspection',
    ]),
    entityId: entityIdSchema,
    occurredAt: utcTimestampSchema,
    reason: nonEmptyTextSchema.max(1000),
    fromState: z.record(z.string(), z.unknown()).nullable(),
    toState: z.record(z.string(), z.unknown()).nullable(),
  })
  .superRefine((value, context) => {
    if (value.actorType === 'user' && value.actorUserId === null)
      context.addIssue({
        code: 'custom',
        message: 'User actions require an actor ID',
        path: ['actorUserId'],
      });
    if (value.actorType === 'system' && value.actorUserId !== null)
      context.addIssue({
        code: 'custom',
        message: 'System actions must not impersonate a user',
        path: ['actorUserId'],
      });
  });

export type PropertyClaim = z.infer<typeof propertyClaimSchema>;
export type Inspection = z.infer<typeof inspectionSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
