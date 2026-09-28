# Phase 1: walking skeleton - design

Issue: [#2](https://github.com/tomyka/sportbet_new/issues/2), part of epic #1.
Decisions it builds on: [`docs/decisions.md`](../../decisions.md). The owner
delegated every tooling choice below; each carries its reason so a later
change knows what it is giving up.

## Goal

One page that touches every layer (page -> domain -> Postgres), with every
safety rule from decision 5 switched on and the whole delivery pipeline of
decision 8 working: a push to `main` is checked, built, deployed to
`https://new.staging.sportbet.lt` and smoke-tested, with no hand step.

No feature, page or rule from sportbet is ported. The page lists tournaments
only to prove the layers; it is the seed of the real hub, not the hub.

## What the owner sees

- `https://new.staging.sportbet.lt/` - a plain list of the seeded tournaments,
  each with its format.
- `https://new.staging.sportbet.lt/tournament/<slug>` - one tournament's name
  and format; an unknown slug is a 404.
- A green CI run on every push, and a red one (emailed by GitHub) if a check,
  the deploy, the smoke test or the nightly backup fails.

Text is English and unstyled; languages and styling arrive with the first
ported page.

## Repository layout

```
apps/web          Next.js app (App Router), server-rendered; the only app
packages/domain   pure TypeScript: no framework, no I/O, no database
packages/db       Drizzle schema, migrations, queries, seed
infra/            Compose files, Caddyfile, host scripts, systemd units
.github/workflows CI/CD and the backup check
```

`tools/migrate` (the sportbet data migration) arrives in Phase 2; no empty
folder is created for it now.

Code inside each package is organised by domain area:
`packages/domain/src/tournament/`, `packages/db/src/tournament/`. Phase 2
adds areas beside it.

Package names: `@sportbet/domain`, `@sportbet/db`, `@sportbet/web`.

## Tooling

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node 24 LTS, pinned in `.nvmrc`, `engines` and the Docker base image | the LTS line through 2028 |
| Packages | pnpm 10 workspaces, version pinned by `packageManager` | strict dependency isolation: a package cannot import what its own `package.json` does not list, which backs the layering rule |
| Web | Next.js, latest stable at scaffold time, pinned | decision 3 |
| Database layer | Drizzle ORM with `node-postgres`; `drizzle-kit` generates SQL migrations checked into `packages/db/migrations` | schema in TypeScript, so the Postgres enum is built from the domain's union and cannot drift; migrations are plain SQL to review |
| Postgres | 18, official image | current major; tests and staging run the same image |
| Validation | Zod | decision 5 |
| Tests | Vitest (unit, database, component, feature, smoke); Testing Library for components; Testcontainers for anything with a database; Playwright for E2E | one runner for everything below the browser; Playwright is the standard for real-browser tests and runs on arm64 Linux |
| Lint | ESLint flat config, `typescript-eslint` `strict-type-checked`, core `no-restricted-imports` per package | type-aware rules for decision 5; per-package import rules enforce web -> db -> domain |
| Format | Prettier, checked in CI | no style review by hand |

Every version is pinned exactly (lockfile plus `save-exact`), and upgrades are
deliberate commits. Docker base images are pinned exactly too, chosen at
build time: `node:24.21.0-slim` (matches `.nvmrc`; the Dockerfile),
`postgres:18.6` (`infra/compose/app.yml`, `packages/db/src/testing.ts`,
`infra/host/backup.sh`) and `caddy:2.11.4` (`infra/edge/edge.yml`). The three
`node`/`postgres` locations are bumped deliberately together; `caddy` on its
own schedule.

## Safety rules (decision 5), concretely

- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `verbatimModuleSyntax`. Every package extends it and is checked with
  `tsc --noEmit` (`pnpm -r typecheck`). TypeScript is pinned to 6.0: 7.0 (the
  native compiler) is out, but typescript-eslint supports only `<6.1`.
- Lint errors (never warnings) on: `no-explicit-any`, `no-unsafe-*`,
  `consistent-type-assertions` with `assertionStyle: never` except `as const`,
  `no-non-null-assertion`, `switch-exhaustiveness-check`
  (with `considerDefaultExhaustiveForUnions: false`, so a `default` cannot
  hide a missing case).
- No `eslint-disable` without a reason, enforced by
  `eslint-comments/require-description`.
- Dependency direction, enforced twice:
  - each `package.json` lists only what it may use: `domain` depends on no
    workspace package, `db` on `domain`, `web` on `db` and `domain`;
  - `no-restricted-imports`, configured per package, rejects the rest:
    `domain` may import only `zod` and its own files; `db` may not import
    `web`, Next or React; `web`'s runtime code may not import `pg`,
    `drizzle-orm` or `@sportbet/db/testing`; nothing may import another
    package's internals (`@sportbet/*/src/...`), only its entry points.
- Boundaries parsed with Zod: environment (at process start), route params,
  database rows (every query result goes through the domain schema before it
  leaves `db`).

Points, decimals and the session are not touched in Phase 1 (no scoring, no
sign-in); their rules apply from the first code that needs them.

## The layers

### domain

`packages/domain/src/tournament/`:

- `FORMATS = ['football', 'euroleague'] as const` and
  `type Format = (typeof FORMATS)[number]` - the closed union.
- `formatLabel(format: Format): string` - an exhaustive `switch`
  (`Football`, `Euroleague`). Adding a format without a case fails lint and
  typecheck.
- `slugSchema` (lowercase letters, digits and hyphens, 1-100 chars - the
  exact rule sportbet validates slugs with, so every migrated slug is valid) and
  `tournamentSchema` (`{ id, slug, name, format }`), with the inferred
  `Tournament` type.

Depends on Zod only.

### db

`packages/db/src/`:

- `tournament/schema.ts`: `format` as `pgEnum('format', FORMATS)`; table
  `tournaments`: `id integer generated always as identity primary key`,
  `slug text not null unique` with a `CHECK` matching `slugSchema`'s pattern,
  `name text not null` with a `CHECK` that it is not blank,
  `format format not null`, `created_at timestamptz not null default now()`.
- `tournament/queries.ts`: `listTournaments(db)` (ordered by name) and
  `findTournamentBySlug(db, slug)`, returning `Tournament[]` and
  `Tournament | undefined`, each row parsed with `tournamentSchema`.
- `client.ts`: `createDb(url)` returns a Drizzle client on a `pg` pool.
- `migrations.ts`: applies `migrations/`; `bin/migrate.ts` is the entry point
  of the one-shot migrate container and `bin/seed-staging.ts` the entry
  point of the seed task, both bundled to `dist/*.mjs` by `build.mjs`.
- `seed/staging.ts`: inserts `Euro 2028 (football)` and
  `Euroleague 2026/27 (euroleague)` with `ON CONFLICT (slug) DO NOTHING`, so
  it can run on every deploy.

### web

`apps/web/`:

- `src/env.ts`: parses `process.env` (`DATABASE_URL`) with Zod at startup;
  a bad or missing value stops the process with the Zod message.
- Components (`src/components/`): `HomeView` (an `h1` plus `TournamentList`),
  `TournamentList`, `TournamentDetails`, `NotFoundView`, `BackToList` (the
  "All tournaments" link back, shared by `NotFoundView` and
  `TournamentDetails`). Pages only parse params, call a query and return one
  of these; all markup lives in the components.
- `app/page.tsx` (`/`): server component; reads `listTournaments` per request
  (dynamic, never cached at build) and renders `HomeView`.
- `app/tournament/[slug]/page.tsx`: parses `params.slug` with `slugSchema`;
  a parse failure or a missing tournament is `notFound()`, so both are 404;
  otherwise renders `TournamentDetails`.
- `app/not-found.tsx`: renders `NotFoundView`.
- `app/api/health/route.ts`: runs `select 1`; `200 {"status":"ok"}` or
  `503`. Used by the container healthcheck and the deploy.
- `next.config` uses `output: 'standalone'` for a small image.

## Error handling

| Failure | Result |
|---|---|
| Bad or missing environment | process exits at start; container unhealthy; the deploy script puts the previous release's `web` back and fails the job |
| Migration fails | deploy stops before the new web container starts |
| Database unreachable | page is a 500; `/api/health` is 503 |
| Row fails its schema | the query throws; page is a 500 (a bad row is a bug to see, not to hide) |
| Bad or unknown slug | 404 |

## Tests

A pyramid, the shape sportbet reached (sportbet #190, #191): many fast tests
at the bottom, a few slow ones at the top, and each layer catching what the
one below cannot. Every suite runs on Postgres 18 where it touches a database,
never a substitute.

| Suite | Tool | Where | What it proves | Runs |
|---|---|---|---|---|
| unit | Vitest | `packages/domain` | pure rules in isolation | CI `check` |
| database | Vitest + Testcontainers | `packages/db` | schema, constraints, migrations and queries against real Postgres | CI `check` |
| component | Vitest + Testing Library (jsdom) | `apps/web` | a component renders the right markup for the data it is given | CI `check` |
| feature | Vitest + Testcontainers | `apps/web/tests/feature` | the built app over HTTP, with a real database, route by route | CI `check` |
| E2E | Playwright (Chromium) | `apps/web/e2e` | a user's journey in a real browser, against the Docker image that will be deployed | CI `e2e`, and again on staging |
| smoke | Vitest, plain HTTP | `apps/web/smoke` | the deployed host: TLS, proxy, health | after each staging deploy |

**Database and feature tests run before the deploy, not after it.** sportbet
ran its feature suite on staging only because CI had SQLite and staging was
the first place with the real engine (sportbet #158, #191). Here CI already
runs the real engine - the same Postgres 18 image, in a throwaway container on
the same host - so a second pass on staging would repeat it, and running them
only after the deploy would let a broken migration or query reach staging
before anything caught it. After the deploy runs only what the deployed host
alone can answer: E2E and smoke against staging (TLS, Caddy, DNS, the seeded
database).

**Pages load, components render.** A page (`page.tsx`) only parses its
params, calls a query and hands the result to a component; all markup lives
in plain synchronous components that take data as props
(`TournamentList`, `TournamentDetails`). That split is what lets component
tests render markup without a database or a server, and it is the rule for
every page ported later.

### What each suite covers in Phase 1

- **unit:** `formatLabel` for every format; `slugSchema` accepts and rejects
  at its edges (empty, 100 and 101 characters, uppercase, spaces); a blank
  name, including one of only no-break spaces (the domain and the database
  CHECK share one character class for "blank"); a type-level test that
  `Format` is exactly the closed union
  (`expectTypeOf<Format>().toEqualTypeOf<...>()`).
- **database:** a throwaway container per run; migrations apply from empty;
  `listTournaments` orders by name and `findTournamentBySlug` finds or returns
  `undefined`; the `CHECK`s and the enum reject a bad slug, a blank name and an
  unknown format; the seed is idempotent (running it twice leaves two rows).
- **component:** `TournamentList` renders one link per tournament, to
  `/tournament/<slug>`, with the format label, and an empty-state message for
  no tournaments; `TournamentDetails` renders name, format label and
  `BackToList`; `NotFoundView` renders a heading and `BackToList`.
- **feature:** a global setup starts a Postgres container, applies the
  migrations and starts the standalone production server (`server.js`, the file the image runs) against it; each
  test writes the rows it needs through `@sportbet/db` and every table is truncated before each test.
  `/` is 200 and lists exactly the rows in the table; `/tournament/<slug>` is
  200 for a stored slug, 404 for an unknown one and 404 for one that fails
  `slugSchema`; `/api/health` is 200. The health check's 503 when the
  database is down runs in its own file, with its own container and server,
  so stopping that database cannot affect any other test.
- **E2E:** the CI `e2e` job brings up a throwaway Compose project from the
  images just built (`postgres`, `migrate`, `seed`, `web`) and runs Playwright
  against it; the same suite runs again against staging after the deploy.
  Journeys: open `/`, see both seeded tournaments, click one, land on its
  page with name and format, go back; open an unknown slug and see the 404
  page. Read-only, so it is safe against any environment; a failure keeps
  the trace and screenshot as a CI artifact.
- **smoke:** plain HTTP against `SMOKE_BASE_URL` (required; missing is a
  failure, as is any skip): `/api/health` is 200 over HTTPS with a valid
  certificate, `/` is 200, and `http://` redirects to `https://`. It never
  imports app code - it only sees what the host sends back.

Skips are failures in every suite (`--passWithNoTests` off, `test.skip` and
`.only` banned by lint), so a test cannot quietly stop running.

## CI/CD

One workflow, `.github/workflows/ci.yml`, on every push to any branch, on the
self-hosted runner on `sportbet-new` (labels `self-hosted, sportbet-new`). The
repository is private, so this also costs no GitHub-hosted minutes.

| Job | Needs | Branches | Steps |
|---|---|---|---|
| `check` | - | all | install (frozen lockfile), format check, lint, typecheck, build, unit, database, component and feature tests |
| `image` | - | all | build the multi-stage Docker image natively on arm64 (targets `web` and `migrate`), tagged with the commit SHA; push to GHCR on `main` only |
| `e2e` | `image` | all | a throwaway Compose project from the SHA's images; Playwright against it; torn down after, pass or fail |
| `staging` | `check`, `e2e` | `main` | pull the SHA's images, run `migrate` then the seed, `up -d web`, wait until healthy |
| `smoke` | `staging` | `main` | the smoke suite, then the E2E suite, against `https://new.staging.sportbet.lt` |

- GHCR login uses the workflow's own `GITHUB_TOKEN` (`packages: write`), so it needs no stored secret.
- Each deploy job has its own concurrency group (`deploy-staging`,
  `staging-smoke`), so a newer push supersedes a pending older one.
- **Rollback:** `workflow_dispatch` with a `tag` input redeploys an earlier
  SHA's images and skips `check` and `image`. There is no rollback on the
  very first deploy: no previous tag exists yet to fall back to.
- The runner runs as its own user in the `docker` group, which is effectively
  root on the host. That is acceptable for a private repository only the owner
  pushes to, and would need revisiting if the repository ever takes outside
  pull requests.
- **A host that builds every push fills its disk.** A daily systemd timer
  (`infra/host/docker-prune.timer`, `docker-prune.service`) removes
  containers, images, build cache and networks unused for three days (never
  volumes - that is data).
- **The self-hosted check cannot report when its own host is down.**
  `.github/workflows/backup-check.yml` therefore has a second job,
  `reachable`, on a GitHub-hosted runner: one short daily `curl` of
  `/api/health` over HTTPS, purely to catch that case.
- **Staging holds fake data.** The Caddyfile adds response compression
  (`encode zstd gzip`) and `X-Robots-Tag: noindex, nofollow`, so staging
  cannot be indexed; the smoke suite asserts the header is present, so a
  future Caddyfile that drops it fails smoke, not silently.

## Host

`sportbet-new`, per decision 8:

- VM.Standard.A1.Flex, 2 OCPU / 12 GB, Ubuntu 24.04 aarch64, availability
  domain 1, the public subnet of `sportbet-vcn`, a reserved IPv4
  `sportbet-new-ip` and an IPv6 address.
- **Always Free only.** The existing hosts use 2 of the 4 free OCPUs and
  12 of the 24 GB, so this takes exactly what remains. The boot volume is sized
  to fit what the existing volumes leave of the 200 GB free block storage.
  The free-tier check is not a provisioning script: it is a manual check
  (plan Task 20, Step 1) run before launching the instance, and enforced
  since 2026-09-28 by the Oracle quota policy `always-free-caps` (A1 only,
  4 OCPU / 24 GB, regional and per-AD; 200 GB block storage) plus the budget
  `always-free-watch`.
- Firewall: the public subnet's existing security list already allows TCP 80
  and 443 from anywhere (IPv4 and IPv6) and TCP 22 only from the owner's
  addresses, so no new network security group is made. Oracle's Ubuntu image
  carries its own iptables REJECT rules beneath that list, so bootstrap opens
  80 and 443 there too (sportbet #147). SSH is key-only, no root login.
  `unattended-upgrades` is on.
- `infra/host/bootstrap.sh` (idempotent): Docker Engine plus the Compose
  plugin, the `runner` user, log rotation for containers, and the backup and
  docker-prune timers.
- `infra/host/install-runner.sh` registers the GitHub Actions runner as a
  systemd service, separately from bootstrap (the one-hour, single-use
  registration token arrives on its stdin, never a file or bootstrap
  argument).

Compose projects on the host, under `/srv/sportbet-new/`:

- `edge`: Caddy with automatic TLS on a shared Docker network `edge`; routes
  `new.staging.sportbet.lt` to the staging web container. Production's name is
  added here at switch-over. The files under `infra/edge/` (Compose file and
  Caddyfile) are copied onto the host by every deploy
  (`infra/ci/deploy-staging.sh`), not only by bootstrap.
- `sportbet-staging`: `postgres` (18, named volume `pgdata`, healthcheck
  `pg_isready`), `migrate` and `seed` (one-shot), `web` (healthcheck on
  `/api/health`). Only `POSTGRES_PASSWORD` lives in
  `/srv/sportbet-new/staging/.env` (generated on the host by bootstrap, mode
  600, never in git); Compose builds `DATABASE_URL` from it.

## Backups

Mirrors sportbet's backup (sportbet #154), which has held up in production:

- A systemd timer (nightly, 02:37 UTC) runs `infra/host/backup.sh`:
  1. `pg_dump -Fc` of the staging database, from the `postgres` container;
  2. upload to the existing Object Storage bucket under
     `sportbet-new/staging/`, authenticated as the host itself (an OCI
     instance principal: a dynamic group holding only this instance, with a
     policy that allows creating and reading objects in that bucket only -
     not overwriting or deleting them, so a compromised host cannot destroy
     a backup - and no stored credential on the host). The policy also
     grants `OBJECT_INSPECT`, needed to read an object's metadata on
     download;
  3. **restore test:** download the object just uploaded, restore it into a
     throwaway Postgres 18 container, and compare each table's row count with
     the live database;
  4. write `/srv/sportbet-new/backup-status.json` (status, file, bytes, time,
     reason on failure).
- `.github/workflows/backup-check.yml` runs every morning on the runner and
  goes red if the last status is not `ok` or is more than 26 hours old.
- Retention: a lifecycle rule deletes `sportbet-new/` objects after 30 days,
  merged into the bucket's existing lifecycle policy, never replacing it.

## Owner steps

Everything else is scripted; these need the owner:

1. Approve creating the Oracle resources (instance, reserved IP, IPv6
   address, dynamic group and policy, lifecycle rule) - they are created from this laptop's OCI
   CLI only after the owner says yes.
2. In Hostinger's hPanel: an `A` record `new.staging` pointing at the reserved
   IPv4, and an `AAAA` record pointing at the IPv6 address. The values are
   given at that step.

No GitHub secret is needed in Phase 1.

## Out of scope

Sign-in, sessions, mail (Resend and Mailpit arrive with authentication),
styling, languages, decimals, the production Compose project, the data
migration, and any sportbet rule.

## Records to update

When Phase 1 lands, `docs/decisions.md` "Still to decide" is replaced by what
was settled here: the layout, Node 24, pnpm, Postgres 18, Drizzle, Vitest.

## Done when

Every acceptance criterion of #2 holds, a push to `main` has gone from commit
to a green smoke run on `https://new.staging.sportbet.lt` with no hand step,
and the first nightly backup has passed its restore test.
