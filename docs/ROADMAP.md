# SafePG phased build roadmap

No weekly schedule: advance when acceptance criteria pass. Every phase ends with review, checks, a meaningful commit and push to the confirmed GitHub destination. Dependencies are explicit; later-phase ideas are not claims of implemented functionality.

## Phase 01 — Product scope and repository isolation

Deliver: isolated local Git repository, product/verification rules, design reference brief, delivery workflow and this roadmap.

Acceptance: roles, media privacy, verification scope, complaint-to-repair flow and MVP boundaries recorded; unrelated FAULTLINE files untouched.

Status: planning deliverables complete in the confirmed GitHub checkout. Documentation links and staged whitespace are checked before commit; actual commit/push outcome is reported in the handoff. No application exists yet, so npm run verify is not yet available.

## Phase 02 — Engineering foundation

Depends on 01. Establish Node 24/npm workspaces, strict TypeScript, web/server skeleton, shared Zod package, environment examples, formatting and npm run verify. Select hosting/database/object-storage/auth providers and document decisions; determine applicable ownership and assigned issues.

Done when: clean install and verify pass, app boots, secrets stay server-side and CI runs the same checks.

Status: complete. Node.js 24/npm workspaces, strict TypeScript, React/Vite web, Fastify API, shared Zod contracts, validated server configuration, lockfile, CI, tests, production build and compiled-server smoke checks are in place. The clean lockfile install reported zero vulnerabilities. Hosting, PostgreSQL, private R2 storage and Better Auth are documented implementation targets; no external infrastructure or accounts were provisioned.

## Phase 03 — Core contracts and demo fixtures

Depends on 02. Model building identity, property types, floors/areas, users/memberships, reports, evidence, inspections, claims and audit entries. Define timestamps, pagination, errors and separate workflow/verification/severity states. Use clearly fictional fixtures.

Done when: invalid boundaries and forbidden state transitions are rejected; demo data cannot be confused with live inspection results.

Status: complete. Runtime schemas now cover properties/buildings/areas, users and scoped memberships, reports, evidence, claims, inspections, audit entries, pagination and UTC timestamps. Workflow, verification and severity remain independent; invalid and skipped transitions are rejected. Fictional fixtures require `dataMode: "demo"`, and no persistence or migration was introduced. Nineteen tests, strict typechecks, production build and compiled-server smoke checks pass.

## Phase 04 — Reference-matched visual foundation

Depends on 02. Implement responsive LANDMARK-style SafePG layout, typography, architectural image proportions, rounded cards and dark footer; establish public profile navigation and address-search entry.

Done when: desktop/mobile layouts are coherent, keyboard navigation works and demo interactions are labeled. Do not pretend placeholders are real reports.

Status: complete. The SafePG page now includes a reference-matched rounded architectural hero, editorial typography, whitespace-led sections, responsive fictional property cards, dark footer, address-search entry, public-profile anchors, reduced-motion handling and explicit demo/live-data limitations. A project-local generated image depicts a fictional property. Search and report actions remain labeled product previews; no live listing or verification claim was introduced.

## Phase 05 — Architectural assets and cinematic motion

Depends on 04. Review reference transitions more closely; source/create authorized architectural assets, implement hero treatment and reference-inspired motion. Document where original assets are unavailable.

Done when: assets load reliably, reduced-motion/static fallback works, and mobile loading remains usable. Do not claim the source reference uses Three.js without evidence.

Status: complete. Three original fictional architectural scenes are stored locally as optimized WebP assets. The page now has a short branded intro transition, hero arrival and restrained scroll parallax, one-time section reveals, staggered property cards and richer hover motion. Reduced-motion users receive static content without the intro or parallax. The implementation remains DOM/CSS motion; it does not claim that the reference or this phase uses Three.js.

## Phase 06 — Building registry and discovery

Depends on 03/04. Address search, property type filters, map/list identity confirmation, campus/building relationships and public profile routes. Begin with demo/local pilot data; record data provenance.

Done when: ambiguous addresses and duplicate buildings are handled, empty/error states work, and selecting a property consistently opens the correct profile.

Status: complete for the demo discovery slice. Query/name/address matching, PG/hostel/coaching filters, result counts, empty state, selected profile navigation and explicit building identity confirmation status are implemented against fictional local fixtures. Discovery contracts include bounded filters, demo provenance, match reason and identity status. No live geocoder, map provider, database registry or verified property has been introduced yet.

## Phase 07 — Authentication and scoped roles

Depends on 03. One login with student, owner, parent and professional roles; internal staff provisioned privately. Add account sessions, server authorization and scoped property membership.

Done when: cross-user/property access is denied, role selection cannot grant privilege, and logout/session expiry are tested.

Status: foundation complete. Server-side workspace identity parsing, anonymous/authenticated session contracts, structured protected-route 401s, optional display-name decoding, no impersonation and identity-boundary tests are implemented. Persistent memberships, role authorization, logout and expiry remain pending provider/persistence work; no role is granted by the browser or by a client flag.

## Phase 08 — Owner claims and professional credential review

Depends on 07. Private document submission, reviewer queues, claim decisions, professional specialty/expiry and conflicts. Separate phone identity from residency/enrolment assurance.

Done when: unapproved owners cannot manage a property; expired/out-of-scope inspectors cannot certify findings; decisions are audited.

Status: complete — contracts and pure authorization helpers cover claim assurance, reviewer decision completeness, credential scope, expiry and conflicts. Persistence and private upload storage remain later phases.

## Phase 09 — Secure photo/video evidence pipeline

Depends on 07. Private storage, authorized uploads, type/size limits, upload progress/retry, video processing, evidence timestamps, public derivatives/redaction and retention controls.

Done when: unauthorized reads fail, invalid files are rejected, duplicate/retried uploads do not duplicate evidence, and originals cannot leak through public URLs.

## Phase 10 — Location-specific issue reporting

Depends on 06/09. Building/floor/area selection, categories, descriptions, annotated photos, video timestamps and draft submission. Keep sensitive grievances private.

Done when: a submitted report persists at the correct location, survives refresh and shares its evidence record with the property profile.

## Phase 11 — Moderation, corroboration and duplicate merging

Depends on 10. Evidence review queue, public/private visibility, independent supporting reports, reversible merge links, abuse reports and owner disputes.

Done when: unreviewed private media never appears publicly, merging preserves provenance and report volume alone cannot award verified status.

## Phase 12 — Evidence-based building profiles

Depends on 11. Category findings, unresolved issues, media gallery, source/freshness labels, verification explanations and issue history.

Done when: missing data reads as unknown, serious findings are not hidden by aggregate scores and public media obeys moderation decisions.

## Phase 13 — Owner action and repair workflow

Depends on 08/11. Assign responsibility, target dates, owner responses, repair plans and before/after proof. Introduce overdue handling without automatic safety decisions.

Done when: fix submission does not close an issue; students can track progress and previous evidence remains available to authorized reviewers.

## Phase 14 — Inspection and verified resolution

Depends on 08/13. Inspection requests, assignment, scoped checklists, findings, rechecks, closure/dispute/reopening and independence controls.

Done when: only an authorized reviewer/qualified inspector can perform the applicable transition; recurrence can reopen a closed issue with history intact.

## Phase 15 — Notifications and parent consent

Depends on 07/14. In-app updates, opt-in delivery channels, parent invitations, per-scope sharing, consent revocation and reminder jobs.

Done when: revoked sharing stops access, private details do not leak in notifications, and retries are idempotent. Resolve applicable scheduling approval before activating jobs.

## Phase 16 — Interactive floor maps and Three.js hotspots

Depends on 05/10/12. Floor-wise diagrams, illustrative 3D hostel, floor selection, linked issue hotspots and accessible list alternatives. Verified plans may support property-specific geometry later.

Done when: the same report opens from pin and list, generic geometry is labeled illustrative, and low-powered devices have a usable fallback. No invented evacuation routes.

## Phase 17 — Documents, freshness and inspection transparency

Depends on 08/12/14. Document provenance, expiry reminders, upload versus issuer-check labels, inspection scope/date and corrections.

Done when: stale or unsupported documents cannot imply current whole-building certification; badge changes have traceable reasons.

## Phase 18 — Compare, shortlist and before-joining checklist

Depends on 12/17. Compare 2–3 properties on evidence coverage, findings, inspection dates and unresolved issues. Add visit checklists and saved shortlist.

Done when: unknown data remains unknown in comparisons; ordering does not misrepresent missing evidence as safety.

## Phase 19 — Escalation packets and follow-up

Depends on 14/17. Reviewable report exports, redacted evidence, user-controlled submission records and acknowledgement tracking. Official integrations only when actually available/authorized.

Done when: generated/submitted/acknowledged are distinct, private evidence is protected and the UI never promises emergency dispatch.

## Phase 20 — Service disputes and confidential grievances

Depends on stable core resolution flow. Separate water/sanitation/maintenance, deposit/fee/refund complaints and confidential harassment/retaliation handling. Define reviewer responsibilities and escalation access before launch.

Done when: sensitive cases cannot appear on public maps or owner feeds and safety verification is not diluted by unrelated service ratings.

## Phase 21 — Operational quality and pilot readiness

Depends on MVP phases 02–15; additional scope ships only after its own checks. Audit permissions, upload abuse handling, accessibility, performance, recovery/backups, observability, retention/deletion, moderation staffing and feedback channels.

Done when: student-to-owner-to-inspector scenarios pass end-to-end, restore/retry/failure scenarios are exercised and demo/live records are separated.

## Phase 22 — Controlled pilot and release

Depends on 21 and applicable release approval. Select one locality and a small real partner set, verify contacts/data sources, train reviewers, deploy with monitoring and rollback, collect student feedback and track unresolved/recurring cases.

Done when: real operational owners exist, limitations are visible, rollback is rehearsed and pilot feedback produces prioritized follow-up work. Do not advertise government partnership or verified buildings without supporting evidence.

## Phase 23 — Measured expansion

Depends on pilot results. Improve recurring-issue insights, locality coverage, inspector capacity, service response times and integrations based on observed needs.

Done when: expansion preserves evidence quality and review capacity; paid services cannot alter findings or suppress complaints.

## Milestone boundaries

- Visual prototype: 02–06; explicitly demo-only.
- Core operational MVP: 02–15 plus 21 readiness checks.
- Enhanced product: 16–20 when each dependency and acceptance check passes.
- Real pilot/release: 22; expansion: 23.

No phase duration is promised before implementation and external dependencies are known.
