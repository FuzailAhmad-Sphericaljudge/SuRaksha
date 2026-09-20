import {
  bootstrapResponseSchema,
  healthResponseSchema,
  type BootstrapResponse,
  type HealthResponse,
  sessionResponseSchema,
  type SessionResponse,
} from '@suraksha/contracts';

export async function fetchBootstrap(
  signal: AbortSignal,
): Promise<BootstrapResponse> {
  const response = await fetch('/api/bootstrap', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Environment unavailable.');
  return bootstrapResponseSchema.parse(await response.json());
}

export async function fetchHealth(
  signal: AbortSignal,
): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Service unavailable.');
  return healthResponseSchema.parse(await response.json());
}

export async function fetchSession(
  signal?: AbortSignal,
): Promise<SessionResponse> {
  const response = await fetch('/api/session', {
    ...(signal ? { signal } : {}),
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Session unavailable.');
  return sessionResponseSchema.parse(await response.json());
}

export async function registerDemoAccount(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<SessionResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Registration failed.');
  return sessionResponseSchema.parse(body);
}

export async function loginDemoAccount(input: {
  email: string;
  password: string;
}): Promise<SessionResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? 'Sign in failed.');
  return sessionResponseSchema.parse(body);
}

export async function logoutDemoAccount() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok && response.status !== 204)
    throw new Error('Logout failed.');
}

export async function saveOnboarding(
  role: 'student' | 'parent_guardian' | 'owner_manager' | 'professional',
): Promise<SessionResponse> {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Onboarding failed.');
  return sessionResponseSchema.parse(body);
}

export type PropertyCandidate = {
  id: string;
  name: string;
  locality: string;
  propertyType: 'paying_guest' | 'hostel' | 'coaching_institute';
  source: string;
  createdAt: string;
};

export async function fetchCandidates(
  signal?: AbortSignal,
): Promise<PropertyCandidate[]> {
  const response = await fetch('/api/candidates', {
    ...(signal ? { signal } : {}),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Candidates unavailable.');
  return (await response.json()) as PropertyCandidate[];
}

export async function createCandidate(
  input: Pick<PropertyCandidate, 'name' | 'locality' | 'propertyType'>,
): Promise<PropertyCandidate> {
  const response = await fetch('/api/candidates', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Submission failed.');
  return body as PropertyCandidate;
}

export async function searchCandidates(
  query: string,
  propertyType?: PropertyCandidate['propertyType'],
): Promise<PropertyCandidate[]> {
  const parameters = new URLSearchParams({ q: query });
  if (propertyType) parameters.set('type', propertyType);
  const response = await fetch(`/api/candidates/search?${parameters}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Search failed.');
  return (await response.json()) as PropertyCandidate[];
}

export type PublicPropertyProfile = {
  candidate: Pick<
    PropertyCandidate,
    'id' | 'name' | 'locality' | 'propertyType'
  >;
  verification: {
    level: 'unverified' | 'evidence_reviewed';
    openFindings: number;
    latestReviewedEvidenceAt: string | null;
  };
  categories: Array<{ category: string; openFindings: number }>;
  findings: Array<{
    id: string;
    buildingId: string | null;
    buildingName: string | null;
    category: string;
    title: string;
    description: string;
    reportStatus: 'approved' | 'resolved';
    createdAt: string;
    approvedEvidenceCount: number;
    repair: null | {
      status: string;
      actionPlan: string;
      targetDate: string;
      reviewerReason: string | null;
      updatedAt: string;
      history: Array<{
        eventType: string;
        actorType: string;
        note: string;
        createdAt: string;
      }>;
    };
  }>;
  limitations: string[];
};

export async function fetchPublicProfile(
  candidateId: string,
): Promise<PublicPropertyProfile> {
  const response = await fetch(`/api/public/profiles/${candidateId}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Public profile unavailable.');
  return (await response.json()) as PublicPropertyProfile;
}

export type PropertyClaim = {
  id: string;
  candidateId: string;
  candidateName?: string;
  evidenceNote: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  reviewReason?: string | null;
};

export async function fetchMyClaims(): Promise<PropertyClaim[]> {
  const response = await fetch('/api/claims/mine', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Claims unavailable.');
  return (await response.json()) as PropertyClaim[];
}

export async function createPropertyClaim(input: {
  candidateId: string;
  evidenceNote: string;
}): Promise<PropertyClaim> {
  const response = await fetch('/api/claims', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Claim submission failed.');
  return body as PropertyClaim;
}

export async function fetchReviewerClaims(): Promise<PropertyClaim[]> {
  const response = await fetch('/api/reviewer/claims', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Reviewer queue unavailable.');
  return (await response.json()) as PropertyClaim[];
}
export async function decideClaim(
  id: string,
  status: 'approved' | 'rejected',
  reason: string,
) {
  const response = await fetch(`/api/reviewer/claims/${id}/decision`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? 'Decision failed.');
}
export type ManagedBuilding = {
  id: string;
  candidateId: string;
  name: string;
  floors: number;
  createdAt: string;
};
export async function fetchMyBuildings(): Promise<ManagedBuilding[]> {
  const response = await fetch('/api/buildings/mine', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Buildings unavailable.');
  return (await response.json()) as ManagedBuilding[];
}
export async function createBuilding(input: {
  candidateId: string;
  name: string;
  floors: number;
}): Promise<ManagedBuilding> {
  const response = await fetch('/api/buildings', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Building creation failed.');
  return body as ManagedBuilding;
}

export type EvidenceUpload = {
  id: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};
export async function fetchMyEvidence(): Promise<EvidenceUpload[]> {
  const response = await fetch('/api/evidence/mine', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Evidence unavailable.');
  return (await response.json()) as EvidenceUpload[];
}
export async function uploadEvidence(file: File): Promise<EvidenceUpload> {
  const form = new FormData();
  form.set('file', file);
  const response = await fetch('/api/evidence/upload', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? 'Upload failed.');
  return body as EvidenceUpload;
}

export type PublicBuilding = {
  id: string;
  candidateId: string;
  name: string;
  floors: number;
};
export async function fetchBuildings(
  candidateId: string,
): Promise<PublicBuilding[]> {
  const response = await fetch(
    `/api/buildings?${new URLSearchParams({ candidateId })}`,
    { cache: 'no-store' },
  );
  if (!response.ok) throw new Error('Buildings unavailable.');
  return (await response.json()) as PublicBuilding[];
}
export type IssueReport = {
  id: string;
  candidateId: string;
  candidateName?: string;
  buildingId: string | null;
  buildingName?: string | null;
  category: string;
  title: string;
  description: string;
  visibility: string;
  status: string;
  evidenceIds: string[];
  createdAt: string;
};
export async function fetchMyReports(): Promise<IssueReport[]> {
  const response = await fetch('/api/reports/mine', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Reports unavailable.');
  return (await response.json()) as IssueReport[];
}
export async function createIssueReport(input: {
  candidateId: string;
  buildingId: string | null;
  category: string;
  title: string;
  description: string;
  visibility: string;
  evidenceIds: string[];
}): Promise<IssueReport> {
  const response = await fetch('/api/reports', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Report submission failed.');
  return body as IssueReport;
}

export async function fetchReviewerEvidence(): Promise<EvidenceUpload[]> {
  const response = await fetch('/api/reviewer/evidence', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Moderation queue unavailable.');
  return (await response.json()) as EvidenceUpload[];
}
export async function decideEvidence(
  id: string,
  status: 'approved' | 'rejected',
  reason: string,
) {
  const response = await fetch(`/api/reviewer/evidence/${id}/decision`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  if (!response.ok) throw new Error('Moderation decision failed.');
}
export async function fetchReviewerReports(): Promise<IssueReport[]> {
  const response = await fetch('/api/reviewer/reports', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Report queue unavailable.');
  return (await response.json()) as IssueReport[];
}
export async function decideReport(
  id: string,
  status: 'approved' | 'rejected',
  reason: string,
) {
  const response = await fetch(`/api/reviewer/reports/${id}/decision`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  if (!response.ok) throw new Error('Report decision failed.');
}
export async function mergeReport(
  sourceId: string,
  targetReportId: string,
  reason: string,
) {
  const response = await fetch(`/api/reviewer/reports/${sourceId}/merge`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetReportId, reason }),
  });
  if (!response.ok) throw new Error('Report merge failed.');
}
export async function unmergeReport(sourceId: string, reason: string) {
  const response = await fetch(`/api/reviewer/reports/${sourceId}/unmerge`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) throw new Error('Report unmerge failed.');
}

export type RepairCase = {
  reportId: string;
  reportTitle: string;
  candidateId: string;
  candidateName: string;
  actionPlan: string;
  targetDate: string;
  status:
    | 'action_planned'
    | 'reinspection_requested'
    | 'resolved'
    | 'changes_requested';
  reviewerReason: string | null;
  updatedAt: string;
  evidenceIds: string[];
};
export type EligibleRepairReport = {
  id: string;
  title: string;
  category: string;
  candidateName: string;
};
async function jsonRequest(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result?.error?.message ?? 'Request failed.');
  return result;
}
export async function fetchMyRepairs(): Promise<RepairCase[]> {
  const response = await fetch('/api/repairs/mine', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Repairs unavailable.');
  return (await response.json()) as RepairCase[];
}
export async function fetchEligibleRepairs(): Promise<EligibleRepairReport[]> {
  const response = await fetch('/api/repairs/eligible', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Eligible reports unavailable.');
  return (await response.json()) as EligibleRepairReport[];
}
export async function saveRepairPlan(
  reportId: string,
  actionPlan: string,
  targetDate: string,
) {
  return jsonRequest(`/api/reports/${reportId}/repair-plan`, 'POST', {
    actionPlan,
    targetDate,
  });
}
export async function requestReinspection(
  reportId: string,
  evidenceIds: string[],
  note: string,
) {
  return jsonRequest(`/api/reports/${reportId}/request-reinspection`, 'POST', {
    evidenceIds,
    note,
  });
}
export async function fetchReviewerRepairs(): Promise<RepairCase[]> {
  const response = await fetch('/api/reviewer/repairs', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Repair queue unavailable.');
  return (await response.json()) as RepairCase[];
}
export async function decideRepair(
  reportId: string,
  status: 'resolved' | 'changes_requested',
  reason: string,
) {
  return jsonRequest(`/api/reviewer/repairs/${reportId}/decision`, 'POST', {
    status,
    reason,
  });
}

export type Credential = {
  id: string;
  userId: string;
  displayName?: string;
  credentialType: string;
  licenseNumber: string;
  specialty: string;
  expiresOn: string;
  status: 'submitted' | 'approved' | 'rejected';
  reviewReason: string | null;
};
export type InspectionAssignment = {
  id: string;
  reportId: string;
  reportTitle: string;
  professionalUserId: string;
  professionalName: string;
  specialty: string;
  scheduledFor: string;
  status: string;
  conflictDeclared: number | null;
};
export async function fetchCredentials(
  reviewer = false,
): Promise<Credential[]> {
  const response = await fetch(
    reviewer ? '/api/reviewer/credentials' : '/api/professional/credentials',
    { credentials: 'same-origin', cache: 'no-store' },
  );
  if (!response.ok) throw new Error('Credentials unavailable.');
  return (await response.json()) as Credential[];
}
export async function submitCredential(input: {
  credentialType: string;
  licenseNumber: string;
  specialty: string;
  expiresOn: string;
}) {
  return jsonRequest('/api/professional/credentials', 'POST', input);
}
export async function decideCredential(
  id: string,
  status: 'approved' | 'rejected',
  reason: string,
) {
  return jsonRequest(`/api/reviewer/credentials/${id}/decision`, 'POST', {
    status,
    reason,
  });
}
export async function assignInspection(input: {
  reportId: string;
  professionalUserId: string;
  specialty: string;
  scheduledFor: string;
}) {
  return jsonRequest('/api/reviewer/inspections', 'POST', input);
}
export async function fetchInspections(): Promise<InspectionAssignment[]> {
  const response = await fetch('/api/professional/inspections', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Inspections unavailable.');
  return (await response.json()) as InspectionAssignment[];
}
export async function declareInspectionConflict(
  id: string,
  conflict: boolean,
  note: string,
) {
  return jsonRequest(`/api/professional/inspections/${id}/conflict`, 'POST', {
    conflict,
    note,
  });
}
export async function submitInspectionResult(
  id: string,
  outcome: string,
  notes: string,
  inspectedAt: string,
) {
  return jsonRequest(`/api/professional/inspections/${id}/result`, 'POST', {
    outcome,
    notes,
    inspectedAt,
  });
}

export type AppNotification = {
  id: string;
  eventType: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export type NotificationPreferences = {
  emailEnabled: number | boolean;
  smsEnabled: number | boolean;
  phoneNumber: string | null;
};
export type NotificationDelivery = {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  lastError: string | null;
};
export async function fetchNotifications(): Promise<AppNotification[]> {
  const response = await fetch('/api/notifications', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Notifications unavailable.');
  return (await response.json()) as AppNotification[];
}
export async function markNotificationRead(id: string) {
  return jsonRequest(`/api/notifications/${id}/read`, 'POST');
}
export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await fetch('/api/notification-preferences', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Preferences unavailable.');
  return (await response.json()) as NotificationPreferences;
}
export async function saveNotificationPreferences(input: {
  emailEnabled: boolean;
  smsEnabled: boolean;
  phoneNumber: string | null;
}) {
  return jsonRequest('/api/notification-preferences', 'PUT', input);
}
export async function fetchNotificationDeliveries(): Promise<
  NotificationDelivery[]
> {
  const response = await fetch('/api/notification-deliveries', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Delivery history unavailable.');
  return (await response.json()) as NotificationDelivery[];
}

export type GuardianShare = {
  id: string;
  guardianName: string;
  guardianEmail: string;
  status: string;
};
export type SharedStudent = {
  shareId: string;
  studentUserId: string;
  studentName: string;
};
export type GuardianSummary = {
  studentName: string;
  reports: Array<{
    id: string;
    candidateName: string;
    category: string;
    title: string;
    status: string;
    approvedEvidenceCount: number;
  }>;
  limitations: string;
};
export async function fetchGuardianShares(): Promise<GuardianShare[]> {
  const response = await fetch('/api/sharing/mine', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Sharing unavailable.');
  return (await response.json()) as GuardianShare[];
}
export async function grantGuardian(guardianEmail: string) {
  return jsonRequest('/api/sharing', 'POST', { guardianEmail });
}
export async function revokeGuardian(id: string) {
  return jsonRequest(`/api/sharing/${id}/revoke`, 'POST');
}
export async function fetchSharedStudents(): Promise<SharedStudent[]> {
  const response = await fetch('/api/guardian/students', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Shared students unavailable.');
  return (await response.json()) as SharedStudent[];
}
export async function fetchGuardianSummary(
  studentId: string,
): Promise<GuardianSummary> {
  const response = await fetch(`/api/guardian/students/${studentId}/summary`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Permission no longer available.');
  return (await response.json()) as GuardianSummary;
}
export async function fetchSavedProperties(): Promise<
  Array<PropertyCandidate & { savedAt: string }>
> {
  const response = await fetch('/api/saved-properties', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Saved properties unavailable.');
  return (await response.json()) as Array<
    PropertyCandidate & { savedAt: string }
  >;
}
export async function saveProperty(candidateId: string) {
  return jsonRequest(`/api/saved-properties/${candidateId}`, 'POST');
}

export type ReviewTask = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  priority: string;
  status: string;
  assignee: string | null;
  dueAt: string;
  escalationReason: string | null;
};
export type AuditEvent = {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  reasonCode: string;
  note: string;
  createdAt: string;
};
export async function fetchReviewTasks(): Promise<ReviewTask[]> {
  const response = await fetch('/api/reviewer/tasks', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Review workload unavailable.');
  return (await response.json()) as ReviewTask[];
}
export async function updateReviewTask(
  id: string,
  input: {
    assignee?: string;
    priority?: string;
    status?: string;
    escalationReason?: string | null;
    reasonCode: string;
    note: string;
  },
) {
  return jsonRequest(`/api/reviewer/tasks/${id}`, 'PATCH', input);
}
export async function searchAudit(q = ''): Promise<AuditEvent[]> {
  const response = await fetch(
    `/api/reviewer/audit?${new URLSearchParams({ q })}`,
    { credentials: 'same-origin', cache: 'no-store' },
  );
  if (!response.ok) throw new Error('Audit unavailable.');
  return (await response.json()) as AuditEvent[];
}

export type AnalyticsSnapshot = {
  generatedAt: string;
  disclaimer: string;
  coverage: {
    totalCandidates: number;
    coveredCandidates: number;
    percent: number;
    staleProfiles: number;
  };
  findings: { open: number; oldestOpenDays: number; averageOpenDays: number };
  duplicates: { merged: number; totalReports: number; ratePercent: number };
  localities: Array<{
    locality: string;
    candidateCount: number;
    coveredCount: number;
    gapCount: number;
  }>;
  backlog: Array<{ sourceType: string; count: number }>;
};
export async function fetchAnalytics(): Promise<AnalyticsSnapshot> {
  const response = await fetch('/api/reviewer/analytics', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Analytics unavailable.');
  return (await response.json()) as AnalyticsSnapshot;
}

export type Grievance = {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  details: string;
  status: string;
  reviewReason: string | null;
};
export async function acceptPrivacyNotice() {
  return jsonRequest('/api/privacy/consent', 'POST', {
    noticeVersion: '2026-09-20',
    accepted: true,
  });
}
export async function requestAccountDeletion(reason: string) {
  return jsonRequest('/api/privacy/deletion-requests', 'POST', { reason });
}
export async function submitGrievance(input: {
  entityType: string;
  entityId: string;
  category: string;
  details: string;
}) {
  return jsonRequest('/api/grievances', 'POST', input);
}
export async function fetchMyGrievances(): Promise<Grievance[]> {
  const response = await fetch('/api/grievances/mine', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Grievances unavailable.');
  return (await response.json()) as Grievance[];
}
export async function fetchReviewerGrievances(): Promise<Grievance[]> {
  const response = await fetch('/api/reviewer/grievances', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Grievance queue unavailable.');
  return (await response.json()) as Grievance[];
}
export async function decideGrievance(
  id: string,
  status: 'actioned' | 'dismissed',
  reason: string,
) {
  return jsonRequest(`/api/reviewer/grievances/${id}/decision`, 'POST', {
    status,
    reason,
  });
}
