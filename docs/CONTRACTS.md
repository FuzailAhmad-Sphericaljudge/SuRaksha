# Core domain contracts

Phase 03 defines runtime Zod schemas and inferred TypeScript types in `packages/contracts`. These are application boundaries, not database tables or proof that a workflow is operational.

## Aggregate relationships

- A property represents a PG, hostel or coaching institute and may contain multiple buildings.
- A building belongs to exactly one property. A floor-area belongs to a building and provides a public location label without exposing a private room number.
- A report identifies its property and building, and may point to a floor-area. Reporter identity remains in the restricted domain record and is not a public-profile field.
- Evidence belongs to a report. Its original object key must use the restricted namespace. A separate public derivative is permitted only after approval/redaction and public classification.
- Memberships grant a role within a property, except internal reviewers, who are centrally provisioned. Assurance is role-specific and separate from phone verification.
- Property claims and inspections record review actors, scope, timestamps and limitations. Audit entries preserve who changed a domain record and why.

## Independent report dimensions

`workflowStatus` describes operational progress. `verificationStatus` describes what evidence supports. `severity` describes reviewed urgency. They are deliberately separate: ten reports do not create a professional inspection, a repair upload is not a verified fix, and a high-severity label requires a review timestamp.

The initial workflow transition helper rejects skipped and no-op transitions. A closed report can be reopened, preserving its history. Closing a report contractually requires `fix_verified`. Later service code must add actor authorization and transactional audit writes around these transitions.

## Demo-only invariant

The initial property contract accepts only `dataMode: "demo"`. This makes it impossible for current fixtures to masquerade as live records. The fixtures use explicitly fictional names, a synthetic address and a visible notice. A later live-data phase must introduce a separately reviewed contract and provenance requirements rather than changing a fixture flag casually.

## What remains outside Phase 03

These schemas do not create persistence, routes, authorization, media upload handling, moderation, owner access, public profiles or inspections. No database migration exists. Cross-record foreign-key consistency is illustrated by fixtures but must be enforced transactionally by persistence/service layers. State-transition authorization belongs to Phases 07–14.
