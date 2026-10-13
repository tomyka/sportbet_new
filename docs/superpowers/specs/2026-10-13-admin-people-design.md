# Slice 14: admin - users, leagues, messages, audit

A18 part 2 of `docs/phase-2-inventory.md` (#31): the admin screens for the
people side of the app - `/admin/users` (role, hide, delete),
`/admin/leagues` (edit, delete, members and the guest mark, the
superadmin's payments door), `/admin/messages` and `/admin/audit`.
Euroleague only (decision 11). It builds the one account-deletion path
(`deleteAccount`) that slice 17's self-service `DELETE /profile` reuses,
and the one role-change path. **Security-sensitive throughout:** the
security reviewer reviews the tasks the plan marks.

Binding: decisions 5, 10 and 13; R-19, R-25, R-26 (amended), R-39, R-45,
R-69, R-87, R-95, R-99, R-105 (`docs/owner-rulings.md`); the rules in
`CLAUDE.md` (the domain decides, one transaction under the lock order,
route handlers answering a real 303, Laravel's answers, `adminGate`,
email as identity, `__Host-` cookies, tokens, Lithuanian text in
components, `pointsChanged()`). It builds on slice 12's league tables and
decisions (`2026-10-12-leagues-design.md`) and slice 13's `isSuperadmin`,
admin tournament and emailed confirmation
(`2026-10-13-admin-structure-design.md`).

## The reference

sportbet at **5aa8465**: `routes/web.php` (151-230),
`app/Http/Controllers/UserController.php` (`getAllUsersFull` 43-48,
`toggleHidden` 50-62, `updateUser` 64-80, `promoteSelf` 82-96,
`deleteUser` 98-126), `app/Services/ProfileService.php` (`deleteAccount`
313-348), `LeagueController.php` (`adminIndex` 335-344, `adminUpdate`
362-381, `adminDelete` 383-410), `LeaguePaymentController.php`
(`adminEdit` 66, `adminUpdate` 75, `adminUpdateDetails` 85),
`MessageController.php` (`getMessageAll` 29-35, `insertMessage` 38-49,
`updateMessage` 52-83, `validateMessage` 91-97), `AuditController.php`
(`index` 10-49), and the views `resources/views/admin/{users,leagues,
league-payments,messages,audit}.blade.php`. sportbet `CLAUDE.md` >
Security (589-604).

What sportbet does, in short:

- **Tiers.** `/admin/leagues` (list) sits in the `admin` group (level >
  0, `routes/web.php:170`); users, messages, league edit and payments,
  and the audit in the `superadmin` group (level >= 5, 178-230);
  `updateUser`, `deleteUser`, `toggleHidden` and the league delete add
  `level9admin` (181-183, 228); a message delete re-checks level 9 in the
  controller (`MessageController.php:67-71`). Level 8 may promote itself
  to 9 (`promoteSelf`).
- **Users** ("Vartotojai", count badge, every account by id): #,
  "Vartotojas" (username, full name, a "neaktyvus" badge titled
  "Neaktyvus - paslėptas nuo lentelių"), "El. paštas", "Auth" (Google or
  e-mail), "Admin" (a select User / Editor / Admin / Super posting
  `updateUser` on change: "Vartotojo :username duomenys buvo
  atnaujinti."), and actions: "Pakelti save į Superadmin" (level 8, own
  row), "Auditas" (link to `/admin/audit?user=N`), "Aktyvuoti /
  Deaktyvuoti vartotoją" (a JSON toggle of `user_settings.active`, the
  one account-wide flag that is also R-7's switch-off), "Ištrinti" (a JS
  `confirm('Ištrinti <username>?')`). Delete refuses yourself ("Cannot
  delete your own account.") and an unknown id ("User N not found."),
  then runs `ProfileService::deleteAccount` ("User N deleted"): audit
  logins, prediction audits, survival audits, league memberships, every
  points and prediction row, settings, the address's login codes, the
  user, in one transaction. **It does not hand leagues over** - an owned
  league keeps a dangling owner.
- **Leagues** ("Lygos", every league of every tournament, public first
  then newest): name, "Vieša" / "Privati", member count, description,
  `#id · owner (name) · created` or "be savininko"; "Redaguoti" (modal:
  "Pavadinimas" 100, "Aprašymas" 500, "Mokestis", "Baudos žingsnis", the
  public note "Tai vieša lyga - pakeitimai matomi visiems žaidėjams.",
  "Atšaukti" / "Išsaugoti", flash "Lyga atnaujinta"), "Mokėjimai" (the
  league admin's payments page for any league, the only door to the
  public league's: "Mokėjimai išsaugoti", "Rekvizitai išsaugoti"), and
  for a private league at level 9 "Ištrinti" (JS confirm "Ištrinti lygą
  "name"?"; public refused "Viešos lygos ištrinti negalima"; selected
  members move to the tournament's public league, messages detached,
  "Lyga ištrinta"). No screen sets `is_guest`.
- **Messages** ("Žinutės", every message): #, "Žinutė" (text box),
  "Lygos" (select of every league, blank "- lyga -"), "Aktyvi" (switch),
  "Išsaugoti" and, at level 9, "Ištrinti" (JS confirm "Ištrinti
  žinutę?"); an insert row ("Nauja žinutė…", "Pridėti žinutę"). Text
  required (the column is 255), league blank or an integer. English
  flashes ("message inserted", "message N updated", "message N
  deleted"); "Insufficient permissions to delete."; neither button:
  "Nėra ką išsaugoti: formoje nenurodytas veiksmas.". A blank league is
  stored as null and, despite the comment ("a message for every
  league"), shown nowhere: the dashboard reads `league_id = ?`
  (`MessageController.php:25`).
- **Audit** ("Auditas"): a "- Visi vartotojai -" select of every
  username filters both tabs; "Prisijungimai" (count; "Vartotojas",
  "Metodas" - "Registracija", "Registracija (Google)", "Google", "El.
  paštas" -, "IP adresas", "Data" `Y-m-d H:i` in UTC; empty "Prisijungimų
  įrašų nėra.") and "Prognozės" (count; "Vartotojas", "Rungtynės" `home
  - away`, "Sena" `h:a` or `-`, `→`, "Nauja", "Data"; empty "Prognozių
  pakeitimų nėra."), 25 a page each (`logins_page`, `predictions_page`).
  Nothing is pruned.

## Rulings applied

- **R-26 amended.** Only a superadmin gives or takes a role, on an
  existing account; nobody changes their own role; the last superadmin
  cannot be removed; each change is recorded in the audit and confirmed
  with a fresh emailed code. `promoteSelf` is not carried (the emailed
  code replaces "level 8, promote yourself to 9"). sportbet's four levels
  become the three roles (`roleOfSportbetLevel`): the select offers
  "Žaidėjas", "Rezultatų tvarkytojas", "Superadministratorius" (new
  texts, decision 13).
- **R-25.** Deleting an account erases its trail - sign-ins
  (`audit_logins`) and prediction changes (`audit_prediction_games`) -
  and its predictions, picks, points and settings; each private league
  it owns passes to that league's longest-standing other member
  (`joined_at`, then player id), who becomes owner and `is_admin`.
- **R-69.** The result-change record outlives the account: only who made
  each change is forgotten (`audit_results.player_id` `set null`, already
  so). The audit page gains a "Rezultatai" tab (lead decision below).
- **R-99.** Deleting an account changes nobody else's stored points: the
  `game_odds` rows stay and every recalculation reuses them, so
  `deleteAccount` runs no recalculation.
- **R-19 and R-39.** "Paslėpti" sets `tournament_players.admin_hidden`;
  it is not R-7's switch-off, a prediction save does not undo it, and a
  hidden player keeps getting fill-ins. Un-hiding clears only the hide;
  the switch-off is shown, never changed here.
- **R-87.** A superadmin marks a league member as guest (or full member)
  on the league's members list. The roster narrows at once; no points
  change.
- **R-95.** The league select on `/admin/messages` offers only the
  admin's tournament's leagues; deleting a message is superadmin only and
  confirmed by the emailed code (slice 13's `delete-league-message`).
- **R-105.** No screen promotes a league member to admin; the
  superadmin's league edit is the owner's form (sportbet #128), nothing
  more.
- **R-45.** No IP: the logins tab has no "IP adresas" column, and the
  Google methods do not exist (`AUDIT_LOGIN_METHODS`:
  `email_code`, `register`).

## Lead decisions (technical)

From the slice plan, with what planning added:

- **Admin delete is exactly R-25** and refuses yourself ("Savo paskyros
  čia ištrinti negalima.") and the last superadmin ("Paskutinio
  superadministratoriaus ištrinti negalima.") (new texts).
- **Every handler re-checks the role** through `adminGate` on the ask
  and again on the confirm, and the performer decides again under its own
  locks (sportbet `CLAUDE.md`: re-check authority at the point it is
  used).
- **The audit keeps rows indefinitely;** result changes are a tab.
- **The four new routes are superadmin** (`isSuperadmin`), except as the
  open question on messages decides. sportbet's level 5 reached users,
  the audit and league payments; R-26 amended gives users and roles to
  the superadmin and R-69's record is "for the superadmin to check".
- **One account deletion.** `deleteAccount(db, { target, by })`
  (`packages/db/src/account/deletion.ts`) is the only writer that removes
  a player; slice 17 calls it with `by: 'self'`. The domain's
  `accountDeletion` decides it (refusals `own-account` for an admin
  actor, `last-superadmin`, `not-found`) and plans the league hand-overs
  (`leagueHandOvers`). Every table referencing `players` is either
  `cascade` / `set null` or deleted explicitly by it, and a db test fails
  on any new FK to `players` that is neither (as `invariant-checks.test.ts`
  does for CHECKs). The address's live login codes are deleted by exact
  equality (#41). Sessions go by cascade, so the account is signed out
  everywhere at commit.
- **Deletion's locks:** each of the player's tournaments' recalculation
  locks in tournament id order (so no `saveResult` or registration writes
  rows for the player mid-delete), then the player's `match_predictions`
  rows, then `tournament_players` through `lockPlayerStatuses`, then the
  owned leagues `FOR UPDATE` and their members by player. Taking several
  tournament locks in id order is new; it is added to `lock.ts`'s
  comment. No recalculation (R-99); `pointsChanged()` after commit (who
  is listed changes).
- **One role change.** `changeRole(db, { actor, target, role })` locks
  every superadmin's `player_settings` row `FOR UPDATE` (by player id),
  re-reads the actor's role, and only then lets the domain's `roleChange`
  decide (`own-role`, `same-role`, `last-superadmin`, `actor-not-
  superadmin`). Two superadmins demoting each other at once therefore
  cannot leave none. The change and its audit row commit together. The
  role is re-read with the session on every request, so it applies on
  the target's next request.
- **Hide is per tournament: the admin's tournament** (slice 13's
  `admin_tournament_id`), pending the open question. The users list shows
  every account (as sportbet) with the hide state of the admin's
  tournament, and no hide button for an account not in it. A hide writes
  under `lockPlayerStatuses` and calls `pointsChanged()`; it needs no
  emailed code (it is undone by the same button).
- **Leagues list the admin's tournament's leagues** (public first, then
  newest), as slice 13's lists and R-95 do. Edit reuses slice 12's
  `leagueFormEntry` (update) and writer with a superadmin actor; delete
  reuses slice 12's `deleteLeague` decision with the owner check replaced
  by the superadmin's (public refused, members moved, messages detached).
  The payments door (`/admin/leagues/{league}/payments`, `/save`,
  `/payment-details`) reuses slice 12's page, `recordPayments` and
  details writer with a superadmin actor, the public league included
  (slice plan: "the superadmin's with slice 14").
- **Members and the guest mark:** `/admin/leagues/{league}/members`
  lists the members (username, full name, joined, owner / admin / guest)
  with a "Svečias" switch posting `POST /admin/leagues/guest`
  (`leagueID`, `userID`, `guest`); `setLeagueGuest` locks the league row
  then the member row (slice 12's league lock order). Flash "Narys
  pažymėtas svečiu." / "Narys pažymėtas pilnateisiu nariu." (new). No
  points change, so no recalculation and no `pointsChanged()`
  (`/leaderboard` is tournament-wide).
- **Messages list** the messages of the admin's tournament's leagues
  plus the detached ones (league null), so a detached message can be
  re-attached or deleted. A blank league stays null and is shown nowhere
  (sportbet's code, not its comment). Text 1..255 (`messageTextInvariant`,
  the column's length); the league must be one of the admin's
  tournament's or blank. sportbet's English flashes become Lithuanian:
  "Žinutė pridėta.", "Žinutė #N atnaujinta.", "Žinutė #N ištrinta." (new,
  the owner may reword).
- **Audit page.** Tabs as server links (`?tab=prisijungimai|prognozes|
  rezultatai|roles`), each paginated 25 with its own page parameter
  (`logins_page`, `predictions_page`, `results_page`, `roles_page`), all
  keeping `?user=`. The user filter is read only by `idFromText`; an
  unknown id shows empty tabs. "Rezultatai": "Vartotojas" (or "-" once
  forgotten), "Rungtynės", "Sena", `→`, "Nauja" (a postponed side reads
  "Atidėta"), "Data". Dates are Vilnius `Y-m-d H:i` like the rest of the
  app (sportbet printed UTC, `config/app.php:88`). Every row is parsed
  with the domain schema in `db`.
- **Answers.** Every write is a form post to a route handler answering a
  real 303 with a flash (the hide toggle too: sportbet's JSON toggle
  becomes a post); a form refusal answers through `laravel-answers.ts`;
  cross-site 403; a posted id is read only by `idFromText` (sportbet
  issue 281: `userID[]=x` deleted user 1); an unknown id 404; a refused
  role goes home (`adminGate`). Throttles: slice 13's `adminWriteLimits`
  and `adminConfirmLimits`.
- **Confirmable kinds added** (slice 13's registry,
  `server/admin/confirm/actions.ts`): `delete-user` ("Ištrinti paskyrą
  :username (:email)"), `change-role` ("Pakeisti :username rolę: :old ->
  :new"), `delete-league-message` ("Ištrinti žinutę #N"). The ask step
  runs the decision first, so a refused action mails nothing. The
  description is computed again on the confirm page from the database,
  never from the cookie.

## Open questions for the owner

1. **Hide scope.** sportbet hides account-wide (`user_settings.active`,
   `UserController.php:57-59`); the new column is per tournament
   (`packages/db/src/player/schema.ts:57-58`). (a) hide in the admin's
   tournament only, or (b) in every tournament of the player.
   **Recommended (a)**: R-19 and R-7 are per tournament, and a hide in a
   finished tournament would otherwise move its tables.
2. **Who manages messages.** sportbet's level 5 lists, creates and edits
   messages (`routes/web.php:178,203-205`), level 9 deletes
   (`MessageController.php:67-71`); level 5 maps to results manager
   (`packages/domain/src/account/role.ts:43-52`). R-95's "deleting a
   message is superadmin only" reads as if others edit. (a) results
   managers list, create and edit, superadmins delete; (b) superadmin
   only. **Recommended (a)**, as R-95 and sportbet.
3. **The admin trail.** R-26 records role changes "in the audit"; R-25
   erases an account's own trail; R-69 keeps the results trail. (a) one
   `audit_admin_actions` table (role changed, account deleted: actor,
   target, old and new role, when; no names), kept indefinitely, with
   actor and target forgotten (`set null`) when either account is
   deleted, shown as the "Rolės" tab; (b) role changes only, erased with
   the target's account. **Recommended (a)**: an admin's actions are
   accountability records like R-69's.
4. **A deleted owner's league with no other member.** R-25 wants every
   league to keep an owner; slice 12's `owner_id` is `set null`
   (`2026-10-12-leagues-design.md`, Schema). (a) delete the empty league
   (its messages detached, as `LeagueController.php:404`); (b) keep it
   ownerless. **Recommended (a)**.
5. **Is deleting a league confirmed by an emailed code?** sportbet asks
   only a JS confirm (`resources/views/admin/leagues.blade.php:87`);
   R-26's list is a user, a game, a role. It moves every member and
   cannot be undone. (a) yes, a `delete-league` kind; (b) no, a plain
   post. **Recommended (a)**.

## Design

### Domain

- `account/role-change.ts`: `roleChange({ actor, target, role,
  superadmins })` -> `Result<RoleChange, 'actor-not-superadmin' |
  'own-role' | 'same-role' | 'last-superadmin'>`; `roleChangeEntry`
  (posted `admin` parsed as a `Role`, `userID` by `idFromText`).
- `account/account-deletion.ts`: `accountDeletion({ actor, target,
  superadmins })` (`'self' | { admin }`) -> refusals `own-account`
  (admin actor only), `last-superadmin`; `leagueHandOvers(owned)` ->
  per league `{ newOwner }` or `{ deleteEmpty }` (open question 4).
- `account/admin-hide.ts`: `adminHideChange(status, hidden)` (R-19, R-39:
  touches `adminHidden` only).
- `league/guest-mark.ts`: `markGuest(member, guest)` (`not-member`,
  `unchanged`).
- `message/message-form.ts`: `messageFormEntry` (text, league, active),
  field by field; `messageTextInvariant` (1..255); `messageLeagueAllowed`
  (R-95).
- `admin/confirmable-action.ts`: the new kinds and their schema.
- `admin/audit-page.ts`: `AUDIT_TABS`, `auditPageQuery` (tab, page per
  tab, user), the row shapes (`AuditLoginRow`, `AuditPredictionRow`,
  `AuditResultRow`, `AuditAdminRow`), `AUDIT_PAGE_SIZE = 25`.

### Database

- Migration: `audit_admin_actions` (open question 3): id, `actor_id`,
  `target_id` (both FK players `set null`), `kind`, `old_role`,
  `new_role`, `at`; indexes on both ids. Messages, leagues and members
  are slice 12's.
- `account/deletion.ts`: `deleteAccount` (above); `account/role.ts`:
  `changeRole`; `player/admin-hide.ts`: `setAdminHidden`.
- `league/admin.ts`: `updateLeagueAsSuperadmin`, `deleteLeagueAsSuperadmin`,
  `setLeagueGuest`, `loadAdminLeagues`, `loadAdminLeagueMembers`; the
  payments door through slice 12's loaders and writers with a
  `{ superadmin }` actor.
- `message/admin.ts`: `insertMessage`, `updateMessage`, `deleteMessage`,
  `loadAdminMessages`.
- `admin/users.ts`: `loadAdminUsers` (id, username, name, surname,
  email, role, the admin tournament's hide and switch-off, or none);
  `admin/audit.ts`: `loadAuditPage` (one query per tab, `LIMIT 25 OFFSET`,
  counts, the usernames list).
- `test/player-fk-coverage.test.ts`: every FK to `players` in the
  database is cascade, set null or in `deleteAccount`'s explicit list.

### Web

- Pages (load, return one component): `app/admin/users/page.tsx`,
  `app/admin/leagues/page.tsx`, `app/admin/leagues/[league]/members/
  page.tsx`, `app/admin/leagues/[league]/payments/page.tsx`,
  `app/admin/messages/page.tsx`, `app/admin/audit/page.tsx`.
- Route handlers (303): `admin/updateUser`, `admin/deleteUser`,
  `admin/toggleHidden` (sportbet's paths); `admin/leagues/update`,
  `admin/leagues/delete`, `admin/leagues/guest`,
  `admin/leagues/[league]/payments/save`, `.../payment-details`;
  `admin/messages/save` (sportbet's `POST /admin/messages`, `update` or
  `delete`), `admin/messageInsert`.
- `server/admin/{users,leagues,messages}.ts`, `texts.ts`; the kinds in
  `server/admin/confirm/actions.ts`.
- `components/admin/`: users table (role select, hide, delete, audit
  link), leagues list and edit dialog, members list, messages table with
  the insert row, audit tabs and pager; admin index tiles "Vartotojai",
  "Lygos", "Žinutės", "Auditas" per permission.

## Testing

- Domain: `roleChange` every refusal, both orders; `accountDeletion`
  own, last superadmin (self path), admin path; `leagueHandOvers` longest
  standing, tie by id, none left; `adminHideChange` keeps `switchedOff`;
  `markGuest`; `messageFormEntry` field by field (empty, 256 characters,
  a league of another tournament); audit query parsing.
- Database: `deleteAccount` removes every row of the player and nobody
  else's, keeps `audit_results` with `player_id` null, keeps every other
  player's stored points and `game_odds` byte for byte (R-99), hands a
  league to the longest-standing member, deletes the address's codes and
  not another spelling's, ends the sessions; FK coverage; `changeRole`
  under two concurrent demotions leaves one superadmin; a refusal writes
  nothing; `setAdminHidden` leaves `switched_off`; `setLeagueGuest`
  narrows `loadRoster`; messages keep R-95.
- Feature: each route's gate (guest, player, results manager,
  superadmin), 403 cross-site, 303 and flash, 404 unknown id, an array id
  refused; the confirmation for each new kind (no cookie, another kind's
  code, a target deleted meanwhile, success); deleting your own account
  and demoting yourself refused before any mail.
- Components: every view, the role select per role, the audit tabs and
  pager, empty states.
- E2E at 390 and 1280: change a role with the code from Mailpit, hide and
  un-hide a player and see the table change, mark a guest, add and delete
  a message, delete an account and see its rows gone and the league
  handed over, filter the audit.

## Done means

On staging the owner, as superadmin, changes a role and deletes a test
account (each with an emailed code), hides a player from the tables,
marks a league guest, edits and pays into a league, writes a league
message that shows on the dashboard, and reads sign-ins, prediction
changes, result changes and role changes on the audit; a results manager
cannot reach users, leagues or the audit; no one can change their own
role or delete themselves here. #31 is closed, the security reviewer has
signed off the marked tasks, and every rule above has a named test.
