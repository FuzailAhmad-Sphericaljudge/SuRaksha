import { z } from 'zod';
import {
  entityIdSchema,
  recordMetaSchema,
  utcTimestampSchema,
} from './common.js';

export const issueCategorySchema = z.enum([
  'fire_safety',
  'electrical',
  'structural',
  'water_ingress',
  'blocked_access',
  'overcrowding',
  'sanitation',
  'other_safety',
]);
export const severitySchema = z.enum([
  'unassessed',
  'low',
  'medium',
  'high',
  'critical',
]);
export const verificationStatusSchema = z.enum([
  'reported',
  'corroborated',
  'evidence_reviewed',
  'site_inspected',
  'fix_submitted',
  'fix_verified',
]);
export const workflowStatusSchema = z.enum([
  'submitted',
  'triaged',
  'assigned',
  'in_progress',
  'fix_submitted',
  'closed',
  'reopened',
  'disputed',
]);
export const reportSchema = z
  .strictObject({
    id: entityIdSchema,
    propertyId: entityIdSchema,
    buildingId: entityIdSchema,
    areaId: entityIdSchema.nullable(),
    reporterUserId: entityIdSchema,
    category: issueCategorySchema,
    title: z.string().trim().min(5).max(140),
    description: z.string().trim().min(20).max(4000),
    workflowStatus: workflowStatusSchema,
    verificationStatus: verificationStatusSchema,
    severity: severitySchema,
    severityReviewedAt: utcTimestampSchema.nullable(),
    visibility: z.enum(['private_review', 'public_redacted', 'confidential']),
    mergedIntoReportId: entityIdSchema.nullable(),
  })
  .and(recordMetaSchema)
  .superRefine((value, context) => {
    if (value.severity !== 'unassessed' && value.severityReviewedAt === null)
      context.addIssue({
        code: 'custom',
        message: 'Assessed severity requires a review timestamp',
        path: ['severityReviewedAt'],
      });
    if (
      value.workflowStatus === 'closed' &&
      value.verificationStatus !== 'fix_verified'
    )
      context.addIssue({
        code: 'custom',
        message: 'Only a verified fix can close a report',
        path: ['verificationStatus'],
      });
    if (
      value.workflowStatus === 'fix_submitted' &&
      value.verificationStatus !== 'fix_submitted'
    )
      context.addIssue({
        code: 'custom',
        message: 'Fix submission states must agree',
        path: ['verificationStatus'],
      });
    if (value.mergedIntoReportId === value.id)
      context.addIssue({
        code: 'custom',
        message: 'A report cannot merge into itself',
        path: ['mergedIntoReportId'],
      });
  });
const workflowTransitions: Record<
  z.infer<typeof workflowStatusSchema>,
  readonly z.infer<typeof workflowStatusSchema>[]
> = {
  submitted: ['triaged', 'disputed'],
  triaged: ['assigned', 'disputed'],
  assigned: ['in_progress', 'disputed'],
  in_progress: ['fix_submitted', 'disputed'],
  fix_submitted: ['closed', 'in_progress', 'disputed'],
  closed: ['reopened'],
  reopened: ['triaged', 'assigned', 'disputed'],
  disputed: ['triaged', 'assigned', 'in_progress', 'closed'],
};
export function canTransitionWorkflow(
  from: z.infer<typeof workflowStatusSchema>,
  to: z.infer<typeof workflowStatusSchema>,
): boolean {
  return workflowTransitions[from].includes(to);
}
export type Report = z.infer<typeof reportSchema>;
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
