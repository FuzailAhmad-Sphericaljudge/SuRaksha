# Product scope and trust rules

## Primary journey

Search address/map location -> confirm building identity -> read category-specific findings and evidence -> report an issue at a specific location -> reviewer triage -> owner response/action -> repair evidence -> recheck -> closure or reopening.

Support PG, hostel and coaching property types. A campus can contain multiple buildings; reports attach to the correct building and optionally floor/area. Do not publicly expose private room identifiers.

## Roles

One identity can have multiple roles. Server authorization determines permissions; selecting a role does not grant authority.

| Role | Allowed activity | Gate |
| --- | --- | --- |
| Public visitor | Read moderated public profiles and evidence | No login |
| Student | Report, corroborate with evidence, follow, compare, provide recheck feedback | Account; residency/enrolment assurance separately labeled |
| Owner/institute manager | Manage claimed properties, respond, upload documents/repair proof, request inspection | Approved management claim scoped to a property |
| Parent/guardian | Read public profiles, shortlist, receive permitted linked updates | Explicit revocable student consent for private sharing |
| Professional/inspector | Assigned inspections and scoped findings/rechecks | Reviewed credentials, scope, expiry and conflict checks |
| Internal reviewer | Moderate, review claims, handle disputes and escalations | Invitation/provisioning only; audited privileged actions |

Phone verification proves phone access, not residency, qualifications or ownership. Owner payment must never determine a positive finding. No public role picker for internal admin.

## Evidence and verification

Verification is scoped to a finding, document or inspection, with source, reviewer, date and limitations. Never silently convert unknown data into a safe rating or a blanket building certificate.

- Reported: user-submitted claim, not confirmed.
- Corroborated: independent evidence supports the claim; not professional certification.
- Evidence reviewed: available materials checked, without implying a site visit.
- Site inspected: qualified professional inspected the named scope/date.
- Fix submitted: owner supplied repair evidence; issue is not yet verified closed.
- Fix verified: appropriate recheck supports closure; history retained.

Keep verification state separate from workflow state (submitted, triaged, assigned, in progress, fix submitted, closed, reopened, disputed). Severity is also separate; high severity is a reviewed prioritization decision, not a claim that the platform can certify safety from an image.

Category-specific fire, electrical, structural and water-ingress findings must not be hidden by an average score. Uploaded document, issuer-checked document and site inspection are different claims. Show freshness/expiry and missing evidence.

## Media and location

Link original report and media to the property profile and floor/area pin, without duplicating records. Support annotations, captions, relevant video timestamps, before/after comparisons and evidence additions to existing reports.

Capture upload time separately from claimed capture time; do not present EXIF as proof. Restrict original evidence. Public derivatives require moderation/redaction for faces, IDs, room identifiers and other private data. Sensitive harassment/retaliation complaints use a confidential workflow and never public pins.

Uploads require server checks, file-type/size limits, storage authorization, malware review where supported, controlled video processing and deletion/retention rules. Public anonymity does not mean anonymous access to internal abuse controls. Do not expose reporter identity to owners by default.

Merge related reports with traceable links, preserving evidence and the ability to undo a mistaken merge. Multiple reports alone do not prove an issue. Do not auto-close on owner assertion. Reopen recurring issues and preserve correction/audit history while honoring applicable privacy/deletion handling.

## Resolution and escalation

Assign responsibility, target dates, reminders, owner responses and repair proof. Recheck requirements vary by category and severity. Student feedback can support a recheck but cannot replace qualified technical inspection when required.

Generate an evidence packet for user/reviewer submission. Mark generated, submitted and acknowledged separately. Never claim that an authority was notified without successful submission evidence. Do not promise emergency monitoring or dispatch. Any later emergency guidance and official contacts need authoritative verification for the selected jurisdiction.

## MVP and later scope

MVP: public building profiles, role-gated access, private uploads and moderated evidence, floor-wise reports, reviewer triage, owner response/repair, scoped professional recheck, history and basic follow updates.

Later: comparisons, document freshness, inspection logistics, parent sharing, moderated escalation exports, advanced 3D, recurring issue analytics, fee/deposit/service disputes and confidential grievances. Keep service disputes and sensitive grievances separate from public safety findings.

Start with explicitly labeled demo properties and one pilot locality. Real public data, credentials and partnerships are dependencies, not assumed available APIs. A demo badge must not look like a real inspection certificate.

## Architecture constraints

Node.js 24; npm workspaces; strict TypeScript; shared Zod boundaries in packages/contracts. A single application/backend architecture, no autonomous multi-agent system. No browser secrets or browser-side authority/verification decisions. Proposed services: web application, server API, database, private object storage and controlled background jobs. Final providers selected in Phase 02.

The provided contributor instructions refer to a separate FAULTLINE product and ownership split. They do not imply that SafePG needs agent/init or agent/feed endpoints. Preserve their engineering baseline and confirm applicable ownership/issue references before changes to jointly controlled contracts, migrations, scheduling or release.
