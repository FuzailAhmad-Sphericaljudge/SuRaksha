# Phase 02 architecture decisions

Status: local engineering foundation. No paid accounts, deployment, database migrations, authentication service or storage buckets have been created.

## Application boundary

Use a modular monolith: React/Vite web client, one Fastify Node.js 24 API, and a shared Zod contract package. Production serves the compiled web application and API from one origin. Development uses Vite's `/api` proxy. No agents, automated verification decisions or browser-side secrets.

| Workspace            | Responsibility                                                                |
| -------------------- | ----------------------------------------------------------------------------- |
| `apps/web`           | React interface and validation of API responses; no provider credentials      |
| `apps/api`           | Configuration, public API, future authorization and server integrations       |
| `packages/contracts` | Public/module boundary schemas and inferred types, with no environment access |

Phase 02 added only liveness and error contracts. Phase 03 adds property, evidence and verification domain contracts without database writes or migrations.

## Selected integration direction

These are implementation targets, not provisioned services or commitments to paid plans. Reassess cost, region, privacy and capacity before pilot provisioning.

- Hosting: Render Node web service, with the API serving the Vite build from the same origin. Explicitly configure Node 24, `HOST=0.0.0.0`, production mode and platform `PORT`. [Node version configuration](https://render.com/docs/node-version) and [web services](https://render.com/docs/web-services).
- Database: PostgreSQL, initially Render Postgres in the same region as the API. PostgreSQL supports the intended relational building/report/inspection model. No tables or credentials in this phase. [Provider connection documentation](https://render.com/docs/postgresql-creating-connecting).
- Evidence storage: private Cloudflare R2 through its S3-compatible server API. Phase 09 will separate restricted originals and moderated derivatives, including video-processing limits; R2 itself is not a moderation or transcoding system. [S3 API documentation](https://developers.cloudflare.com/r2/get-started/s3/).
- Authentication: Better Auth backed by PostgreSQL, implemented in Phase 07. Application roles and property permissions stay in server-owned membership records; the provider does not decide who may inspect a building. [Database integration documentation](https://better-auth.com/docs/installation).
- Frontend: React/Vite; Three.js arrives in the visual/model phases. [Vite setup documentation](https://vite.dev/guide/).
- Runtime schemas: Zod parsing on both sides of the API boundary. [Zod parsing documentation](https://zod.dev/basics).

## Configuration and secrets

Only `apps/api/.env` is loaded, by the API's development/start scripts. Copy its example if custom settings are needed. Zod rejects invalid ports, modes and log levels and strips unrelated process-environment keys. Startup errors list invalid keys rather than values. Logs redact authorization/cookie headers; public error responses never include exception details.

The web client has no environment variables or provider SDKs. Do not add secrets using Vite's public environment prefix. Future secrets must be added to the server example and validation together. No secrets are necessary to install, verify or run this phase.

## Health, failures and shutdown

`GET /api/health` returns `{ service: 'suraksha-api', status: 'ok', timestamp: '<UTC ISO time>' }` with `Cache-Control: no-store`. This confirms process liveness only, not database readiness or building safety. Repeated reads have no side effects. Unsupported routes and methods return a structured error with a server-generated request ID. Future retries on mutation routes need explicit idempotency contracts; none exist yet.

SIGINT/SIGTERM close Fastify gracefully. Production startup fails if the web bundle is missing. Current static serving supports the foundation root page; client-side routing/fallback must be added with real profile routes in later phases.

## Verification

`npm run verify` runs formatting checks, strict typechecks, behavior tests and production builds. Tests cover UTC validation, unexpected response fields, read-only repeated requests, errors, recovery after failure, config rejection and client retry/response validation. CI installs from the lockfile and runs the same command on pushes and pull requests.

This phase does not validate login, media security or building verification: those capabilities are absent. The initial web screen explicitly communicates that search, reporting and inspection are not yet available; it is not the final reference-matched frontend.
