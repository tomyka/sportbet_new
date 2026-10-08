# Quality gates: make the kit pass and run in CI

Issue #25. The TypeScript quality-gate kit (`quality/`, committed b281ff6)
must pass `node quality/gate.mjs check` on this repo, and `quality.yml` must
run on every push and pull request (and the nightly mutation run) without
blocking on anything but real findings.

**Owner's ruling (2026-10-08, #25):** the kit's configuration may be adapted
so the gates cover the four workspace packages, but never weakened:
thresholds, rules and forbidden markers stay as strict or stricter, and
every configuration change is listed on #25. The repo's own rules
(`CLAUDE.md`, `docs/decisions.md`) still bind; where the kit and the repo
differ, the stricter wins.

## The starting point (#25's first run)

- format: pass.
- lint: the kit's strict rules (complexity 10, cognitive complexity 15,
  max-depth 4, max-params 4, 60 lines a function, 400 a file, explicit
  module boundary types, eqeqeq, no-console, no inline config) are held back
  in `eslint.config.mjs`; with them, 235 errors in 145 files.
- typecheck: one root project; Next's `NODE_ENV` augmentation leaks into
  `tools/migrate` (9 errors).
- markers: 4 `eslint-disable`.
- test: the root `vitest.config.ts` (vitest 4.1) runs every package's tests
  without their own configs: 374 of 2059 fail.
- crap: never ran (no coverage; and the Windows quoting bug).
- deadcode: knip ignores top-level `entry` / `project` in a workspace.
- architecture: passes vacuously (only `src/` is scanned).

## Phase 1 - wire the gates for the workspace (devops)

Configuration only, behaviour of the gates unchanged or stricter.

1. **Windows:** `quality/lib.mjs` `run()` quotes each argument when it uses
   the shell (Windows), so `C:\Program Files\nodejs\node.exe` works; the
   stop hook and the crap gate run.
2. **Test gate:** the root `vitest.config.ts` becomes a vitest `projects`
   config over each package's own config - `packages/domain`,
   `packages/db` (its Postgres global setup), `tools/migrate`, and
   `apps/web`'s component config - with one coverage run and the kit's
   thresholds over `sourceGlobs`. The root moves to vitest 5.0.2 (the
   packages' version; `@stryker-mutator/vitest-runner` 10 accepts vitest
   2 and later) with `@vitest/coverage-v8` 5.0.2. Out of the gate, as
   black-box suites that `ci.yml` already runs: `apps/web`'s feature, smoke
   and E2E suites, and the reader's end-to-end tests
   (`tools/migrate/test/reader*.test.ts`, which need Docker images and
   secrets). Each exclusion is named in the config with its reason.
3. **Typecheck gate:** every package is typechecked with the kit's strict
   flags on its own settings: a `tsconfig.strict.json` per package extends
   that package's `tsconfig.json` and the kit's flags, and the gate runs
   them all (`tsc -b` over the four, or one `tsc -p` each). The root project
   goes.
4. **Deadcode gate:** `knip.json` moves to `workspaces`, one per package,
   with each package's real entries (its `index`, `testing`, `bin`, Next's
   app files, configs).
5. **Architecture gate:** dependency-cruiser scans every package's `src`
   (`apps/*/src`, `packages/*/src`, `tools/*/src`), resolving through the
   workspace, with the kit's rules plus the repo's layering (decision 5:
   domain imports only zod; db never imports web; web reaches the database
   only through `@sportbet/db`, never `/testing` outside tests; migrate ->
   db -> domain, nothing imports migrate) - the same rules lint holds,
   proved a second way.
6. **Mutation:** `stryker.config.mjs` runs the vitest projects; a dry run
   on one changed domain file proves it.
7. **Measure:** run every gate and report the real numbers: lint with the
   strict rules on (errors per rule and file), typecheck errors per
   package, coverage per package and in total, the CRAP list, knip's
   findings, the architecture findings, and a full mutation score.

## Phase 2 - fix the code (backend-dev, web-dev; each in its own folders)

From Phase 1's numbers, test first, no behaviour change:

- The strict lint rules switched on in `eslint.config.mjs` (#25's block),
  and every error fixed by restructuring, never suppressed: long and
  complex functions split into named steps (e.g. `tools/migrate/src/map.ts`'s
  892-line `mapSportbet`), explicit boundary types added, parameter lists
  turned into objects.
- The 4 `eslint-disable` markers removed by fixing what they excused.
- Strict typecheck errors fixed.
- Coverage brought to the thresholds where it falls short, by tests of
  behaviour, through modules' interfaces.
- The CRAP list cleared (tests or smaller functions); a baseline file only
  if the owner rules one.
- knip's findings: unused exports and files deleted or wired up.

## Phase 3 - CI

- `quality.yml`'s triggers switched on: push to `main` and pull requests;
  its `check` job gets the Postgres it needs (the db suite's own Docker
  setup, as `ci.yml`'s `test:db`).
- Mutation (owner, 2026-10-08): changed code only, at the kit's 60 % -
  locally in the stop hook and in CI on pull requests. The nightly full run
  stays off and is run by hand to report the score until it reaches 50 %;
  raising it and switching the nightly run on is #26. No threshold is
  lowered.
- `ci.yml` unchanged except that `pnpm lint` now carries the strict rules.

## Done means

`node quality/gate.mjs check` passes locally (Windows) and in CI on a push;
`quality.yml` runs on push and pull request, green (the nightly run is
#26); every
configuration change is listed on #25 and none weakens a threshold, rule or
marker; `ci.yml` stays green, staging deploys as before.
