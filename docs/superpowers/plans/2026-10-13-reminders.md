# Slice 16: mail templates, prediction reminders and the scheduler - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-6, web-dev 7-12, devops 13-14, qa and architect review each, the security reviewer reviews tasks 8, 10 and 11 (a bearer secret and an unauthenticated write), only the lead commits.

**Goal:** sportbet's prediction reminders - one mail per opted-in player per Vilnius day, an hour before the day's first unpredicted game - sent by one protected route every 15 minutes, with a confirm page and RFC 8058's one-click unsubscribe (#33, R-97, R-98).

**Architecture:** The domain decides when and what (`reminderTimeOf`, `dueReminders`). `packages/db` reads the candidates, writes the marks and the setting, and holds a `job_leases` row against overlapping runs. `apps/web` has the cron route handler (bearer `CRON_SECRET`), the mail template, the unsubscribe page and its handler. A GitHub Actions schedule calls the route on staging; a systemd timer will in production.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright, GitHub Actions, systemd.

**Spec:** `docs/superpowers/specs/2026-10-13-reminders-design.md`. Rulings R-97, R-98.

## Decisions taken while planning (refine the spec; record them in it in Task 15)

1. **Mail text lives in `apps/web`** (decision 13): the subject, heading, lead and button are written in `reminder-mail.ts`, not the domain. The domain hands over games and instants only.
2. **The run's clock is the database's** (`databaseClock`), read once at the start; the marks use the database's own `now()`.
3. **One migration** for the two columns and `job_leases`; nothing backfills (`receive_reminders` defaults false, `reminded_at` null).
4. **The probe game is staging-only seed data** and is re-dated only while it has no result; its predictions are left as they are.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/reminder/reminder-time.ts`, `.test.ts` (create) | `reminderTimeOf` |
| `packages/domain/src/reminder/due-reminders.ts`, `.test.ts` (create) | `ReminderCandidate`, `DueReminder`, `dueReminders`, `REMINDER_HORIZON_HOURS` |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/account/schema.ts`, `prediction/schema.ts` (modify) | `receive_reminders`, `reminded_at` |
| `packages/db/src/job/schema.ts`, `lease.ts` (create) | `job_leases`, `takeJobLease`, `releaseJobLease` |
| `packages/db/src/reminder/candidates.ts`, `recipients.ts`, `mark.ts` (create) | the run's reads and marks |
| `packages/db/src/account/reminders.ts` (create) | `setReceiveReminders` |
| `packages/db/src/schema.ts`, `index.ts` (modify) | tables, exports |
| `packages/db/migrations/*_reminders.sql` (generate) | the migration |
| `packages/db/test/reminder-*.test.ts`, `job-lease.test.ts` (create) | db tests |
| `packages/db/src/seed/staging.ts`, `test/seed.test.ts` (modify) | owner opted in, probe game 9010 |
| `tools/migrate/src/read-columns.ts`, `mapping/accounts.ts`, the predictions mapping, `test/fixtures/*` (modify) | the two columns |
| `apps/web/src/env.ts`, `env.test.ts` (modify) | `CRON_SECRET`, `APP_URL` |
| `apps/web/src/server/mail/mail.ts`, `resend.ts`, `mailpit.ts`, `mailer.test.ts` (modify) | `headers` |
| `apps/web/src/server/mail/mail-frame.ts`, `code-mail.ts` (create, modify) | the shared frame |
| `apps/web/src/server/mail/reminder-mail.ts`, `.test.ts` (create) | `reminderMail` |
| `apps/web/src/token-guard.test.ts` (modify) | inbox files: `mail-frame.ts`, `reminder-mail.ts` |
| `apps/web/src/server/reminders/unsubscribe-link.ts`, `send-reminders.ts` (+ tests) (create) | signature, the run |
| `apps/web/src/app/api/cron/reminders/route.ts` (create) | the route |
| `apps/web/src/proxy.ts` (modify) | matcher skips `api/cron` |
| `apps/web/src/app/profile/notifications/unsubscribe/[user]/page.tsx`, `confirm/route.ts` (create) | confirm page, handler |
| `apps/web/src/components/reminders/unsubscribe-confirm.tsx`, `.test.tsx` (create) | the page's markup |
| `apps/web/src/server/flash.ts`, the `FlashAlert` component (modify) | `reminders-off` |
| `apps/web/tests/feature/reminders.test.ts` (create) | route and pages |
| `apps/web/e2e/reminders.spec.ts` (create) | the unsubscribe journey |
| `.github/workflows/reminders.yml`, `.github/scripts/staging-domain.sh` (create) | the schedule |
| `.github/workflows/ci.yml` (modify) | `CRON_SECRET`, `APP_URL` on Vercel |
| `infra/host/sportbet-reminders.service`, `.timer`, `reminders.sh` (create) | production timer, installed at switch-over |
| `CLAUDE.md`, the spec, `docs/decisions.md` (modify) | the write paths, the secret |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>` (builds the app); e2e: `pnpm test:e2e`.

---

### Task 1: `reminderTimeOf`

**Files:**
- Create: `packages/domain/src/reminder/reminder-time.ts`, `reminder-time.test.ts`

Port of `SendPredictionReminders::computeReminderTime` (192-205), in Vilnius wall time.

- [ ] **Step 1: Tests first.** Named after the rule: `a tip-off at 12:00 is reminded at 11:00`, `21:59 at 20:59`, `22:00 at 21:00 that day`, `23:30 at 21:00 that day`, `00:30 at 21:00 the day before`, `07:59 at 21:00 the day before`, `08:00 at 07:00` (sportbet's code; open question 1), and on 2027-03-28 and 2027-10-31: `02:30` and `03:30` at 21:00 the day before (the right UTC instant for that evening's offset) and `19:00` at `18:00`.
- [ ] **Step 2:** Run, watch them fail (module missing).
- [ ] **Step 3: Implement** with the domain's Vilnius helpers (`vilniusDay` and its siblings); no new time library. Document why an hour of elapsed time equals an hour of wall time on the "hour before" branch.
- [ ] **Step 4:** `pnpm --filter @sportbet/domain test -- reminder-time`. PASS.
- [ ] Commit - `feat(domain): reminderTimeOf - an hour before, 21:00 for late and early tip-offs, as sportbet (#33)`

### Task 2: `dueReminders`

**Files:**
- Create: `packages/domain/src/reminder/due-reminders.ts`, `due-reminders.test.ts`; modify `packages/domain/src/index.ts`

```ts
export interface ReminderCandidate {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly tipOff: Instant;
}
export interface DueReminder {
  readonly player: PlayerId;
  /** That Vilnius day's candidates, by tip-off then game id. */
  readonly games: readonly ReminderCandidate[];
}
export const REMINDER_HORIZON_HOURS = 48;
export function dueReminders(candidates: readonly ReminderCandidate[], now: Instant): readonly DueReminder[];
```

- [ ] **Step 1: Tests:** nothing before the trigger's time; due at exactly the time; one entry per player listing the day's games only; a next-day game waits for its own trigger; candidates out of order sorted by tip-off then id; two players independent.
- [ ] **Step 2-4:** fail, implement, `pnpm --filter @sportbet/domain test`. PASS.
- [ ] Commit - `feat(domain): dueReminders - one mail per player per Vilnius day (#33)`

### Task 3: schema and migration

**Files:**
- Modify: `packages/db/src/account/schema.ts`, `prediction/schema.ts`, `schema.ts`; create `packages/db/src/job/schema.ts`

- [ ] **Step 1:** Add `receiveReminders: boolean('receive_reminders').notNull().default(false)` to `playerSettings` (doc: sportbet's `user_settings.receive_reminders`, default off), `remindedAt: timestamp('reminded_at', { withTimezone: true, mode: 'date' })` to `matchPredictions` (doc: issue 230, per player), and `jobLeases` (`job` text pk, `held_until` timestamptz not null, `run_id` uuid not null).
- [ ] **Step 2:** `pnpm --filter @sportbet/db db:generate --name reminders`; review the SQL (two `ADD COLUMN`s, one `CREATE TABLE`, nothing else).
- [ ] **Step 3:** `pnpm --filter @sportbet/db test -- invariant-checks schema`. PASS (no new CHECK).
- [ ] Commit - `feat(db): the reminder setting, reminded_at and job_leases (#33)`

### Task 4: lease, candidates, recipients, marks, setting

**Files:**
- Create: `packages/db/src/job/lease.ts`, `src/reminder/{candidates,recipients,mark}.ts`, `src/account/reminders.ts`, tests `packages/db/test/job-lease.test.ts`, `reminder-candidates.test.ts`, `reminder-mark.test.ts`; modify `src/index.ts`

- [ ] **Step 1: Tests** (spec > Testing > Database), with `useTestDatabase`. The lease: second taker gets null, free after release, free after `held_until` passes (insert an expired row), stale `run_id` release is a no-op. Candidates: opted-out, reminded, answered, started, with a result, beyond 48 h excluded; half-typed and another tournament's included. Marks: only the listed rows of that player. Recipients: a deleted player absent; team names and tip-offs present. `setReceiveReminders` on and off.
- [ ] **Step 2:** fail.
- [ ] **Step 3: Implement.** `takeJobLease`: `insert ... on conflict (job) do update set held_until = now() + make_interval(mins => $m), run_id = $id where job_leases.held_until < now() returning run_id`. Candidates: SQL narrows, then the loaded `Game` decides `isOpenAt(now)`; parse every row with the domain schema. `markReminded` sets `reminded_at = now()`.
- [ ] **Step 4:** `pnpm --filter @sportbet/db test`. PASS.
- [ ] Commit - `feat(db): reminder candidates, marks, the setting and a job lease (#33)`

### Task 5: the reader carries both columns

**Files:**
- Modify: `tools/migrate/src/read-columns.ts` (comment and `user_settings`, `prediction_results`), `mapping/accounts.ts`, the predictions mapping, `test/fixtures/synthetic-dump.ts`, `test/map.test.ts`

- [ ] **Step 1:** Tests: an opted-in user maps to `receive_reminders = true`; a reminded row keeps `reminded_at`; a user whose settings rows disagree on the new column is refused as today.
- [ ] **Step 2-4:** fail, implement, `pnpm --filter @sportbet/migrate test`. PASS.
- [ ] Commit - `feat(migrate): the reminder setting and reminded_at migrate (#33)`

### Task 6: staging seed

**Files:**
- Modify: `packages/db/src/seed/staging.ts`, `packages/db/test/seed.test.ts`

- [ ] **Step 1:** Tests: the owner's account is opted in; game 9010 is dated the next 19:00 Vilnius at least three hours after the seed's clock (inject the clock); a second seed run moves it forward; with a result it is left alone. Check the hub's and `predictions.spec.ts`'s counts.
- [ ] **Step 2-4:** fail, implement, `pnpm --filter @sportbet/db test -- seed`. PASS.
- [ ] Commit - `feat(db): staging's owner is reminded, with a probe game each deploy (#33)`

### Task 7: env

**Files:**
- Modify: `apps/web/src/env.ts`, `env.test.ts`, `.env.example` if present

- [ ] **Step 1:** Tests: `CRON_SECRET` shorter than 32 refused; both required when `SPORTBET_ENV` is set, optional locally; `APP_URL` must be an `https:` origin with no path (`http://localhost` allowed when `SPORTBET_ENV` is unset).
- [ ] **Step 2-4:** fail, implement, `pnpm --filter @sportbet/web test -- env`. PASS.
- [ ] Commit - `feat(web): CRON_SECRET and APP_URL (#33)`

### Task 8: the reminder mail

**Files:**
- Create: `apps/web/src/server/mail/mail-frame.ts`, `reminder-mail.ts`, `reminder-mail.test.ts`; modify `mail.ts`, `resend.ts`, `mailpit.ts`, `code-mail.ts`, `mailer.test.ts`, `token-guard.test.ts`

- [ ] **Step 1: Tests:** both subjects exactly as sportbet (one game, several; Vilnius time); cards in order with "Y-m-d H:i LT" and `${APP_URL}/prediction/game/{id}`; a team name with `<` escaped; the footer link and the `List-Unsubscribe: <url>` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers; the text part lists each game and both links. The adapters send `headers` (Resend: `headers`; Mailpit: `Headers`). The code mails' HTML is unchanged byte for byte.
- [ ] **Step 2-4:** fail, implement, `pnpm --filter @sportbet/web test -- mail token-guard`. PASS.
- [ ] Commit - `feat(web): sportbet's reminder mail, with RFC 8058's headers (#33, R-98)`

### Task 9: the unsubscribe signature

**Files:**
- Create: `apps/web/src/server/reminders/unsubscribe-link.ts`, `.test.ts`

- [ ] **Step 1: Tests:** a signature opens for its player only; one sealed for another purpose (a flash) does not; a tampered or Laravel-shaped signature does not; the URL is `${APP_URL}/profile/notifications/unsubscribe/{id}?signature=...` and the one-click URL adds `/confirm`.
- [ ] **Step 2-4:** fail, implement on `seal`/`unseal` with purpose `reminders-unsubscribe`, PASS.
- [ ] Commit - `feat(web): a signed unsubscribe link per player (#33)`

### Task 10: the run and the cron route

**Files:**
- Create: `apps/web/src/server/reminders/send-reminders.ts`, `.test.ts`, `apps/web/src/app/api/cron/reminders/route.ts`; modify `apps/web/src/proxy.ts`

- [ ] **Step 1: Tests** (fakes for the db functions and the mailer): lease held -> `{ skipped: 'running' }`, nothing read; each due player mailed then marked; `refused` marked; a `MailDeliveryError` 500 marks nothing and goes on; 401, 403 and 429 stop the run and log once, without an address; the lease released in every case; sends spaced at least 500 ms (injected sleep). The route: no header or a wrong one 401; `CRON_SECRET` unset 503; GET 405; a good one 200 with counts.
- [ ] **Step 2:** fail.
- [ ] **Step 3: Implement.** Constant-time compare of SHA-256 digests (`timingSafeEqual`). `export const maxDuration = 60; export const dynamic = 'force-dynamic'`. Matcher: `'/((?!_next/static|_next/image|img/|favicon|api/health|api/cron).*)'`.
- [ ] **Step 4:** `pnpm --filter @sportbet/web test`. PASS.
- [ ] Commit - `feat(web): POST /api/cron/reminders sends the due reminders under a lease (#33, R-97)`

### Task 11: the confirm page and one-click

**Files:**
- Create: `apps/web/src/app/profile/notifications/unsubscribe/[user]/page.tsx`, `[user]/confirm/route.ts`, `apps/web/src/components/reminders/unsubscribe-confirm.tsx`, `.test.tsx`; modify `server/flash.ts`, the `FlashAlert` component and its test

- [ ] **Step 1: Tests:** the component: "Atsisakyti priminimų?", the line, the button "Atsisakyti" posting to the confirm URL with the signature; the invalid view "Nuoroda nebegalioja." with a link to `/login`. The flash `reminders-off` reads "Pranešimai išjungti sėkmingai.".
- [ ] **Step 2-4:** fail, implement (the page parses `user` with `idFromText`, checks the signature, returns one component; the handler: bad signature 403 and nothing changed; body `List-Unsubscribe=One-Click` 200; otherwise 303 to `/` with the flash), PASS. The handler does not call `isSameOrigin`; say why in a comment.
- [ ] Commit - `feat(web): the unsubscribe confirm page and RFC 8058 one-click (#33, R-98)`

### Task 12: feature and E2E

**Files:**
- Create: `apps/web/tests/feature/reminders.test.ts`, `apps/web/e2e/reminders.spec.ts`

- [ ] **Step 1:** Feature (spec > Testing > Feature): a game inserted 30 minutes ahead, an opted-in player, the route called with the test secret: one mail in Mailpit with both headers, the row marked, a second call sends nothing. The page for a good and a bad signature; the 303 and flash; the one-click 200; the setting off.
- [ ] **Step 2:** E2E at 390 and 1280: trigger the route, open the mail's link from Mailpit, confirm, see the flash.
- [ ] **Step 3:** `pnpm --filter @sportbet/web test:feature -- reminders && pnpm test:e2e`. PASS.
- [ ] Commit - `test(web): reminders end to end (#33)`

### Task 13: the staging schedule

**Files:**
- Create: `.github/workflows/reminders.yml`, `.github/scripts/staging-domain.sh`; modify `.github/workflows/ci.yml`

- [ ] **Step 1:** Move the domain lookup of `ci.yml`'s Deploy step into `staging-domain.sh` (prints `https://<domain>`), and call it there.
- [ ] **Step 2:** In "Staging's sign-in settings" (rename "Staging's settings"): when `STAGING_CRON_SECRET` is empty fail with a `::error::` naming the owner step; write `CRON_SECRET` and `APP_URL` to the Vercel project when missing (`vercel env add ... --sensitive`, never echoed; `APP_URL` from the script); add both to the required list.
- [ ] **Step 3:** `reminders.yml`: `on: schedule: - cron: '*/15 * * * *'` and `workflow_dispatch`; `permissions: {}`; `concurrency: { group: reminders, cancel-in-progress: false }`; `timeout-minutes: 5`; steps: checkout (scripts only), domain, `curl -fsS --max-time 90 -X POST -H "Authorization: Bearer $CRON_SECRET" "$url/api/cron/reminders"`, print the JSON counts. A header comment cites R-97 and decision 12.
- [ ] **Step 4:** `actionlint` (or the repo's workflow lint) on both files. PASS.
- [ ] Commit - `ci: a 15-minute schedule calls staging's reminder route (#33, R-97)`

### Task 14: the production timer (installed at switch-over)

**Files:**
- Create: `infra/host/sportbet-reminders.service`, `sportbet-reminders.timer`, `reminders.sh`; modify `infra/host/bootstrap.sh` only to copy the units, disabled

- [ ] **Step 1:** Units modelled on `sportbet-backup.*`: `Type=oneshot`, `TimeoutStartSec=5min`, `EnvironmentFile=/etc/sportbet/reminders.env`; timer `OnCalendar=*:0/15`, `Persistent=false` (a missed tick is picked up by the next one). `reminders.sh` posts with `curl -fsS` to `$REMINDERS_URL` and exits non-zero on failure (visible in `systemctl --failed`).
- [ ] **Step 2:** `shellcheck infra/host/reminders.sh`; `systemd-analyze verify` on the units where available. PASS.
- [ ] Commit - `infra: the production reminder timer, off until switch-over (#33, R-97)`

### Task 15: docs

- [ ] `CLAUDE.md`: reminders decided by `dueReminders`, read and marked only through `packages/db/src/reminder/`, the setting written only by `setReceiveReminders`, the cron route the only sender, protected by `CRON_SECRET`, `job_leases` against overlap; the unsubscribe signature's purpose. The spec: these planning decisions and the owner's answers. `docs/decisions.md` decision 12's "Limits accepted": scheduled jobs are GitHub Actions on staging (now built).
- [ ] Commit - `docs: slice 16 in CLAUDE.md and the spec (#33)`

---

## Owner steps

1. Make the staging secret: in a terminal run `openssl rand -base64 48` and copy the line it prints.
2. In GitHub, `tomyka/sportbet_new` > Settings > Secrets and variables > Actions > New repository secret: name `STAGING_CRON_SECRET`, value the line from step 1. (CI copies it into Vercel itself.)
3. After Task 13 lands and staging deploys: Actions > "reminders" > Run workflow, and report whether the run is green.
4. On the day of that deploy, at 18:00 Vilnius (or the next day if the deploy was after 16:00), check the owner's inbox for the probe game's reminder; open "Atsisakyti priminimų", press "Atsisakyti", and report what the page shows.
5. At the switch-over (later, with devops): approve writing the production secret to `/etc/sportbet/reminders.env` on the production host and enabling `sportbet-reminders.timer`.
