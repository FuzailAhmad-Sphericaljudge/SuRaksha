import type { Building, FloorArea, Property } from './property.js';
import type { Report } from './report.js';

export const DEMO_NOTICE =
  'Fictional demonstration data — not a real property or safety finding.' as const;
const createdAt = '2026-09-16T08:00:00.000Z';
const updatedAt = '2026-09-16T09:00:00.000Z';

export const demoProperty: Property = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Aarohan Demo Student House',
  type: 'paying_guest',
  address: {
    line1: '101 Demonstration Road',
    locality: 'Sample Nagar',
    city: 'New Delhi',
    state: 'Delhi',
    postalCode: '110000',
    countryCode: 'IN',
  },
  location: { latitude: 28.61, longitude: 77.2 },
  dataMode: 'demo',
  profileStatus: 'published',
  createdAt,
  updatedAt,
};
export const demoBuilding: Building = {
  id: '10000000-0000-4000-8000-000000000002',
  propertyId: demoProperty.id,
  name: 'Demo Block A',
  identityStatus: 'unconfirmed',
  createdAt,
  updatedAt,
};
export const demoArea: FloorArea = {
  id: '10000000-0000-4000-8000-000000000003',
  buildingId: demoBuilding.id,
  floorLabel: 'First floor',
  floorOrder: 1,
  areaLabel: 'Common staircase',
  areaKind: 'staircase',
  publicLabel: 'First-floor common staircase',
  isPrivateRoom: false,
  createdAt,
  updatedAt,
};
export const demoReport: Report = {
  id: '10000000-0000-4000-8000-000000000004',
  propertyId: demoProperty.id,
  buildingId: demoBuilding.id,
  areaId: demoArea.id,
  reporterUserId: '10000000-0000-4000-8000-000000000005',
  category: 'blocked_access',
  title: 'Items reducing usable staircase width',
  description:
    'Fictional demo report showing how an obstruction could be recorded for reviewer triage.',
  workflowStatus: 'submitted',
  verificationStatus: 'reported',
  severity: 'unassessed',
  severityReviewedAt: null,
  visibility: 'private_review',
  mergedIntoReportId: null,
  createdAt,
  updatedAt,
};
