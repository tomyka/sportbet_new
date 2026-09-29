# sportbet_new

The successor to [sportbet](https://github.com/tomyka/sportbet): a sports prediction game, rebuilt from scratch in TypeScript. The first transition ports the Euroleague only; football arrives in its own later phase (decision 11).

Production stays on the old app until this one covers everything players use, then switches over once, between tournaments.

## Working on it

Needs Node 24, pnpm 10 and Docker (the database and feature tests start
Postgres containers).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build                  # the feature tests run the production build
pnpm test:unit              # packages/domain
pnpm test:component         # apps/web components (jsdom)
pnpm test:db                # packages/db against Postgres 18
pnpm test:feature           # the built app over HTTP against Postgres 18
E2E_BASE_URL=... pnpm test:e2e           # Playwright, against a running stack
SMOKE_BASE_URL=https://... pnpm test:smoke
```

A local stack from built images, for E2E:

```bash
docker build --target web -t sportbet-web:local .
docker build --target migrate -t sportbet-migrate:local .
WEB_IMAGE=sportbet-web:local MIGRATE_IMAGE=sportbet-migrate:local infra/ci/e2e-stack.sh up sb-local
infra/ci/e2e-stack.sh down sb-local
```

Local settings for `next dev` go in `apps/web/.env.local`, never `.env`:
`next build` copies `.env` into the production server.

Staging is `https://sportbet-new-staging.vercel.app` (Vercel and Neon, seeded
fake data; decision 12), deployed by every green push to `main`. It moves back
to Oracle, as `https://new.staging.sportbet.lt`, once the host exists. What exists on Oracle and how it was made will be written to
`docs/oci.md` once the host is provisioned. Design and plan of the walking
skeleton: `docs/superpowers/`.
