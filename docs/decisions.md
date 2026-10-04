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
- Formats are a closed union, `euroleague` alone until football is ported
  (decision 11), and every `switch` over one is checked exhaustive.
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

## 9. A web app; a PWA after switch-over, not a native app

Players use sportbet in the phone's browser, as today. Nothing mobile-specific
is built before parity. After switch-over, if players would use them, a web
app manifest and web push (predictions-closing reminders) turn the same app
into an installable PWA.

- **Why:** the app is forms and tables - predictions, standings, leagues -
  which the browser handles fully; it needs no camera, location or offline
  mode. Push reminders, the one strong reason for an app, work from a PWA
  (on iPhone since iOS 16.4, once added to the home screen).
- **Turned down:** a native app (React Native, or the web app wrapped in
  Capacitor). It adds a second front end and release pipeline, store review
  on every update, and store fees ($99 a year for Apple, $25 once for
  Google), which break the zero-cost setup of decision 8.
- **Reopen only if** players ask to find it in the app stores, or push from
  a PWA proves not enough. Wrapping the web app in Capacitor comes before
  any rewrite.

## 10. A rich domain model, not the old app's query-shaped code

The owner asked (2026-09-28) that the rebuild not recreate sportbet's
query-oriented structure - rules spread across controllers and SQL - but put
the logic into objects with methods, and left the engineering to Claude.

- **Domain (`packages/domain`):** aggregates that own their rules as methods
  (a game knows whether it is open for predictions at a moment; a prediction
  scores itself against a result under its format; a survival run decides
  whether a pick is allowed and what the run is worth; a standings table
  knows its deadline). Value objects for the concepts sportbet passes around
  as bare strings and numbers (slug, score, points as exact decimals,
  format). Objects are created only through validating factories built on
  the invariant definitions (#3), so an invalid one cannot exist. No I/O, no
  framework (decision 3 unchanged).
- **Database (`packages/db`):** repositories that load and save whole domain
  objects. SQL stays behind them; no raw row reaches `apps/web`.
- **Web (`apps/web`):** thin use cases per action (load, call the method that
  decides, save) and pages that render; no rule lives in a page, action or
  query.
- **Why:** sportbet's worst defects (predictions editable after the lock,
  standings saved past the deadline, survival picks never checked) come from
  the rule living in a controller that asks the wrong row. When "is this game
  open?" is a method of the game the prediction belongs to, that class of bug
  cannot be written. It also makes each rule testable on its own, which the
  parity checker (decision 7) depends on.
- **Scope:** starts with the first Phase 2 slice that has real behaviour
  (formats and scoring), which becomes the template later slices copy.
  Phase 1's `Tournament` has no behaviour yet and stays a parsed record until
  a rule needs it - a class with no method would be ceremony.
- **Turned down:** porting sportbet's services and queries one-to-one (fast,
  but it carries the structure that produced the audit's findings); an
  active-record ORM model (ties rules to rows and the database, against
  decision 3).

## 11. Basketball first; football is a later phase

Agreed with the owner on 2026-09-29. The first transition ports Euroleague
(basketball) only; all football logic is left out of sportbet_new for now.

- **Why:** it makes the first switch-over much smaller - no draws,
  penalties, knockout half-credit, group-table standings or the World Cup and
  Euro formats - and production holds only a Euroleague tournament, so the
  parity checker (decision 7) can prove every stored row.
- **What changes:** the format union (decision 5) is `euroleague` alone
  until football is ported; its exhaustive switches stay, so adding
  `football` is a compiler-guided change. Parity (decision 6) means
  everything a Euroleague player or admin uses.
- **Football:** ported into sportbet_new as its own phase, in time for the
  next football tournament the site runs (e.g. Euro 2028, June 2028). The old
  app is retired at the basketball switch-over; it does not keep running for
  football.
- **Turned down:** porting both formats before switch-over (larger, and
  football cannot be proved against production data that does not exist);
  keeping the old app alive for football (two apps and two databases in
  production at once).

## 12. Temporary staging on Vercel and Neon; production stays on Oracle

Agreed with the owner on 2026-09-29. Oracle has had no free A1 capacity in
Stockholm for days, so staging runs meanwhile on Vercel (Hobby) with a Neon
Postgres (free, Frankfurt), deployed from GitHub Actions on GitHub-hosted
runners. Production stays on Oracle (decision 8): on the current machines
once the old app retires, or on the new host if capacity appears; staging
moves back to Oracle then.

- **Why:** real pages from Phase 2 onwards need a staging to check against,
  and waiting on Oracle capacity blocks that. sportbet is non-commercial (the
  owner earns nothing; funds go to a cause), so Vercel Hobby applies. Staging
  holds only seeded fake data, so no player data leaves Oracle.
- **What stays:** the Docker images, Compose files, Caddy and host scripts
  from Phase 1 remain in the repo for the Oracle move; the pipeline only
  swaps its deploy target. CI runs on GitHub-hosted runners until the
  self-hosted one exists.
- **Limits accepted for staging:** Vercel Hobby cron runs at most daily
  (scheduled jobs use GitHub Actions if staging needs them); Neon sleeps when
  idle and wakes on the first request.
- **Turned down:** Supabase (free projects pause after a week and have no
  backups); waiting for Oracle (no end in sight); moving production to
  Vercel (reopens decision 8).

## 13. The old look, rebuilt; Lithuanian only for now

Agreed with the owner on 2026-10-05, at slice 4's brainstorm.

- **Look:** the new app looks like sportbet does today - same shell, rail,
  header, bottom tabs, colours and both themes - so players notice nothing
  at switch-over. It is rebuilt in Tailwind on sportbet's colour tokens,
  not copied: none of sportbet's CDN scripts (jQuery, Popper, Bootstrap's
  CSS and JS, Alpine) or its 4,700-line stylesheet comes across. A redesign
  is a later project of its own.
- **Language:** Lithuanian only. Text is written in Lithuanian in the
  components; there is no translation layer, no English and no language
  switch. Each player's stored locale is still carried over, so English can
  return later as its own piece of work. This replaces the inventory's
  "every page ships both locales" (`docs/phase-2-inventory.md`, A15 locale
  switch and A21).
- **Why:** the owner does not want sportbet's legacy front end inherited; a
  smaller page (no unused scripts, no CDN round trips) is a side benefit.
  One language halves every page slice's text work.
- **Turned down:** copying `custom.css` and Bootstrap 5.0.1 as they are
  (carries the legacy); a new design now (adds a design step before every
  slice); keeping both languages (twice the text for a minority).

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

## Settled in the core-schema spec

Recorded in `docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`
(issue #9), where each choice carries its reason:

- **Ids:** every migrated entity keeps sportbet's id as its primary key
  (identity columns, saved with `overriding system value`, sequences moved
  past the loaded ids).
- **Points sources:** every derived row carries a `points_source`
  (`production`, `sportbet`, `ruled`) in its key, named by every caller.
- **The reader's tooling:** Testcontainers at runtime for its MySQL and
  Postgres, `mysql2` to read the restored copy, one esbuild bundle like
  `db`'s bins.

## Settled in the parity-checker spec

Recorded in `docs/superpowers/specs/2026-09-30-parity-checker-design.md`
(issue #11), where each choice carries its reason:

- **Two oracles:** production's rows as dumped, and the same copy after
  sportbet's own full recalculation, run by the checker in sportbet's image
  (built on the owner's PC from the commit production runs; no registry
  holds it).
- **The pass bar:** zero rows `new-code-wrong` - the new code under
  `sportbetRules` equals sportbet's own recalculation on every row. Rows
  only production has wrong are `stale`, counted, and cleared by
  recalculating production before switch-over.
- **One recalculation operation:** `recalculateUnderRuleSet` in
  `packages/db`, used by the reader, the golden db test and (slice 7) the
  web's result entry.
