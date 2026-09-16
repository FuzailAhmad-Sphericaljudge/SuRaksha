# Local development

Use Node.js 24 and npm 11. In Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`; no policy change is necessary.

Run all commands from the cloned `repository/` root:

```sh
npm ci
npm run dev
```

The first command uses the committed lockfile. Development builds the shared contracts first, then watches contracts/API/web together. Web: http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/health. Ctrl+C stops development processes. The web server proxies `/api` to port 3001; if you change that API port, update `apps/web/vite.config.ts` too.

No `.env` is required with defaults. For overrides, copy `apps/api/.env.example` to `apps/api/.env`. Never commit `.env` or put credentials in `apps/web`.

## Checks and production boot

```sh
npm run verify
git diff --check
npm start
```

`verify` checks formatting, types, tests and builds. `start` serves the built web page and API at http://127.0.0.1:3001. Run `npm run build` before `start` if sources changed since verification. For deployment use `NODE_ENV=production`, set the host explicitly to `0.0.0.0`, and let the host supply `PORT`.

Useful individual commands:

- `npm run format`: apply Prettier.
- `npm run typecheck`: build contract types and check all workspaces.
- `npm test`: contract/API/client behavior tests.
- `npm run build`: contracts, API, then frontend.
- `npm run smoke`: boot the compiled production server on local port 3197, check page/assets/API and private-path rejection, then stop it. Requires a completed build and that port to be free.

CI uses Node 24, `npm ci`, `npm run verify`, `npm run smoke` and `git diff --check`. CI passing must be verified from the actual GitHub run; a local pass is not a claim that hosted CI has completed.

Current surface: a foundation page with a real API connection indicator and retry on failure. There is no authentication, database or final Three.js scene yet. See the roadmap for these phases.
