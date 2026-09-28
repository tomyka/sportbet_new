# Decisions

Why this project exists and what was decided before any code. Each entry
says what was chosen, why, and what was turned down. Agreed with the owner
on 2026-09-27; the evaluation that led here is linked from
[sportbet#240](https://github.com/tomyka/sportbet/issues/240).

## 1. Rebuild, don't extend

sportbet (PHP 8.4, Laravel 12) is not extended or strangled in place. This
is a new project that ports its functionality step by step. Production stays
on the old app until this one covers everything players use, then switches
over once.

- **Why:** the owner judges PHP not future-proof for this project, and does
  not want the new structure shaped by the old one.
- **Turned down:** running both apps side by side behind nginx with a shared
  session (a strangler migration). It keeps production changing all the way
  through and ties the new app to Laravel's session and cookie formats.
- **What carries the risk instead:** the switch-over day, which decision 7
  makes rehearsed and reversible.

## 2. TypeScript

- **Why:** the axis this project is judged on is how much of an agent's
  mistake is caught before a player sees it. TypeScript type-checks the
  views with the same compiler as the backend, which closes the one gap PHP
  could not (Blade was never checked). It is also the language agents know
  best.
- **Turned down:** C# / .NET (strictest compiler and native decimals, but the
  largest distance from today); Go (no null safety, no exhaustiveness).
- **Condition:** strict settings from the first commit - see decision 5.

## 3. Next.js, one app, with the rules in a framework-free package

Server-rendered pages at the same URLs as today; writes through server
actions. The rules (scoring, serija, survival, standings, ranking, formats)
live in a plain TypeScript package with no framework, database or I/O, and
are tested on their own.

- **Turned down:** a separate API plus a single-page front end (two apps to
  keep in step); a lean server with hand-built TSX templates (more plumbing
  by hand).

## 4. New PostgreSQL schema, data migrated by a rehearsed script

The schema is designed for the new code, not copied: proper types, points
as exact decimals, real enums and CHECK constraints, and none of the old
leftovers (the unused `league_game_odds` table, the string
`audit_logins.user_id`, `generated` stored as a blob).

- **Why Postgres:** exact numeric types, enums and constraints, and the best
  TypeScript tooling support.
- **Why a new schema:** it is the only way to shed the old structure. The
  cost is a migration script, which decision 7 rehearses.
- **Turned down:** keeping MySQL and today's schema (switch-over would be
  easier, but the old quirks would shape the new code).
- **Tests run on Postgres itself**, in a throwaway container per run. The old
  project's SQLite-versus-MySQL divergences (sportbet #41, #158, #191) cannot
  happen here.

## 5. The safety rules, from the first commit

These replace what sportbet reached with PHPStan level 10 (sportbet #242 to
#253), and start there rather than working up to it:

- TypeScript `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`; `any` and unchecked `as` banned by lint.
- Every boundary is parsed with a schema (Zod): form input, route params,
  environment, database rows. Nothing untyped gets past the edge.
- Formats are a closed union (`football | euroleague`) and every `switch`
  over one is checked exhaustive.
- Points are exact decimals, never floats.
- The session holds who the player is and nothing else. League, tournament
  and current event are resolved per request (sportbet's session-cached
  state is the source of a whole class of stale-value bugs).
- The direction of dependencies (web -> db -> domain) is enforced by lint.

## 6. Parity bar: everything players use

Before switch-over, every page and rule a player or admin actually uses
works the same, and every stored point in production reproduces exactly.
What is already dead or deprecated in sportbet is left behind, and each such
item is listed for the owner to confirm before it is dropped.

- **Rules are not invented.** sportbet's CLAUDE.md and CONTEXT.md record the
  confirmed rules (scoring matrices, survival, standings formats, ranking,
  auth); they are the specification. Where the new code would need a rule
  they do not state, the owner decides.

## 7. Switch-over

- The parity checker recomputes every `point_results`, `point_standings` and
  `point_survivals` row from a copy of production and must match them all -
  a far larger oracle than sportbet's golden master.
- The data migration is rehearsed on production copies until it is clean.
- The switch happens between tournaments, with the old app left running for
  a fallback window.

## 8. Infrastructure: Oracle Cloud, a host of its own

| Piece | Choice |
|---|---|
| Host | New `sportbet-new`: A1.Flex 2 OCPU / 12 GB (the rest of the Always Free allowance), Ubuntu 24.04 arm64, public subnet, reserved IPv4 and IPv6 |
| Runtime | Docker Compose, one project per environment (staging now, production at switch-over) |
| Web front | Caddy with automatic TLS |
| Database | Postgres in Docker on the same host, one database per environment, on a data volume |
| Backups | Nightly `pg_dump` to the existing Object Storage bucket, with a restore test |
| CI/CD | GitHub Actions on a self-hosted runner on the new host: typecheck, lint, unit, database tests, build, deploy to staging, smoke test |
| Images | GitHub Container Registry |
| Mail | Resend for real mail, Mailpit on staging |
| Staging URL | `new.staging.sportbet.lt` |

At switch-over `sportbet.lt`'s DNS moves to the new host; the old hosts and
the MySQL HeatWave instance are retired after the fallback window.

- **Turned down:** sharing sportbet's hosts (one core shared with the old
  staging and runner); Vercel plus managed Postgres (data leaves the Oracle
  account; free-tier limits decide scaling).
- **Owner-only steps:** creating the host in the Oracle console (or granting
  OCI CLI access), the DNS record in Hostinger's hPanel, and GitHub secrets.

## Phases

| Phase | Done when |
|---|---|
| 0. New project | This repo exists and these decisions are written down |
| 1. Walking skeleton | One page touching every layer (page -> domain -> Postgres), strict TypeScript and lint, CI gating every push, auto-deploy to staging, a smoke test against it. No features |
| 2. Migration | Areas ported one at a time, each with its own tests; the parity checker lands with scoring |
| 3. Switch-over | Rehearsed migration, every stored point reproduced, switched between tournaments |

## Settled in the walking-skeleton spec

Recorded in `docs/superpowers/specs/2026-09-27-walking-skeleton-design.md`
(issue #2), where each choice carries its reason:

- **Layout:** `apps/web`, `packages/domain`, `packages/db`, `infra/`;
  `tools/migrate` arrives with Phase 2. Code inside a package is organised by
  domain area.
- **Toolchain:** Node 24 LTS, pnpm 10 workspaces, TypeScript 6.0 (held below
  7.0 until typescript-eslint supports it).
- **Database:** Postgres 18; Drizzle ORM on node-postgres, with SQL
  migrations generated by drizzle-kit and checked in.
- **Tests:** Vitest (unit, database, component, feature, smoke), Testing
  Library, Testcontainers, Playwright (E2E). Database and feature tests run in
  CI against the same Postgres 18 image staging runs.
