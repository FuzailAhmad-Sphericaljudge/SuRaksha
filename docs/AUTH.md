# Phase 07 authentication and authorization

Phase 07 uses the Sites workspace identity headers as authentication for identity-aware routes. `GET /api/session` reads `oai-authenticated-user-id` and `oai-authenticated-user-email` server-side; the optional full name is decoded only when its encoding header is exactly `percent-encoded-utf-8`. Anonymous public browsing returns `{ authenticated: false }`. A partial, malformed or invalid identity is treated as anonymous.

`GET /api/private/check` demonstrates a protected route. It returns a structured 401 when identity is absent and never trusts a client role flag. Authenticated sessions currently expose an empty membership list because persistence and role membership records are Phase 08/09 work. Until a membership is active and property-scoped, an authenticated user must not be treated as a student, owner, parent or inspector.

The contract distinguishes account identity from role assurance. A phone or workspace identity does not prove residency, ownership, qualifications or inspection scope. Internal reviewers remain centrally provisioned; they cannot be created by a public role picker. Future write routes must read the server identity again, check active membership and property scope, and audit the decision.

No app-owned public OAuth, password store, OTP provider, cookie session or browser secret was added. This follows the current Sites authentication guidance for workspace identity. When external public sign-in is required, confirm the platform-supported auth path before scaffolding a provider. No sign-in redirect is claimed in the current public prototype.

Session responses are `Cache-Control: no-store` and public errors reveal only a request ID and safe message. The current session route is an identity boundary, not a live account dashboard. Logout, session expiry and persistent memberships require the selected platform/provider and belong to the next authentication implementation slice.
