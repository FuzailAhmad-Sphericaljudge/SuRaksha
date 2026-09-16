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

## Current status

The current repository is a visual prototype plus contract foundation; its main workflows are not yet connected to persistent production services. The implementation plan now requires browser-testable, persistent vertical slices and separate demo/production environments. See [the production roadmap](docs/PRODUCTION_ROADMAP.md).

Use Node.js 24 and npm 11. Run `npm ci`, then `npm run dev`. Run `npm run verify` before pushing. Provider choices are documented; no external infrastructure is provisioned. The initial screen is a foundation preview, not the final 3D design.
