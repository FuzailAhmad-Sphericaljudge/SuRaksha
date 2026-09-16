import { z } from 'zod';
import {
  entityIdSchema,
  recordMetaSchema,
  utcTimestampSchema,
} from './common.js';

export const roleSchema = z.enum([
  'student',
  'owner_manager',
  'parent_guardian',
  'professional',
  'internal_reviewer',
]);
export const userSchema = z
  .strictObject({
    id: entityIdSchema,
    displayName: z.string().trim().min(1).max(100),
    accountStatus: z.enum(['active', 'suspended', 'deleted']),
    phoneVerifiedAt: utcTimestampSchema.nullable(),
  })
  .and(recordMetaSchema);
export const membershipSchema = z
  .strictObject({
    id: entityIdSchema,
    userId: entityIdSchema,
    propertyId: entityIdSchema.nullable(),
    role: roleSchema,
    status: z.enum(['pending', 'active', 'revoked', 'expired']),
    assurance: z.enum([
      'account_only',
      'residency_reviewed',
      'enrolment_reviewed',
      'management_claim_approved',
      'credential_reviewed',
      'staff_provisioned',
    ]),
    validUntil: utcTimestampSchema.nullable(),
  })
  .and(recordMetaSchema)
  .superRefine((value, context) => {
    if (value.role === 'internal_reviewer' && value.propertyId !== null)
      context.addIssue({
        code: 'custom',
        message: 'Internal reviewers are not property memberships',
        path: ['propertyId'],
      });
    if (value.role !== 'internal_reviewer' && value.propertyId === null)
      context.addIssue({
        code: 'custom',
        message: 'This role must be scoped to a property',
        path: ['propertyId'],
      });
    const assuranceByRole: Record<
      z.infer<typeof roleSchema>,
      readonly string[]
    > = {
      student: ['account_only', 'residency_reviewed', 'enrolment_reviewed'],
      owner_manager: ['management_claim_approved'],
      parent_guardian: ['account_only'],
      professional: ['credential_reviewed'],
      internal_reviewer: ['staff_provisioned'],
    };
    if (!assuranceByRole[value.role].includes(value.assurance))
      context.addIssue({
        code: 'custom',
        message: 'Assurance is not valid for this role',
        path: ['assurance'],
      });
  });

export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type Membership = z.infer<typeof membershipSchema>;
