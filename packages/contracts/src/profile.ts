import { z } from 'zod';
import { entityIdSchema, utcTimestampSchema } from './common.js';
import { issueCategorySchema, severitySchema } from './report.js';

export const categoryFindingSchema = z
  .strictObject({
    category: issueCategorySchema,
    status: z.enum([
      'unknown',
      'no_issue_reported',
      'reported',
      'verified_issue',
      'fix_verified',
    ]),
    openReportCount: z.number().int().min(0),
    highestSeverity: severitySchema,
    lastReviewedAt: utcTimestampSchema.nullable(),
    sourceLabel: z.string().trim().min(1).max(160).nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.status === 'unknown' &&
      (value.openReportCount !== 0 ||
        value.highestSeverity !== 'unassessed' ||
        value.lastReviewedAt !== null ||
        value.sourceLabel !== null)
    )
      context.addIssue({
        code: 'custom',
        message: 'Unknown findings cannot imply reviewed evidence',
        path: ['status'],
      });
    if (
      value.status !== 'unknown' &&
      (value.lastReviewedAt === null || value.sourceLabel === null)
    )
      context.addIssue({
        code: 'custom',
        message: 'Known findings require source and freshness',
        path: ['lastReviewedAt'],
      });
  });

export const buildingProfileSchema = z
  .strictObject({
    buildingId: entityIdSchema,
    generatedAt: utcTimestampSchema,
    findings: z.array(categoryFindingSchema).length(8),
    publicMediaKeys: z
      .array(
        z
          .string()
          .regex(
            /^public\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/,
          ),
      )
      .max(30),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.findings.map((finding) => finding.category)).size !==
      value.findings.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Each category appears exactly once',
        path: ['findings'],
      });
  });

export type CategoryFinding = z.infer<typeof categoryFindingSchema>;
export type BuildingProfile = z.infer<typeof buildingProfileSchema>;
