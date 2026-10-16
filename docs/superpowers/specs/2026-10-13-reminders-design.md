# Slice 16: mail templates, prediction reminders and the scheduler

A20 and A22 of `docs/phase-2-inventory.md` (#33): the prediction reminder
mail, the run that sends it every 15 minutes, the reminder setting, and
the unsubscribe confirm page with RFC 8058's one-click header. Euroleague
only (decision 11).

Binding: decisions 5, 8, 10, 12 and 13; R-7, R-25, R-97 and R-98
(`docs/owner-rulings.md`); the lead decisions of slice 16 in
`docs/superpowers/specs/2026-10-09-slices-10-18-plan.md`; the rules in
`CLAUDE.md` (the domain decides, sealed values bound to their purpose,
route handlers answering a real 303, Laravel's flash texts, tokens,
Lithuanian text in components, the mail transport per `SPORTBET_ENV`).

## The reference

sportbet at **3eb95e7**:
`app/Console/Commands/SendPredictionReminders.php` (run 47-148, candidates
160-185, reminder time 192-205), `app/Mail/PredictionReminder.php`
(subject 33-52, unsubscribe link 55-66),
`resources/views/emails/prediction-reminder.blade.php`,
`routes/console.php` (11-23), `routes/web.php` (251-253),
`app/Http/Controllers/UserProfileController.php` (`unsubscribe` 208-213),
`database/migrations/2026_06_19_000000_add_reminder_fields.php`,
`CONTEXT.md` > Reminder (line 80).

What sportbet does, in short:

- **The setting** is `user_settings.receive_reminders`, default `false`.
  Whether a game was reminded is per player, on the prediction row
  (`prediction_results.reminded_at`, issue 230).
- **The run** (`reminders:send`, every 15 minutes, `withoutOverlapping(30)`
  on the database cache store) reads, for every opted-in player with an
  email, the prediction rows that are unreminded, open by `GameLock`
  (tip-off not reached, no result), kicking off within 48 hours, and
  unanswered (home **or** away is null: a half-typed row counts as
  unanswered), earliest first (`game_date`, then id). It reads every
  tournament's rows; it does not look at `user_settings.active`.
- **Per player** the trigger is the earliest such game. Its reminder time,
  in Vilnius wall time: a tip-off at or after 22:00 is reminded at 21:00
  that day; one before 08:00 at 21:00 the day before; any other an hour
  before. Before that time the player is skipped. Once it is reached, one
  mail lists every candidate game on the trigger's Vilnius calendar day,
  by tip-off then id; a later day waits for its own trigger.
- **After a send** that player's listed rows get `reminded_at = now`. A
  failed send marks nothing, logs the error (never the mail body: the link
  is a bearer token) and goes on with the next player; a missing Resend key
  logs `critical` and stops the run. A deleted account is skipped.
- **The mail:** subject "Prognozė: {home} vs {away} - {HH:mm} LT" for one
  game, "Prognozės: {n} rungt. {Y-m-d}, pirmosios {HH:mm} LT" for more
  (Vilnius time of the first). Body: the code-mail frame, heading
  "Nepamirškite prognozuoti!", lead "Šioms rungtynėms dar neturite spėjimo
  - pateikite jį iki pradžios.", one card per game (home "vs" away, the
  Vilnius "Y-m-d H:i LT", a "Prognozuoti" button to `/prediction/game/{id}`),
  and the footer link "Atsisakyti priminimų".
- **Unsubscribe:** `GET /profile/notifications/unsubscribe/{user}` behind
  Laravel's `signed` middleware (a signature with no expiry). Opening it
  turns the setting off and redirects home with the info flash
  "Pranešimai išjungti sėkmingai.". No header, no confirm.

## Rulings applied

- **R-97.** One protected route sends the reminders: `POST
  /api/cron/reminders`. On staging a GitHub Actions schedule calls it every
  15 minutes; in production a systemd timer on the Oracle host does. A
  database lease stops two runs overlapping. No paid plan (Vercel Hobby's
  cron runs only daily, decision 12).
- **R-98.** The mail's link opens a confirm page; the setting changes only
  on its button. The mail also carries `List-Unsubscribe` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), whose
  POST turns the setting off with no page.

## Lead decisions applied

- **Planning decisions (2026-10-13).**
  1. Mail text lives in `apps/web` (decision 13): subject, heading, lead and
     button are written in `reminder-mail.ts`; the domain hands over games and
     instants only.
  2. The run reads the clock once at its start (`server/clock.ts`); the marks
     use the database's own `now()`.
  3. One migration for the two columns and `job_leases`; nothing backfills
     (`receive_reminders` defaults false, `reminded_at` null).
  4. The probe game is staging-only seed data, re-dated only while it has no
     result; its predictions are left as they are.
- **Settled while building 16 (2026-10-16).** A moved game's `reminded_at` is
  cleared by the schedule import (`moveGames`), sportbet's rule from issue 283.
  The staging seed opts an account in only once (when the probe is first
  created), so a deploy never undoes an unsubscribe; the probe game is created
  only when `SPORTBET_ENV` is staging. The cron route answers
  `{sent, refused, failed, deferred}`: a run stops starting sends after 40 s and
  spaces them 500 ms apart, the rest wait for the next run. The invalid-link
  view reuses the guest rail's "Prisijungti" label; the unsubscribe page sets
  `referrer: no-referrer` and `noindex`. The link has no expiry (sportbet's has
  none). `CRON_SECRET` is created by CI for staging only when missing, because
  Vercel cannot be read back to compare values. The mail files carry inline
  colours, so `token-guard.test.ts` exempts exactly `code-mail.ts`,
  `mail-frame.ts` and `reminder-mail.ts` and asserts their union holds only the
  listed colours.

- Timing as sportbet (above); one mail per player per Vilnius day; email
  only; reminders default off; reminders run on staging too, where the
  allow-list mails only the owner; daylight-saving days are tested.

## Decisions taken in this spec

1. **The candidates are every tournament's rows,** as sportbet: one mail
   may list games of two tournaments on one day. An inactive player (R-7)
   is still reminded, as sportbet (it never reads `active`).
2. **"Open" is the domain's `Game.isOpenAt`,** the rule a prediction save
   uses, so a reminded game is always one the player can still predict.
3. **The lease is a row, not an advisory lock.** Staging's app connects
   through Neon's pooler in transaction mode, where a session advisory lock
   is not held; a transaction-scoped one would have to span every mail, and
   then the marks commit only at the end, so a crash re-sends everything.
   A `job_leases` row (`job`, `held_until`, `run_id`) is taken with one
   upsert that succeeds only when the old lease has expired, for 30 minutes
   as sportbet's `withoutOverlapping(30)`, and released at the end of the
   run by its `run_id`. A crashed run frees the job 30 minutes later.
4. **Marks are written per player, right after the send,** as sportbet,
   so a crash re-sends at most the one mail in flight.
5. **A mail the staging allow-list refuses is marked reminded.** Otherwise
   every seeded fake player is retried and logged every 15 minutes.
6. **A delivery refused for the key (Resend 401 or 403) stops the run,**
   logged `critical` without the address, the port of `ApiKeyIsMissing`
   (a missing key cannot reach the run: `env.ts` refuses to start). A 429
   also stops it (the next run retries). Any other failure skips that
   player, as sportbet. Sends are sequential, at most two a second
   (Resend's default limit).
7. **The route's protection** is `Authorization: Bearer <CRON_SECRET>`
   (Vercel's own convention, so a Vercel cron could call it unchanged),
   compared in constant time over SHA-256 digests. `CRON_SECRET` is at
   least 32 characters and required wherever `SPORTBET_ENV` is set; without
   it the route answers 503 and never runs. A wrong or missing header
   answers 401 with no body detail. Only POST; the route is outside
   `proxy.ts`'s matcher (it needs no session or flash), like `api/health`.
   It answers 200 `{ sent, refused, failed }`, or `{ skipped: "running" }`
   when the lease is held - counts only, never an address.
8. **The unsubscribe link keeps sportbet's path,**
   `/profile/notifications/unsubscribe/{user}?signature=...`, where the
   signature is `seal('reminders-unsubscribe', { player }, AUTH_SECRET)`
   (`server/sealed.ts`): bound to its purpose and the player, with no
   expiry, as sportbet's. A link that does not open (forged, another
   player's id, or one of sportbet's own Laravel signatures from before the
   switch-over) shows "Nuoroda nebegalioja." with a link to sign in, and
   changes nothing (see open question 3).
9. **The confirm page** (GET, public, no session needed) shows "Atsisakyti
   priminimų?", the line "Daugiau nebegausite priminimų apie neatliktus
   spėjimus." and a button "Atsisakyti". The button posts to
   `/profile/notifications/unsubscribe/{user}/confirm?signature=...`, a
   route handler that turns the setting off and answers 303 to `/` with
   sportbet's flash "Pranešimai išjungti sėkmingai." (new flash kind
   `reminders-off`). The `List-Unsubscribe` URL is the same handler: a
   POST whose body is `List-Unsubscribe=One-Click` answers 200 with no
   redirect. The handler skips the same-origin check, since the signature
   is the authority and mail providers post without an Origin; it is not
   rate limited beyond the signature. Turning off an already-off setting
   succeeds the same way.
10. **Links need the site's address,** so a new `APP_URL` (an origin, no
    path) is required wherever `SPORTBET_ENV` is set: staging's verified
    `*.vercel.app` domain (the deploy job writes it to the Vercel project,
    as it does `AUTH_SECRET`), production `https://sportbet.lt`.
11. **Migrated players keep their choice.** The reader reads
    `user_settings.receive_reminders` and `prediction_results.reminded_at`,
    so nobody is opted in or out by the switch-over, and a game reminded
    by sportbet in its last hours is not reminded again.
12. **Team names are HTML-escaped** in the mail (an admin types them).
    The colours are the template's own, inline, as `code-mail.ts`;
    `token-guard.test.ts` allows `reminder-mail.ts` too. The frame both
    mails share moves to `mail-frame.ts`.

## Design

### Domain (`packages/domain/src/reminder/`)

- `reminder-time.ts`: `reminderTimeOf(tipOff: Instant): Instant`, the port
  of `computeReminderTime` in Vilnius wall time. The "an hour before" branch
  only applies from 08:00 to 21:59, and Vilnius changes clocks at 03:00 and
  04:00, so an hour of elapsed time and of wall time never differ there;
  the 21:00 branches are set in wall time on the right calendar day.
- `due-reminders.ts`: `dueReminders(candidates, now)`, given each player's
  `ReminderCandidate`s (player, game, tip-off), returns one
  `DueReminder { player, games }` per player whose earliest candidate's
  reminder time has been reached, listing that Vilnius day's candidates
  (`vilniusDay`) by tip-off then game id. Pure; refuses nothing (the rows
  come parsed from the database).
- `REMINDER_HORIZON_HOURS = 48`.

### Database (`packages/db`)

- Schema (one migration, `--name reminders`):
  `player_settings.receive_reminders boolean not null default false`;
  `match_predictions.reminded_at timestamptz` (null);
  `job_leases (job text primary key, held_until timestamptz not null,
  run_id uuid not null)`. No new CHECK.
- `src/reminder/candidates.ts`: `loadReminderCandidates(db, { now })`:
  opted-in players' rows with `reminded_at` null and home or away null,
  joined to their games, open at `now` (`Game.isOpenAt` decides on the
  loaded games; SQL narrows to `tip_off > now` and `< now + 48 h`, no
  result), parsed with the domain schema.
- `src/reminder/mark.ts`: `markReminded(db, { player, games })`, at the
  database's clock; touches only `reminded_at`.
- `src/reminder/recipients.ts`: `loadReminderRecipients(db, players)`:
  each player's email address and the games' team names and tip-offs;
  a player gone since the candidates were read is absent (sportbet's
  issue 283).
- `src/job/lease.ts`: `takeJobLease(db, job, minutes)` -> `JobLease |
  null`, `releaseJobLease(db, lease)`.
- `src/account/reminders.ts`: `setReceiveReminders(db, { player, on })`,
  the only writer of the setting (slice 17's notifications page uses it
  too).
- `tools/migrate`: the two columns in `READ_COLUMNS` and the mapping; the
  synthetic dump gains an opted-in user and a reminded row.
- Staging seed: the owner's account is opted in, and a probe game (9010)
  is re-dated on every seed run to the next 19:00 Vilnius at least three
  hours ahead, while it has no result, so a deploy is followed by one
  reminder at 18:00 that day or the next.

### Web (`apps/web`)

- `env.ts`: `CRON_SECRET`, `APP_URL`.
- `server/mail/`: `OutgoingMail` gains optional `headers`; `resend.ts` and
  `mailpit.ts` pass them; `mail-frame.ts` (the shared frame);
  `reminder-mail.ts`: `reminderMail(to, games, links)` -> subject, HTML,
  text part and the two headers.
- `server/reminders/unsubscribe-link.ts`: `unsubscribeSignature(player)`,
  `playerOfSignature(id, signature)`.
- `server/reminders/send-reminders.ts`: lease, candidates, `dueReminders`,
  recipients, each mail in turn, mark, release (in `finally`).
- `app/api/cron/reminders/route.ts`: the bearer check, then the use case;
  `maxDuration = 60`.
- `app/profile/notifications/unsubscribe/[user]/page.tsx` loads (checks
  the signature) and returns `UnsubscribeConfirm`; `.../confirm/route.ts`
  the handler. `components/reminders/unsubscribe-confirm.tsx` with its
  component test. `server/flash.ts` and `FlashAlert` gain `reminders-off`.

### Scheduling

- `.github/workflows/reminders.yml`: `schedule: '*/15 * * * *'` and
  `workflow_dispatch`; one job, `concurrency: reminders`, 5-minute timeout,
  finds staging's domain as `ci.yml`'s deploy does (shared script
  `.github/scripts/staging-domain.sh`) and `curl -fsS -X POST -H
  "Authorization: Bearer $CRON_SECRET"`; fails on any non-200. Secret
  `STAGING_CRON_SECRET`. GitHub may start a scheduled run late or skip one
  under load; the next run picks everything up, and staging is fake data.
- `ci.yml` deploy: writes `CRON_SECRET` (from `STAGING_CRON_SECRET`) and
  `APP_URL` to the Vercel project when missing or changed, never printed,
  and adds both to the required list.
- `infra/host/sportbet-reminders.{service,timer}` and
  `infra/host/reminders.sh`: `OnCalendar=*:0/15`, the script posts to
  `https://sportbet.lt/api/cron/reminders` with the secret read from the
  root-only `/etc/sportbet/reminders.env`. Installed at the switch-over
  (decision 7), not now.

## Testing

- Domain: `reminderTimeOf` at 07:59, 08:00, 12:00, 21:59, 22:00, 23:30,
  00:30; on 2027-03-28 (clocks forward) and 2027-10-31 (back) for a 02:30,
  03:30 and 19:00 tip-off; `dueReminders`: before and at the reminder time,
  one mail per player per day, a next-day game waiting, a half-typed row
  as a candidate, two players apart, order by tip-off then id.
- Database: candidates exclude opted-out, reminded, answered, closed
  (started or with a result) and beyond-48 h rows and include half-typed
  ones and other tournaments'; marks touch only the listed rows; the lease
  refuses a second taker, is free after release and after expiry, and
  release by a stale `run_id` does nothing; `setReceiveReminders`.
- Reader: the two columns migrate; the synthetic dump's counts.
- Web: `reminderMail` subjects (one, several), escaping, links, both
  headers, the text part; the run: lease held, refused marked, a failed
  send marks nothing and goes on, 401/429 stop; the route's 401, 503 and
  405; the signature: opens for its player only, refused for another
  purpose.
- Feature: the cron route sends to Mailpit and marks; the confirm page
  for a good and a bad signature; the button's 303 and flash; the
  one-click POST's 200; the setting off after both.
- Components: `UnsubscribeConfirm` (texts, the form's action), the
  invalid-link view, the new flash.
- E2E: open a reminder's link from Mailpit, confirm, see the flash.

## Done means

On staging, after a deploy, the owner receives one reminder for the probe
game at 18:00 Vilnius with sportbet's subject and cards; its "Prognozuoti"
opens the game; "Atsisakyti priminimų" opens the confirm page, the button
turns reminders off with "Pranešimai išjungti sėkmingai.", and no further
reminder arrives; the received mail's headers carry both `List-Unsubscribe`
lines with a valid DKIM signature.
The scheduled workflow is green every 15 minutes, a manual double run
reports `skipped: running` or zero sent, and every sportbet rule above
and R-97 and R-98 has a named test.

## Open questions for the owner

1. CONTEXT.md:80 says "never between 21:00 and 08:00", but
   `SendPredictionReminders.php:200-204` reminds an 08:00-08:59 tip-off
   at 07:00-07:59. Proposed: follow the code (no Euroleague game starts
   then).
2. The slices plan (`2026-10-09-slices-10-18-plan.md:104`) puts the
   unsubscribe confirm page in slice 17. Proposed: build it here, since a
   reminder cannot ship without a working link; slice 17 keeps
   `/profile/notifications`.
3. Links in mails sportbet sent before the switch-over carry Laravel
   signatures (`PredictionReminder.php:60-63`). Proposed: they show
   "Nuoroda nebegalioja." rather than porting sportbet's `APP_KEY`.
