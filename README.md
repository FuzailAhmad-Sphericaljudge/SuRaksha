# SafePG India / SuRaksha

Evidence-based safety profiles and issue resolution for PGs, hostels and coaching institutes.

Students locate a building, inspect available evidence, report a specific issue with photos/videos, and track repair and verification. Owners respond and submit repair proof. Qualified inspectors review only within their scope. Parents can view public profiles and receive student-authorized updates.

- [Phased roadmap](docs/ROADMAP.md)
- [Product and verification rules](docs/PRODUCT.md)
- [Reference design brief](docs/DESIGN.md)
- [Delivery workflow](docs/DELIVERY.md)
- [Architecture and provider decisions](docs/ARCHITECTURE.md)
- [Core domain contracts](docs/CONTRACTS.md)
- [Discovery behavior](docs/DISCOVERY.md)
- [Authentication boundary](docs/AUTH.md)
- [Local development](docs/DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)

## Current status

The repository now contains persistent browser-testable workflows for students, owners, reviewers, professionals and guardians, plus isolated demo/production configuration and container packaging. Real-world provider credentials, an identity gateway, domains, TLS and production operations still need to be provisioned before a public launch. See [the production roadmap](docs/PRODUCTION_ROADMAP.md).

Use Node.js 24 and npm 11. Run `npm ci`, then `npm run dev`. Run `npm run release:gate` before a release. No external infrastructure is provisioned from this repository.
