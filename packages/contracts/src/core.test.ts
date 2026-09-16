import { describe, expect, it } from 'vitest';
import {
  DEMO_NOTICE,
  auditEntrySchema,
  canTransitionWorkflow,
  demoArea,
  demoBuilding,
  demoProperty,
  demoReport,
  discoveryQuerySchema,
  discoveryResponseSchema,
  evidenceSchema,
  floorAreaSchema,
  inspectionSchema,
  membershipCanManageProperty,
  membershipSchema,
  paginationQuerySchema,
  propertyClaimSchema,
  propertySchema,
  professionalCredentialSchema,
  professionalCredentialUsable,
  type ProfessionalCredential,
  reportSchema,
} from './index.js';

const id = (suffix: number) =>
  `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const createdAt = '2026-09-16T08:00:00.000Z';
const updatedAt = '2026-09-16T09:00:00.000Z';

describe('fictional property fixtures', () => {
  it('parses every fixture and cannot be represented as live data', () => {
    expect(DEMO_NOTICE).toContain('Fictional demonstration data');
    expect(propertySchema.parse(demoProperty).dataMode).toBe('demo');
    expect(() =>
      propertySchema.parse({ ...demoProperty, dataMode: 'live' }),
    ).toThrow();
    expect(demoBuilding.propertyId).toBe(demoProperty.id);
    expect(floorAreaSchema.parse(demoArea).buildingId).toBe(demoBuilding.id);
    expect(reportSchema.parse(demoReport).verificationStatus).toBe('reported');
  });

  it('rejects invalid coordinates, postcodes, time ordering and private room numbers', () => {
    expect(
      propertySchema.safeParse({
        ...demoProperty,
        location: { latitude: 91, longitude: 77 },
      }).success,
    ).toBe(false);
    expect(
      propertySchema.safeParse({
        ...demoProperty,
        address: { ...demoProperty.address, postalCode: '1100' },
      }).success,
    ).toBe(false);
    expect(
      propertySchema.safeParse({
        ...demoProperty,
        updatedAt: '2026-09-15T09:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      floorAreaSchema.safeParse({
        ...demoArea,
        areaKind: 'room',
        isPrivateRoom: true,
        publicLabel: 'Room 204',
      }).success,
    ).toBe(false);
  });
});

describe('roles and claims', () => {
  const membership = {
    id: id(1),
    userId: id(2),
    propertyId: demoProperty.id,
    role: 'student',
    status: 'active',
    assurance: 'account_only',
    validUntil: null,
    createdAt,
    updatedAt,
  } as const;

  it('requires role-appropriate assurance and property scope', () => {
    expect(membershipSchema.safeParse(membership).success).toBe(true);
    expect(
      membershipSchema.safeParse({ ...membership, role: 'owner_manager' })
        .success,
    ).toBe(false);
    expect(
      membershipSchema.safeParse({ ...membership, propertyId: null }).success,
    ).toBe(false);
    expect(
      membershipSchema.safeParse({
        ...membership,
        role: 'internal_reviewer',
        propertyId: null,
        assurance: 'staff_provisioned',
      }).success,
    ).toBe(true);
  });

  it('requires complete, traceable claim decisions', () => {
    const claim = {
      id: id(3),
      propertyId: demoProperty.id,
      claimantUserId: id(2),
      status: 'submitted',
      reviewedByUserId: null,
      reviewedAt: null,
      decisionReason: null,
      createdAt,
      updatedAt,
    };
    expect(propertyClaimSchema.safeParse(claim).success).toBe(true);
    expect(
      propertyClaimSchema.safeParse({ ...claim, status: 'approved' }).success,
    ).toBe(false);
    expect(
      propertyClaimSchema.safeParse({
        ...claim,
        status: 'approved',
        reviewedByUserId: id(4),
        reviewedAt: updatedAt,
        decisionReason: 'Management documents reviewed.',
      }).success,
    ).toBe(true);
  });

  it('only grants property management after an approved claim', () => {
    expect(membershipCanManageProperty(membership, demoProperty.id)).toBe(
      false,
    );
    const owner = {
      ...membership,
      role: 'owner_manager',
      assurance: 'management_claim_approved',
    } as const;
    expect(membershipCanManageProperty(owner, demoProperty.id)).toBe(true);
    expect(membershipCanManageProperty(owner, demoBuilding.id)).toBe(false);
  });
});

describe('report states and transitions', () => {
  it('keeps workflow, verification and severity independent', () => {
    expect(
      reportSchema.safeParse({ ...demoReport, severity: 'high' }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({ ...demoReport, workflowStatus: 'closed' })
        .success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        ...demoReport,
        workflowStatus: 'fix_submitted',
        verificationStatus: 'reported',
      }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        ...demoReport,
        workflowStatus: 'closed',
        verificationStatus: 'fix_verified',
      }).success,
    ).toBe(true);
  });

  it('rejects skipped, no-op and invalid reopening transitions', () => {
    expect(canTransitionWorkflow('submitted', 'triaged')).toBe(true);
    expect(canTransitionWorkflow('submitted', 'closed')).toBe(false);
    expect(canTransitionWorkflow('submitted', 'submitted')).toBe(false);
    expect(canTransitionWorkflow('closed', 'reopened')).toBe(true);
    expect(canTransitionWorkflow('closed', 'in_progress')).toBe(false);
  });

  it('does not allow a report to merge into itself', () => {
    expect(
      reportSchema.safeParse({
        ...demoReport,
        mergedIntoReportId: demoReport.id,
      }).success,
    ).toBe(false);
  });
});

describe('evidence and inspection boundaries', () => {
  const evidence = {
    id: id(5),
    reportId: demoReport.id,
    submittedByUserId: id(2),
    kind: 'photo',
    purpose: 'initial',
    objectKey: 'restricted/reports/demo/photo-1',
    mediaType: 'image/jpeg',
    byteSize: 120_000,
    uploadedAt: updatedAt,
    claimedCapturedAt: null,
    relevantVideoSecond: null,
    moderationStatus: 'pending',
    classification: 'restricted',
    publicDerivativeKey: null,
    sha256: 'a'.repeat(64),
    createdAt,
    updatedAt,
  } as const;

  it('keeps originals restricted and allows public derivatives only after clearance', () => {
    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    expect(
      evidenceSchema.safeParse({
        ...evidence,
        objectKey: 'public/original.jpg',
      }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...evidence,
        publicDerivativeKey: 'public/report/photo-1.jpg',
      }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...evidence,
        classification: 'public',
        moderationStatus: 'redacted',
        publicDerivativeKey: 'public/report/photo-1.jpg',
      }).success,
    ).toBe(true);
    expect(
      evidenceSchema.safeParse({ ...evidence, relevantVideoSecond: 4 }).success,
    ).toBe(false);
  });

  it('requires assigned inspectors and a scoped, documented completion', () => {
    const inspection = {
      id: id(6),
      propertyId: demoProperty.id,
      buildingId: demoBuilding.id,
      reportId: demoReport.id,
      inspectorMembershipId: null,
      scope: ['fire_safety'],
      status: 'requested',
      scheduledFor: null,
      completedAt: null,
      limitations: null,
      createdAt,
      updatedAt,
    } as const;
    expect(inspectionSchema.safeParse(inspection).success).toBe(true);
    expect(
      inspectionSchema.safeParse({ ...inspection, status: 'completed' })
        .success,
    ).toBe(false);
    expect(
      inspectionSchema.safeParse({
        ...inspection,
        scope: ['fire_safety', 'fire_safety'],
      }).success,
    ).toBe(false);
  });

  it('limits professional credentials by specialty, validity and conflicts', () => {
    const credential: ProfessionalCredential = {
      id: id(8),
      userId: id(9),
      specialties: ['fire_safety'],
      documentEvidenceIds: [id(5)],
      status: 'approved',
      reviewedByUserId: id(4),
      reviewedAt: updatedAt,
      decisionReason: 'License checked.',
      validFrom: createdAt,
      validUntil: '2027-09-16T08:00:00.000Z',
      conflictPropertyIds: [],
      createdAt,
      updatedAt,
    };
    expect(professionalCredentialSchema.safeParse(credential).success).toBe(
      true,
    );
    expect(
      professionalCredentialUsable(
        credential,
        demoProperty.id,
        'fire_safety',
        updatedAt,
      ),
    ).toBe(true);
    expect(
      professionalCredentialUsable(
        credential,
        demoProperty.id,
        'electrical',
        updatedAt,
      ),
    ).toBe(false);
    expect(
      professionalCredentialUsable(
        { ...credential, conflictPropertyIds: [demoProperty.id] },
        demoProperty.id,
        'fire_safety',
        updatedAt,
      ),
    ).toBe(false);
    expect(
      professionalCredentialUsable(
        { ...credential, validUntil: createdAt },
        demoProperty.id,
        'fire_safety',
        updatedAt,
      ),
    ).toBe(false);
    expect(
      professionalCredentialSchema.safeParse({
        ...credential,
        reviewedByUserId: null,
      }).success,
    ).toBe(false);
  });
});

describe('audit and pagination boundaries', () => {
  it('requires an actor for user actions and forbids system impersonation', () => {
    const audit = {
      id: id(7),
      actorUserId: id(2),
      actorType: 'user',
      action: 'status_changed',
      entityType: 'report',
      entityId: demoReport.id,
      occurredAt: updatedAt,
      reason: 'Reviewer triaged the report.',
      fromState: null,
      toState: { workflowStatus: 'triaged' },
    } as const;
    expect(auditEntrySchema.safeParse(audit).success).toBe(true);
    expect(
      auditEntrySchema.safeParse({ ...audit, actorUserId: null }).success,
    ).toBe(false);
    expect(
      auditEntrySchema.safeParse({ ...audit, actorType: 'system' }).success,
    ).toBe(false);
  });

  it('bounds page size and treats cursors as opaque URL-safe values', () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(20);
    expect(
      paginationQuerySchema.parse({ limit: '100', cursor: 'opaque_123-ABC' })
        .limit,
    ).toBe(100);
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      paginationQuerySchema.safeParse({ cursor: '../secret' }).success,
    ).toBe(false);
  });
});

describe('discovery boundaries', () => {
  it('normalizes bounded search filters and preserves an explicit all option', () => {
    expect(discoveryQuerySchema.parse({}).type).toBe('all');
    expect(
      discoveryQuerySchema.parse({ query: '  sample nagar ', type: 'hostel' }),
    ).toEqual({ query: 'sample nagar', type: 'hostel' });
    expect(
      discoveryQuerySchema.safeParse({ query: 'x'.repeat(161) }).success,
    ).toBe(false);
  });

  it('requires demo provenance and bounded pagination in discovery responses', () => {
    const result = {
      propertyId: demoProperty.id,
      name: demoProperty.name,
      type: 'paying_guest',
      displayAddress: 'Sample Nagar · New Delhi',
      matchReason: 'address',
      identityStatus: 'unconfirmed',
      dataMode: 'demo',
    } as const;
    expect(
      discoveryResponseSchema.safeParse({
        results: [result],
        pagination: { nextCursor: null, hasMore: false },
      }).success,
    ).toBe(true);
    expect(
      discoveryResponseSchema.safeParse({
        results: [{ ...result, dataMode: 'live' }],
        pagination: { nextCursor: null, hasMore: false },
      }).success,
    ).toBe(false);
  });
});
