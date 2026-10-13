# Slice 17: the profile, notifications and account deletion

A15 of `docs/phase-2-inventory.md` (#34): the profile page `/userProfile`,
its account form with the confirmed address change (R-24), the reminder
switch `/profile/notifications`, the theme choice, and the self-service
account deletion (`/profile/deletion-code`, `DELETE /profile`) with its
league hand-over (R-25). Security-sensitive: every task marked **[SR]** in
the plan goes to the security reviewer.

Binding: decisions 5, 6 and 13; R-22, R-24, R-25, R-44, R-45, R-69, R-87,
R-99 (`docs/owner-rulings.md`); slice 12's leagues
(`2026-10-12-leagues-design.md`: `league_members.joined_at`, `owner_id`
`SET NULL`, the composite `selected_league_id` FK) and
slice 16's reminders (`2026-10-13-reminders-design.md`:
`player_settings.receive_reminders`, `setReceiveReminders`, the unsubscribe
confirm page, all built there); the rules in `CLAUDE.md` (an address is an
identity, cookies and sessions only through their modules, the one code
check, route handlers answering a real 303, the lock order, guarded pages,
tokens, Lithuanian text in components).

## The reference

sportbet at **5aa8465**: `app/Http/Controllers/UserProfileController.php`
(page 26-31, form 34-107, address confirm 115-137, cancel 140-145,
deletion code 153-163, destroy 177-195, notifications 198-206,
unsubscribe 208-213), `app/Services/ProfileService.php` (request change
86-129, confirm 143-193, cancel 196-200, deletion code 214-252, verify
272-281, `deleteAccount` 313-348), `app/Providers/AppServiceProvider.php`
(throttles 172-204), `resources/views/userProfile.blade.php`,
`resources/views/emails/{account-deletion-code,email-change-code,email-changed-notice}.blade.php`,
`routes/web.php` (33-45, 85, 88-108, 252-254); sportbet `CLAUDE.md` >
Security (589-603: "anything that can make a user's `users.email` wrong,
unreachable, or ambiguous is an account-lockout bug"; user deletion is a
sensitive surface).

What sportbet does, in short:

- **The page** (`/userProfile`, `auth`): a header card (initials of name
  and surname, "name surname", "@username • email", an "Admin" badge for
  any admin level, "Narys nuo" and the account's creation date on wide
  screens); "Paskyros informacija" with one form (username, name, surname,
  email; "Išsaugoti"), its errors listed above it; while an address change
  waits, "Laukiama patvirtinimo adresui :email. Kol kodo neįvesite, galioja
  senasis adresas.", a code box ("Patvirtinimo kodas", "Patvirtinti") and
  "Atšaukti keitimą"; "Prisijungimas" (no passwords; Google or a one-time
  code; "Todėl svarbu, kad aukščiau nurodytas el. pašto adresas būtų
  teisingas - kodas siunčiamas būtent į jį."); "Pranešimai" (one checkbox
  "Įjungti priminimus", "Išsaugoti"); "Kalba" (lt / en); "Tema" ("Šviesi" /
  "Tamsi", in the browser); "Pavojaus zona" ("Paskyros ištrynimas yra
  negrįžtamas veiksmas.", a toggle "Ištrinti paskyrą" / "Atšaukti" that
  opens "Visi jūsų duomenys bus ištrinti. Šio veiksmo negalima atšaukti.",
  "Siųsti patvirtinimo kodą", the code box and "Ištrinti paskyrą visam
  laikui"; open after a sent code or a deletion error). One info flash at
  the top.
- **The form** (`POST /userProfile`): username, name, surname required,
  each at most 255; the username unique among other accounts and the
  address unique among other accounts, both as the collation folds. Name
  fields take effect at once. The address is normalized; unchanged, it
  drops any pending change ("Profilis atnaujintas."). Changed: 3 requests
  per 10 minutes per account, refused in the form ("Per daug bandymų.
  Pabandykite po :minutes min."); a code for purpose `email_change` is
  issued for and mailed to the **new** address, and only once it is sent
  is the address parked in `pending_email` ("Patvirtinimo kodas išsiųstas
  į :email. Senasis adresas galioja, kol kodo neįvesite."). A failed send:
  "Nepavyko išsiųsti patvirtinimo kodo. Bandykite vėliau.".
- **Confirm** (`POST /profile/email-change/confirm`, 5 per 10 minutes per
  account, 15 per IP): no pending change "Nėra laukiančio el. pašto
  keitimo."; a wrong, expired or empty code "Neteisingas arba pasibaigęs
  patvirtinimo kodas."; the address taken meanwhile "Šis el. paštas jau
  susietas su kita paskyra."; else the address moves in one transaction,
  then the old address gets a notice (a failed notice is logged and never
  undoes the move): "El. paštas pakeistas. Apie pakeitimą pranešėme
  senuoju adresu.". **Cancel** (`POST /profile/email-change/cancel`):
  "El. pašto keitimas atšauktas.".
- **Deletion code** (`POST /profile/deletion-code`, 3 per 10 minutes per
  account, 10 per IP): a code for purpose `account_deletion` mailed to the
  account's address; "Patvirtinimo kodas išsiųstas į jūsų el. pašto
  adresą." or the failed-send message, in the danger zone.
- **Delete** (`DELETE /profile`, 5 per 10 minutes per account, 15 per IP):
  an empty or wrong code "Neteisingas arba pasibaigęs patvirtinimo kodas."
  in the danger zone; else, in one transaction, the account's sign-in
  audit, prediction audit, survival audit, league memberships, points of
  every kind, settings, predictions of every kind, its address's live codes
  and the account go; then sign-out, a new session and token, and `/`. A
  league it owned is left with no owner (`owner_id` `nullOnDelete`).
- **Notifications** (`POST /profile/notifications`): the checkbox to
  `receive_reminders`; "Pranešimų nustatymai atnaujinti.".
- **Aliases:** Breeze's `GET /profile` and `PATCH /profile` (no view posts
  to the latter), `/userSettings` (deprecated, kept for bookmarks),
  `POST /locale`.

## Rulings applied

- **R-24.** Already sportbet's at 5aa8465 (issue 289): the code goes to the
  new address, the old one is told once the move happened. Kept exactly.
- **R-25.** The account's trail goes with it: `audit_logins`,
  `audit_prediction_games` (both already cascade), and every login code
  for its address or pending address. **Each private league it owned
  passes to its longest-standing other member** (`league_members.joined_at`,
  then the member row's id), who becomes owner and `is_admin` (as
  `transferLeague`, R-23, R-105). Its own points go: `match_points`,
  `standings_points`, `survival_points` and `point_*` rows of every
  `points_source`. New behaviour (sportbet leaves the league ownerless);
  no `RuleSet` field, as it scores nothing.
- **R-69.** A results manager's `audit_results` rows stay; `audit_results.player_id`
  is already `SET NULL`.
- **R-99.** Deleting an account recalculates nothing and changes no other
  player's stored row: `game_odds` stays. Positions, computed on read,
  move up. See open question 1 for what a later recalculation must do.
- **R-22** is not broken by a deletion in a finished tournament: R-25 is
  the later, specific ruling (the player's points go); no other row moves.
- **R-44, R-45.** Deletion ends every session (rows cascade, the cookie is
  cleared through `endSession`); no IP is stored by any of these flows (the
  throttles keep only a hash of their keys, as sign-in's).

## Lead decisions (technical)

- **URLs.** `/userProfile` (the page), `POST /userProfile/save` (the
  form: Next cannot serve a page and a handler at one path, slice 6
  decision 1, as slice 10's saves), `POST /profile/notifications`, `POST
  /profile/email-change/confirm`, `POST /profile/email-change/cancel`,
  `POST /profile/deletion-code`, and `/profile`: GET answers 308 to
  `/userProfile`; POST with `_method=DELETE` (Laravel's method spoofing,
  which the danger-zone form sends) deletes; any other `_method` 405.
  `PATCH /profile`'s alias is not kept (nothing posts to it).
  `/userSettings` answers 308 to `/userProfile`. `/locale` is dropped
  (decision 13; 404).
- **Every write is a route handler answering a real 303** to
  `/userProfile` (to `/` after a deletion), same-origin checked (403
  cross-site), a guest's post 303 to `/`. The outcome rides the sealed
  `__Host-sb_flash`: new kinds `profile-updated`, `email-change-requested
  { email }`, `email-changed`, `email-change-cancelled`,
  `deletion-code-sent`, `notifications-saved`, and `profile-refused
  { bag: 'account' | 'emailChange' | 'userDeletion', errors, values? }`
  for Laravel's error bags with the typed values (`values` only for
  `account`: Laravel's old input). The page reads it with `readFlash()`;
  the shell's alert shows only the info kinds.
- **The form is checked field by field** (`profileFormEntry`, as
  `predictionFormEntry`: Laravel reports every field), in sportbet's rule
  order per field, then uniqueness: the username by `isUsernameTaken`
  over the other accounts (`foldUsername`, the collation's), the address
  by `isEmailRegistered` excluding the account (`email_fold`). Texts
  reuse registration's (the owner's Lithuanian, `server/register/texts.ts`)
  where they exist; two new ones are open question 5.
- **The address change.** A new column `players.pending_email` (nullable,
  `emailInvariant` CHECK as `email`, normalized on write); not unique, as
  in sportbet two accounts may wait for one address. Written only by
  `requestEmailChange` (after the mail is accepted), `confirmEmailChange`
  and `cancelEmailChange` (`packages/db/src/account/email-change.ts`).
  Confirm checks the code through the shared `checkCode` (purpose
  `email_change`, the pending address), then in one transaction locks the
  player row, re-checks `pending_email` is unchanged and the address free
  (`isEmailRegistered` excluding self; a `players_email_folded_unique`
  violation is `taken` too), writes `email`, clears `pending_email`. Then
  the notice to the old address; a failure logged by kind only. A code
  claimed and then `taken` is spent, as in sportbet. Sessions are kept (an
  address change is not a sign-out in sportbet). Production's
  `pending_email` is not read: a change waiting at switch-over is dropped
  with its code (codes are never migrated).
- **The deletion code** reuses sign-in's machinery: `issueLoginCode`
  (voids any earlier one; the code's lifetime and hashing are sign-in's),
  `checkCode` (purpose `account_deletion`, the account's address read off
  the session, never the request). `checkCode` always spends one full hash
  comparison, stricter than sportbet's `verifyDeletionCode`; the answer is
  still the one text. The `CLAUDE.md` sentence "An emailed code is checked
  only through the shared code check" gains these two purposes.
- **Not slice 13's emailed confirmation.** That one confirms an admin's
  action on a separate page; this is sportbet's in-page flow at sportbet's
  URLs, under its own purpose. Both share `issueLoginCode` and `checkCode`.
- **Mails:** `deletionCodeMail`, `emailChangeCodeMail` (both in the
  code-mail frame, sportbet's subject and lines, the TTL minutes) and
  `emailChangedNoticeMail` (no code, no link). Before any code is issued
  the mailer is asked whether it may send (sportbet's
  `mailerWouldLeakCodes`: here the transport for `SPORTBET_ENV`); a refused
  or failed send answers the failed-send text and, for an address change,
  leaves `pending_email` untouched. A failure is logged by kind, never the
  body or an address.
- **Throttles** (domain, beside `codeRequestLimits`):
  `deletionCodeRequestLimits(player, ip)` 10/10 min per IP then 3 per
  account; `deletionVerifyLimits(player, ip)` 15 per IP then 5;
  `emailChangeRequestLimits(player)` 3 per account, counted only on a
  changed address and answered in the form; `emailChangeVerifyLimits(player,
  ip)` 15 per IP then 5. The middleware-shaped ones answer Laravel's 429
  (`laravel-answers.ts`). Every attempt counts, as Laravel's middleware.
- **`deleteAccount(db, { player })`** (`packages/db/src/account/deletion.ts`)
  is the only deleter of an account, for this page and slice 14's admin
  path (sportbet's "one list", ProfileService 296-299). One transaction:
  1. the recalculation lock of every tournament the player is in, in
     tournament id order (`lockTournamentForRecalculation`), so no
     recalculation writes a row for the player mid-deletion;
  2. the `players` row `FOR UPDATE` (after the tournament locks, as a
     recalculation's inserts take `KEY SHARE` on it; a prediction save
     inserting a row waits here, so it cannot deadlock against step 4);
  3. the player's `match_predictions` rows by game id;
  4. `tournament_players` through `lockPlayerStatuses`;
  5. the hand-over: each private league with `owner_id` = player gets the
     heir (`leagueHeir` in the domain: longest-standing other member;
     open questions 2 and 3) as owner and `is_admin`;
  6. deletes in FK order: `tournament_players` (its
     `selected_league_id` FK), points rows of every source, predictions of
     every kind and survival picks, league memberships and invites as
     invitee (cascade), login codes where `email` is the account's address
     or `pending_email` (exact equality), then the `players` row
     (settings, sessions, `audit_logins`, `audit_prediction_games`
     cascade; `audit_results.player_id` set null).
  No recalculation runs (R-99). After commit the use case calls
  `pointsChanged()` (who is listed changed), then `endSession`. The lock
  order paragraph of `CLAUDE.md` gains "an account deletion: every
  tournament lock it needs in id order, then the player row, then the
  player's prediction rows, then `lockPlayerStatuses`".
- **The page reads** `loadProfile(db, player)`: username, name, surname,
  email, pending email, role, `receive_reminders`, created-at (open
  question 4). The "Admin" badge shows for any role but `player`.
- **What is dropped or changed on the page:** "Kalba" (decision 13); the
  "per Google" line of "Prisijungimas" waits for slice 4d's Google sign-in
  (until then the card lists the code alone, so it never promises a way in
  that does not exist). "Tema" writes `localStorage['sb-theme']` and the
  `data-theme` attribute the theme script reads (no server state).
- **Notifications** write only through slice 16's `setReceiveReminders`
  (an absent checkbox is off, as `$request->boolean`); flash
  `notifications-saved`.
- **Access.** `/userProfile` joins `GUARDED_PAGES` as `profile` (bare);
  a guest signs in and returns through `signInAndReturn`. `SHELL_LINKS.profile`
  becomes `PROFILE_PATH`. The unsubscribe pages stay slice 16's.

## Design

### Domain (`packages/domain/src/account/`)

- `profile-form.ts`: `profileFormEntry({ username, name, surname, email })`
  -> `Result<ProfileEntry, ProfileProblems>` (per field: `required`,
  `blank`, `too-long`, `not-an-email`); the address normalized.
- `email-change.ts`: `emailChangeIntent(current, pending, requested)` ->
  `'unchanged' | 'cancel-pending' | { change: EmailAddress }`;
  `EmailChangeRefusal` = `'none' | 'invalid' | 'taken'`.
- `league-heir.ts` (`packages/domain/src/league/`): `leagueHeir(members,
  leaving)` -> the heir or none.
- `profile-throttle.ts`: the four limit functions.
- `login-code.ts`: the comment on `account_deletion` / `email_change`
  becomes "slice 17's".

### Database (`packages/db/src/account/`)

- `schema.ts` (player): `pending_email`, its CHECK in
  `playerInvariantChecks`; migration `profile_pending_email` (plus
  `created_at` if open question 4 says so).
- `profile.ts`: `loadProfile`, `updateProfileNames` (one UPDATE; a
  `players_username_unique` violation is `username-taken`).
- `email-change.ts`: `requestEmailChange` (parks the address),
  `confirmEmailChange`, `cancelEmailChange`.
- `deletion.ts`: `deleteAccount`, as above.

### Web (`apps/web`)

- `app/userProfile/page.tsx` loads and returns `ProfileView`;
  `app/userProfile/save/route.ts`, `app/profile/route.ts`,
  `app/profile/notifications/route.ts`,
  `app/profile/email-change/{confirm,cancel}/route.ts`,
  `app/profile/deletion-code/route.ts`, `app/userSettings/route.ts`.
- `server/profile/`: `update-profile.ts`, `email-change.ts`,
  `delete-account.ts` (the use cases), `texts.ts`.
- `server/mail/`: the three mails.
- `server/flash.ts`: the new kinds.
- `components/profile/`: header, account form (errors listed, typed
  values kept), pending-change box, sign-in card, notifications form,
  theme choice (client), danger zone (client toggle; open on a sent code
  or a deletion error). Tokens only.

## Testing

- Domain: `profileFormEntry` per field and order; `emailChangeIntent`;
  `leagueHeir` (oldest `joined_at`, the id tie, the leaver skipped, none
  left); the throttles' keys and order.
- Database: a name change; a username taken by fold (`Š`/`s`, case) and
  not by oneself; `requestEmailChange` parks only after a sent mail;
  confirm (`none`, `invalid`, `taken` by another spelling, ok and the
  pending address cleared, an expired code, a code of another purpose,
  another account's pending code); `deleteAccount` removes every row the
  account owns in every table (a test that lists every table with a
  `player_id`-like FK and fails on a new one not handled), keeps
  `game_odds` and every other player's rows byte for byte, keeps
  `audit_results` with the player null, hands a league to the oldest
  member, deletes the address's codes, frees the address for `createAccount`
  at once; a deletion waits for a running recalculation and vice versa; a
  concurrent prediction save by the player either lands before (and goes)
  or fails, never deadlocks.
- Feature: every handler's answers (each flash text, each bag, 403, guest
  303, 429, 405, the `_method` check, the 308s), the page for a player, a
  guest's return, deletion ending the session (the cookie cleared with its
  flags, the old session token refused), sign-in with the deleted address
  answering as for any unknown address, registration of it at once.
- Components: every card and text; the bags in their places; the danger
  zone's open states; the theme buttons.
- E2E at 390 and 1280: change the name; request an address change, read
  the code in Mailpit, confirm it; request a deletion code, delete, land
  signed out on `/`.

## Done means

On staging the owner edits their name, changes their address with the
code from the new inbox (the old one gets the notice), switches reminders
on and off, switches the theme, and deletes a test account with the
emailed code: signed out on `/`, the address free to register again, its
league handed to the oldest member, every other player's points
unchanged. The security reviewer has signed off every **[SR]** task.

## Open questions for the owner

1. **R-99 and later recalculations.** Under `ruledRules` a recalculation
   computes every scored game's odds from the votes
   (`packages/domain/src/rules/input-reads.ts:25-28`,
   `packages/domain/src/recalculation/recalculation.ts:248`), so the next
   result save after a deletion would re-score past games with the smaller
   crowd and move other players' points. Proposed: the ruled set reads a
   scored game's stored `game_odds` row and computes only for a game
   without one (sportbet's set already reads stored odds). Only a deletion
   changes real votes after tip-off, so nothing else moves.
2. **A private league whose owner was its only member.** Proposed: it is
   deleted with its invites and messages (nobody can see it); sportbet
   leaves it ownerless (`create_leagues_table.php:16`).
3. **A guest as heir (R-87).** Proposed: the longest-standing non-guest
   member, a guest only when no other is left.
4. **"Narys nuo".** The reader does not read `users.created_at`
   (`CLAUDE.md` reader rule). Proposed: read it (owner's consent, as 4b's
   columns) into a new `players.created_at`; else the line is dropped.
5. **Two new texts:** surname required "Įveskite pavardę." and username
   taken "Šis vartotojo vardas jau užimtas." (sportbet shows Laravel's
   English, as for registration's).
