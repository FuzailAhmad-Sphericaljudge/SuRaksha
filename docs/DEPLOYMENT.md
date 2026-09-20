# Deployment

The repository builds one immutable image and runs it with separate demo and production configuration. Never share their volumes, databases, upload paths or gateway secrets.

## Local container commands

Docker is required. It is not installed on the current development machine, so the image is built by the GitHub Actions container job.

- Demo: `docker compose --profile demo up -d --build demo`
- Production: set a random `IDENTITY_GATEWAY_SECRET` of at least 32 characters, then run `docker compose --profile production up -d --build production`
- Readiness: `GET /api/ready`

## Submission demo on Railway

`railway.json` deploys the repository Dockerfile as one full-stack service and
uses `/api/ready` as the release health check. For a public hackathon demo, keep
`APP_MODE=demo`; the UI will retain its demo-data banner and no identity-gateway
secret is required. Railway supplies `PORT`, while the image already binds to
`0.0.0.0`.

1. Run `railway up --new --name suraksha-demo --detach -y`.
2. Run `railway domain` and create the generated public domain.
3. Confirm both `/` and `/api/ready` over HTTPS.

The demo SQLite database and uploads are ephemeral until a Railway volume is
mounted at `/app/data`. Attach that volume before using the link for data that
must survive a redeploy. Production mode still requires the identity gateway,
separate durable storage and every production checklist item below.

The Compose ports bind to loopback. Put an authenticated reverse proxy or identity gateway in front of production. The gateway must remove incoming `oai-authenticated-user-*` and `x-suraksha-gateway-secret` headers, set verified identity headers itself, attach the shared secret, terminate TLS and forward only to the loopback/container network. Direct internet access to the application port is prohibited.

## Production checklist

1. Run `npm run release:gate` and require the GitHub Verify and container jobs.
2. Create separate encrypted persistent volumes for the database and uploads.
3. Generate the gateway secret in the hosting secret manager. Do not put it in Git or image layers.
4. Configure domain, TLS, identity provider, request/body limits and edge rate limits.
5. Configure off-host encrypted backups, readiness monitoring and alerts.
6. Deploy the image by immutable commit SHA, run migrations by starting one instance, then verify `/api/ready`.
7. Run demo and production smoke scenarios through their public gateways.

Rollback uses the previous commit-SHA image with the additive database schema. For data recovery, follow `RECOVERY.md`. Provider email/SMS delivery remains an adapter boundary until provider credentials and consent templates are configured.
