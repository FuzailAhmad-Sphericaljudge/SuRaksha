# Product acceptance checklist

This checklist is the release gate for SafePG. A workflow is complete only when it works through the browser, writes to the server-side database, survives refresh, enforces authorization and has an automated test for its critical boundary.

## Current prototype audit

| Capability                                            | Current state                                    | Required implementation phase |
| ----------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| Responsive landing page and fictional discovery cards | Working demo UI                                  | Maintain throughout           |
| Search and property selection                         | Client-side fictional data only                  | Phase 06                      |
| Session/authentication                                | Header adapter and protected-route boundary only | Phase 03                      |
| Role onboarding and dashboards                        | Not implemented                                  | Phase 04                      |
| Database persistence                                  | Not implemented                                  | Phase 02                      |
| Real property discovery/import                        | Not implemented                                  | Phase 05                      |
| Owner claims                                          | Contracts only                                   | Phase 07                      |
| Photo/video upload                                    | Contracts only                                   | Phase 09                      |
| Issue reports                                         | Contracts only                                   | Phase 10                      |
| Moderation/merging                                    | Contracts only                                   | Phase 11                      |
| Building safety profiles                              | Contracts only                                   | Phase 12                      |
| Repair and inspection workflows                       | Contracts only                                   | Phases 13–14                  |
| Notifications                                         | Not implemented                                  | Phase 15                      |
| Production deployment                                 | Not implemented                                  | Phase 22                      |

Contracts and tests already in the repository remain useful foundations, but they do not satisfy the user-flow gates below.

## Cross-cutting gate

Every browser workflow must demonstrate:

1. A visible success, pending or failure state.
2. Server-side validation and authorization.
3. Persistence after refresh and server restart.
4. Demo/production isolation.
5. An audit record for sensitive decisions.
6. Keyboard operation and clear error messages.
7. No public exposure of restricted media or private room identifiers.

## Student journey

- Create an account, sign in, sign out and recover from an expired session.
- Search by locality and distinguish candidate, reviewed and verified properties.
- Open a property, inspect category findings, sources and freshness.
- Submit a missing property with an address and source.
- Create a location-specific report, save a draft and attach evidence.
- Refresh and see the submitted report with its current status.
- Receive updates, add corroboration and dispute an incorrect resolution.
- Control parent/guardian access and revoke it.

## Parent or guardian journey

- Sign in without receiving automatic access to a student's activity.
- Accept a student-approved sharing invitation.
- View only the approved property/report summary.
- Save candidate properties and compare evidence freshness.
- Lose access immediately after the student revokes sharing.

## Owner or manager journey

- Submit a property candidate and claim it with private supporting documents.
- Remain unable to edit the property while the claim is pending or rejected.
- After approval, manage buildings, public areas, facilities and contacts.
- Receive reports without seeing confidential reporter details.
- Acknowledge an issue, add an action plan and upload repair evidence.
- Request reinspection without closing or suppressing the report.

## Professional journey

- Submit credentials, specialties, validity dates and conflict declarations.
- Remain unable to accept inspections before credential approval.
- Accept only in-scope, conflict-free assignments while credentials are valid.
- Complete a scoped inspection with evidence and stated limitations.
- Lose certification access after expiry or revocation.

## Internal reviewer journey

- Review candidate properties, owner claims, credentials, media and reports.
- See source, contributor, previous decisions and possible duplicates.
- Approve or reject with a required reason.
- Merge and unmerge duplicate reports without deleting provenance.
- Escalate confidential or high-severity cases with restricted access.
- Search the audit log and identify overdue queues.

## Demo operator journey

- Reset demo data to a known scenario without affecting production.
- Switch the deployed demo through prepared presentation scenarios.
- Show a persistent demo-data banner on every screen.
- Demonstrate the same user flows and authorization rules as production.

## Production operator journey

- Apply migrations safely and observe service/database/storage health.
- Restore a tested backup and verify record integrity.
- Rotate secrets and roll back a failed deployment.
- Export or delete user data according to policy.
- Trace a sensitive decision from public outcome to audit history.

## Phase completion record

Each phase PR or commit must identify the scenarios it enables, include verification commands and list remaining limitations. Partial foundations remain marked partial until the relevant browser journey passes end to end.
