# SafePG delivery roadmap

This roadmap replaces contract-only milestones with working, reviewable product slices. A phase is complete only when its user flow works in the browser, persists after refresh, has appropriate authorization, and passes automated checks.

## Operating modes

SafePG ships the same application in two isolated environments:

- **Demo mode** uses seeded fictional properties, users, reports and media. It can be reset before a hackathon presentation and is always labelled as demonstration data.
- **Production mode** uses a separate database, private storage and verified identity provider. It never reads demo records and cannot be switched from a browser query parameter or client-side flag.
- The deployment configuration selects the mode through server environment variables. The API returns the active mode so the UI can show the correct banner.
- Database, object storage, credentials, analytics and backups are separate for each mode.

## Definition of real data

A real property begins as a candidate from an owner submission, student/parent submission, authorized field survey, licensed directory/API or reviewed bulk import. Every record stores its source, collection date, contributor and review state. Discovery does not equal verification.

The visible states are `candidate`, `owner_claimed`, `evidence_reviewed`, `site_inspected`, `verified` and `archived`. SafePG must never infer that a property is safe because no report exists. Google Maps or other providers may be used only through permitted APIs and terms; copied listings or photos are not treated as owned data.

## Phase 00 — Product reset and acceptance tests

Audit the current prototype, preserve useful design/contracts and replace milestone criteria with clickable end-to-end scenarios. Document student, parent, owner, professional and reviewer journeys.

Done when the team has a test checklist for every role and no future phase can be marked complete from schemas alone.

Status: complete — the current gaps and browser acceptance gates are recorded in `docs/ACCEPTANCE.md` for every user and operator role.

## Phase 01 — Environment and mode boundary

Add validated server configuration for `demo` and `production`, expose mode in session/bootstrap responses, display a persistent demo banner and prevent client-side mode overrides.

Done when two isolated configurations run locally and tests prove production cannot read demo fixtures.

Status: partial — server-selected modes, bootstrap exposure, client override rejection and a persistent demo banner are implemented. Physical database/storage isolation will be enforced when those services arrive in Phase 02.

## Phase 02 — Database and migrations

Add PostgreSQL, migrations, seed tooling, repositories and transaction boundaries for users, properties, buildings, areas, memberships, claims, reports, evidence and audit records.

Done when records persist after restart and demo reset affects only the demo database.

Status: partial — a versioned SQLite persistence layer now survives reopen and tests prove separate demo/production database files. PostgreSQL, the complete domain schema and transactional repositories remain required before deployment.

## Phase 03 — Working authentication

Connect a production-ready identity provider, sessions, logout and expiry. Create a local development identity adapter for demo mode. Keep role membership server controlled.

Done when users can sign in/out and protected routes reject expired or forged identities.

Status: partial — demo mode now has persistent accounts, password hashing, seven-day HttpOnly sessions, registration, login and logout in the browser. A production identity provider, recovery and role onboarding remain pending.

## Phase 04 — Role onboarding

Build onboarding for student, parent, owner/manager and professional accounts. A user can hold more than one reviewed membership without creating duplicate accounts.

Done when each role lands on its dashboard and pending roles cannot access approved actions.

Status: partial — authenticated demo users can choose a persisted role and receive a role-specific dashboard state; owner/professional roles remain pending review. Full dashboards, multi-role memberships and reviewer approval arrive in their workflow phases.

## Phase 05 — Real property discovery intake

Build candidate ingestion through owner submission, missing-property reports, reviewer entry and CSV import. Add address normalization, geocoding, source metadata and duplicate suggestions.

Done when a real candidate can be submitted, reviewed and found by locality without being labelled verified.

Status: partial — authenticated users can submit real property candidates, records persist after refresh and appear as clearly unverified candidates. Address normalization, geocoding, reviewer approval, CSV import and duplicate detection remain pending.

## Phase 06 — Search and map

Connect search, filters, pagination and map bounds to the database. Show source, freshness and verification state on every result.

Done when newly approved candidates appear in search after refresh and unknown fields stay unknown.

Status: partial — server-side name/locality/type search reads persistent candidate records and the public UI labels every result unverified. Maps, coordinates, pagination and reviewer-approved listings remain pending.

## Phase 07 — Owner claim workflow

Build property claim forms, private document references, reviewer queue, approve/reject decisions and audit history.

Done when only an approved manager can edit the claimed property.

Status: partial — owner/manager accounts can submit one persisted claim per property and see its pending state after refresh. Private document upload, reviewer queue/decision and approved editing permissions remain pending.

## Phase 08 — Property and building management

Owners add buildings, floors, public areas, facilities and contact information. Reviewers can compare changes and reject misleading edits.

Done when approved changes appear on the public profile and private room identifiers remain hidden.

Status: partial — demo reviewers can approve/reject owner claims with a reason, approval activates the owner profile, and approved owners can persist building names and floor counts. Areas, facilities, public profile publication and change review remain pending.

## Phase 09 — Secure media pipeline

Add authorized uploads, private object storage, checksums, file inspection, image derivatives, video processing, retry/idempotency, moderation and deletion/retention controls.

Done when unauthorized originals cannot be read and only cleared derivatives can appear publicly.

Status: partial — authenticated users can upload validated JPEG/PNG/WebP/MP4/WebM originals to private storage, metadata and SHA-256 persist, owners can reload/download their files, and anonymous reads fail. Public derivatives, moderation controls, retry and retention remain pending.

## Phase 10 — Working issue reporting

Build building/floor/area selection, issue form, draft save, photo/video attachment, privacy choice and submission receipt.

Done when a student submits a report, refreshes, and sees the same report and evidence status.

Status: complete for the demo vertical slice — authenticated users can submit property/building-scoped reports with category, narrative, privacy choice and owned evidence; reports persist and reload after refresh. Floor/area selection and draft autosave remain follow-up work.

## Phase 11 — Moderation and duplicate handling

Build reviewer queues for media and reports, abuse controls, corroboration links, reversible duplicate merges and owner disputes.

Done when moderation decisions are audited and report volume alone cannot produce verification.

Status: partial — demo reviewers can approve/reject pending evidence with reasons and merge/unmerge same-property duplicate reports without deleting source records. Abuse reports, owner disputes and a full audit-event table remain pending.

## Phase 12 — Evidence-based public profiles

Generate building profiles from moderated reports and inspections. Show category findings, open issues, history, freshness, limitations and public media.

Done when serious findings stay prominent and missing evidence never becomes a positive score.

Status: partial — every candidate now has a database-backed public profile. Only reviewer-approved public reports with approved evidence appear; private, confidential, pending, rejected and merged reports are excluded. Profiles show severity-ordered category findings, open counts, freshness and explicit coverage limitations. Public redacted media derivatives and inspection history remain pending.

## Phase 13 — Owner repair workflow

Owners acknowledge issues, post action plans, attach repair evidence and request reinspection. Students see deadlines and status history.

Done when an owner cannot close or suppress a report and only reviewed fixes change public status.

Status: complete — approved owners can acknowledge public findings with dated action plans, attach their repair evidence and request reinspection. Reviewers alone can resolve a finding, and only after all attached repair evidence is approved. Public profiles retain the resolved finding and its action/review history while excluding it from the open count.

## Phase 14 — Professional credentialing and inspections

Build credential submission/review, specialty and expiry enforcement, assignment, scheduling, inspection forms and conflict declarations.

Done when expired, conflicted or out-of-scope professionals cannot certify findings.

Status: complete — professionals submit specialty-scoped credentials with license numbers and expiry dates for reviewer approval. Reviewers can assign a matching approved professional to a dated inspection. Professionals must declare independence before submitting a structured outcome, and expired, conflicted or out-of-scope credentials are rejected server-side.

## Phase 15 — Notifications

Add in-app notifications first, then opted-in email/SMS for claim decisions, report updates, inspection schedules and overdue actions.

Done when notification preferences, retry and delivery history work without exposing confidential report details.

Status: complete at the application layer — signed-in users have a persisted inbox, read state, email/SMS opt-in preferences and per-channel delivery history. Failed deliveries remain retryable and claim decisions generate generic notifications without report evidence or confidential text. Demo mode uses a deterministic delivery-attempt adapter; production email/SMS provider credentials belong to deployment configuration.

## Phase 16 — Parent and guardian experience

Add student-approved sharing, saved properties and evidence summaries. Prevent covert tracking and unnecessary personal-data exposure.

Done when students control access and revocation takes effect immediately.

Status: complete — students can grant access only to an existing parent/guardian account and revoke it immediately. Guardians see only moderated public report summaries and approved-evidence counts, never private/confidential reports or original media. Guardian accounts can also persist a personal saved-property list.

## Phase 17 — Reviewer operations

Build workload queues, service targets, assignment, escalation, reason codes and audit search for the internal team.

Done when every sensitive decision has an accountable actor and unresolved work cannot silently disappear.

Status: complete — a unified queue derives pending claims, evidence, reports, credentials and repair reinspections into durable tasks with 48-hour targets. Reviewers can assign, prioritize and escalate tasks only with structured reason codes and notes. Sensitive claim, evidence and report decisions close their tasks and write actor-attributed audit events; audit history is searchable by text and entity type.

## Phase 18 — Analytics and coverage quality

Measure candidate coverage, verification freshness, unresolved issue age, duplicate rate and locality gaps. Keep product analytics separate from safety conclusions.

Done when the team can identify weak coverage without presenting estimates as verified counts.

Status: complete — the reviewer dashboard reports candidate coverage backed by approved public evidence, stale-profile counts, open-finding age, duplicate merge rate, review backlog and per-locality gaps. The API and UI explicitly label these as collection/review coverage metrics rather than safety scores or estimates of unreported conditions.

## Phase 19 — Privacy, abuse and legal readiness

Complete consent, redaction, retention/deletion, account export, takedown, grievance handling, rate limits and threat modelling. Review third-party data and image licenses.

Done when privacy and abuse scenarios pass and production data sources have documented permission.

Status: partial — versioned consent, privacy-safe JSON export, deletion requests, grievances/takedowns, reviewer decisions, audit records and per-user grievance throttling are working. Original evidence remains private and public derivatives are intentionally unavailable. Threat, governance and third-party licensing registers document production requirements; automatic retention purge, edge rate limiting, malware scanning and legal sign-off remain deployment blockers.

## Phase 20 — Accessibility, performance and recovery

Test keyboard/screen-reader flows, mobile networks, image budgets, database indexes, backups, restore drills, observability and failure recovery.

Done when core flows meet accessibility targets and a backup restore is demonstrated.

Status: partial — keyboard skip navigation, visible focus, reduced-motion behavior, semantic landmarks and live status regions have automated source checks. Compiled JavaScript/CSS budgets are enforced, readiness checks exercise the database, query indexes cover major dashboards, and an online SQLite backup/restore integrity drill is executable. Manual screen-reader testing, throttled mobile-network profiling, encrypted off-host production backups and alert routing remain release-candidate/deployment work.

## Phase 21 — End-to-end release candidate

Run student-to-owner-to-reviewer-to-inspector scenarios in demo and staging. Fix all release-blocking issues and rehearse rollback.

Done when the acceptance checklist passes against a production-like deployment.

Status: partial — the release gate now combines full verification, accessibility/asset budgets, backup restore, demo smoke and a production-mode staging smoke that exercises external identity persistence, onboarding, database writes and search. Automated integration scenarios cover all four roles and reviewer-controlled publication/resolution. Manual screen-reader/device passes and an actual deployment image rollback rehearsal remain before release approval.

## Phase 22 — Deployment

Deploy separate demo and production services, databases and storage. Configure domains, TLS, secrets, migrations, monitoring, alerts and CI/CD approvals.

Done when both URLs are healthy, isolated, monitored and rollback is tested.

Status: partial — an immutable non-root container, separate demo/production Compose services and volumes, database readiness healthcheck, secret-gated production identity headers, CI image build, environment templates and deployment/rollback runbook are complete. Docker is unavailable on the current workstation, while CI performs the image build. Public URLs, managed volumes, TLS, identity gateway, secret manager, monitoring/alerts and off-host backups require the selected hosting account and domain.

## Phase 23 — Controlled real-data pilot

Launch one locality with a small reviewed dataset and named operational reviewers. Collect corrections, user feedback and resolution outcomes.

Done when every live record has provenance, support ownership and a measurable freshness policy.

Status: partial - the product now has separate task-focused workspaces, a public-first landing page and provenance-aware locality intake that records a public source and observation date. The production pilot still needs a selected locality, named support reviewers, source-license approval and an operational freshness SLA before any submitted record can be labelled live or verified.

## Phase 24 — Expansion

Add localities only when discovery coverage, reviewer capacity and professional capacity can support them. Introduce permitted partner integrations after validation.

Done when expansion does not reduce evidence quality or create unreviewed backlogs.

## Delivery rule

Each implementation phase ends with a browser-testable flow, relevant tests, a clean migration path, documentation, one focused commit and a push to `main`. A contract-only foundation is reported as partial, not complete.
