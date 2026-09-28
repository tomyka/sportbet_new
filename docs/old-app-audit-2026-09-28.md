# sportbet (production PHP/Laravel app): what to fix, what to decide

Prepared 2026-09-28 for the owner. It consolidates four read-only audits of `D:\Projects\sportbet` at `0da316f`:
security (S1-S17), game rules (R1-R32), data integrity (D1-D31) and fragile behaviour (W1-W26). It also folds in
the Phase 2 inventory's open questions (Q1-Q20, section 5) and dead-code candidates (C/H, section 4), plus one
finding checked directly in the code (X1). Nothing was changed in the old repo and no issue was filed.

How it was checked:

- Every Critical and High finding was re-read in the code. The file:line references below are the ones I checked.
  Two were adjusted. D1 is downgraded from High to Medium: the double-click race it describes most likely ends in
  a 404 for the second request rather than duplicate rows (see issue 15). W8 is upgraded to High, because it
  silently moves the prediction lock.
- Every finding was compared against all 253 issues in `tomyka/sportbet`, open and closed. The matches are
  marked "tracked in #N" (the issue is still open), "fixed in #N" (closed and resolved), or "related #N" (the
  issue touched the area but did not cover this).
- Merged ids are written as `S1 = D2 = R16 = Q11`.

Severity: **Critical** = a player can change a prediction after the outcome is known. **High** = wrong points
or a blocked admin flow, reachable today. **Medium** = wrong in an edge case, after an admin action, or through
a crafted request. **Low** = hygiene, display only, or latent.

Rules for every issue in part 1, from the old repo's CLAUDE.md: PHPStan level 10 with no baseline; the golden
master stays byte-identical unless the issue is meant to change scoring, and says so; tests pass on both SQLite
and MySQL; if stored points change, `/admin/recalculateAllGamePoints` (and/or `/admin/updateStandingPoints`) has
to be run on production afterwards, and the sportbet_new parity oracle has to be told.

One production fact affects several fixes. `Cache::lock` only serialises requests if the production cache store
supports locks. The `database` and `redis` stores do; `array` does not. So check `CACHE_STORE` first (P22). Where
it is not safe, use a MySQL `GET_LOCK` or a `lockForUpdate()` on a guard row instead.

---

## 1. Fix now - no owner input needed

32 proposed issues: **Critical 2, High 4, Medium 14, Low 12.** They are listed in the suggested order: security
holes and anything that can stop result entry come first.

### Issue 1 - Match prediction saves check the lock of the row they write

- **Severity:** Critical
- **Findings:** S1 = D2 = R16 = Q11, plus the player half of D30
- **Tracking:** Not tracked. #212 (closed) fixed the refusal message, not this.
- **Problem:** A signed-in player can change a match prediction after kick-off, even after the result is in. They
  send an open game's id together with the row id of their locked prediction. The lock is checked on the open
  game, but the locked row is the one that gets written. They can also save a Euroleague draw by pairing it with
  a football game id.
- **Evidence:** `PredictionResultController.php:132` loads `$game` from the posted `gameID`, and `:140` checks the
  lock on it. `:151-153` loads the row by `prediction_gameID` and `user_id` only. The audit row (`:173`) and the
  odds refresh (`:178`) use the posted `gameID`. `UpdatePredictionResultRequest::scoreFormat()` (`:86-95`)
  resolves the format from the posted `gameID`.
- **Fix:**
  - Load the row first: `PredictionResult::where('id', prediction_gameID)->where('user_id', $userID)->firstOrFail()`.
    Then take the game from it with `Game::findOrFail($row->game_id)`, and run `GameLock::isOpen` on that game.
  - Refuse (422) when a posted `gameID` differs from `$row->game_id`.
  - In the FormRequest, resolve `scoreFormat()` from the row's game.
  - Use `$game->id` for the audit row and the odds refresh.
  - Validate `gameWinnerID` with `Rule::in([$game->home_team_id, $game->away_team_id])` in `after()`.
  - Feature test: a locked row posted with an open `gameID` is refused and the row is unchanged.
- **Stored points:** No change to the golden master. If anyone has already used the hole, their past rows are
  wrong, and a recalculation would pay those edited rows as they now stand.
- **Production check first:** P6, to see whether the hole was ever used.

### Issue 2 - Standings saves check the deadline and format of the row's own tournament

- **Severity:** Critical
- **Findings:** S2 = D4 = R17 = the standings half of W7
- **Tracking:** Not tracked.
- **Problem:** A player can edit a standings prediction after its deadline, when group positions and knockout
  results are already known. Two ways:
  - Open `/tournaments/exit`, which clears the session tournament. From then on the deadline is "none", and both
    the row save and the ladder reorder accept every row the player owns.
  - Put another tournament in the session (a second membership, or `POST /tournament/{slug}/enter`, which sets it
    without any membership check), then post a row id from the closed tournament.

  Saving a football row while the session names a Euroleague tournament also wipes that row's round-of-32 and
  round-of-16 ticks.
- **Evidence:** `PredictionStandingController.php:59` checks `StandingsDeadline::hasPassed(session('tournamentID'))`.
  `:65-67` loads the row by id and user only. `StandingsDeadline::at()` returns null for a null id (`:154-158`).
  `TournamentController::exit()` (`:203-208`) is a GET that forgets the session tournament. `enter()` (`:107-128`)
  puts any tournament into the session.
- **Fix:**
  - In the FormRequest, load the row joined to `teams` and take `tournament_id` from the team.
  - Check `StandingsDeadline::hasPassed($row->tournament_id)` and validate with
    `StandingsFormat::forTournamentId($row->tournament_id)`. Run `rowConflicts()` in that tournament too.
  - In `reorderPredictionStandingsUser`, refuse when `session('tournamentID')` is null. Its rows are already scoped
    to that tournament when it is set.
  - Tests: a closed-tournament row posted while the session names an open tournament is refused; a save with a
    null session tournament is refused.
- **Stored points:** None directly. If the hole has been used, `/admin/updateStandingPoints` pays the edited rows.
- **Production check first:** P7.

### Issue 3 - Survival pick validation

- **Severity:** High
- **Findings:** S3 = D3 = R4 (for the team being picked) = R5 = R20 = the survival half of W7 = X1, plus the
  locking part of D19
- **Tracking:** Not tracked. #231 (closed) added the "round already scored" refusal. The read query's lock came
  from #197.
- **Problem:** The page greys out teams whose game has started, but the server checks none of it. A crafted
  request, or a page left open, can do any of the following:
  - pick a team whose game has already finished as a win (the win is then paid on the next scored round);
  - pick a team that does not play this round, or one from another tournament;
  - pick in a round that is not a survival round;
  - with a stale session, attach the pick to an old round.

  Separately (X1), the player's current pick is cleared and saved before the new team is validated. A refused
  switch ("Ši komanda nepasiekiama") therefore leaves the player with no pick at all, while the page still shows
  the old one or the new one (see issue 23).
- **Evidence:** `PredictionSurvivalController.php:62-107`. The only checks are `session('eventID') > 0` (`:68`), a
  team was sent, and `roundScoredFor` (`:80`). `:84-90` detaches the previous pick. `:92-99` then looks the new
  team up by user and team only, and refuses if it is missing, after the detach is already saved. There is no
  `GameLock` call. The only lock logic is the display flag at `:303`. `Recalculation.php:61` scores survival on
  the tournament's `survival_game` alone, never the event's `event_survival` flag.
- **Fix:**
  - Resolve the round on the server for every POST, with the same "earliest unscored game of the tournament" query
    `SessionController` uses, scoped to the tournament of the posted team. Do not trust `session('eventID')`.
  - Require `events.event_survival = 1` and `tournaments.survival_game`.
  - Require that the team has a game in that event and that the game is `GameLock::isOpen` (keep survival's extra
    `away_team_score IS NULL` clause), and that the team belongs to the event's tournament.
  - Do all validation **before** touching the previous pick. Then detach and attach inside one `DB::transaction`,
    with `lockForUpdate()` on the player's picks for that event.
  - Leave two things alone until the owner answers: moving away from a pick whose game has started (question 3)
    and re-using a team (question 15).
  - Feature tests for each refusal, and one for X1: a refused switch leaves the previous pick attached.
- **Stored points:** No for future rounds. Picks made through the hole in the past cannot be audited, because
  picks are nulled on a loss.
- **Production check first:** P8, which is indicative only.

### Issue 4 - Account deletion runs in one transaction and does not strand the account

- **Severity:** High
- **Findings:** D6, and the mechanical part of Q10
- **Tracking:** Related #43 (closed; the re-authentication step). The deletion itself is not tracked.
- **Problem:** A player who deletes their own account is shown an error page. Their predictions, points,
  memberships and settings are already gone, but the account itself stays, and from then on every visit fails
  (404). This hits every real player, because each prediction save writes an audit row that blocks the final
  delete.
- **Evidence:** `ProfileService::deleteAccount` (`:142-156`) runs with no transaction and never deletes
  `audit_prediction_games`. That table's `user_id` is `constrained('users')` with no cascade
  (`0001_01_01_000005_create_sportbet_table.php:180`, and `2026_06_10_200007...php:94`). The admin path,
  `UserController::deleteUser` (`:81-107`), does delete those audit rows, but not `audit_prediction_survival`.
- **Fix:**
  - Keep one deletion routine, `ProfileService::deleteAccount`, inside `DB::transaction`, and have
    `UserController::deleteUser` call it.
  - Delete what the admin path deletes (`AuditLogin`, `AuditPredictionGame`), plus `audit_prediction_survival`
    rows and `LoginCode` rows for the address.
  - Whether audit history should instead be kept is question 21. Deleting it matches today's admin path, so it is
    the neutral default.
  - Feature test: self-deletion of a user with audit rows succeeds and removes the user row, on both SQLite and
    MySQL.
- **Stored points:** No. The deleted player's votes remain baked into odds, as they do today.
- **Production check first:** P3 (accounts already stranded this way) and P4 (the real foreign keys).

### Issue 5 - The serija recalculation batches its update and is scoped to the scored game's tournament

- **Severity:** High. It rises to Critical once `point_results` nears about 21,800 rows.
- **Findings:** D5 + D13
- **Tracking:** Related #27 (closed; batched the other writes), #122 (closed; grouping by tournament) and #198
  (open; the recalculation module).
- **Problem:** Every result save rewrites every player's serija bonus, for every tournament ever played, in one
  SQL statement with 3 placeholders per row. MySQL refuses a statement with more than 65,535 placeholders. At
  about 21,845 `point_results` rows, **every result save fails and rolls back**: the admin cannot enter scores,
  and "recalculate all" fails too. With 380 Euroleague games, this season alone can pass that line with around
  60 players. Two admins saving at once can also deadlock, or write streaks from a stale snapshot.
- **Evidence:** `PointResultController::recalculateStreaks()` (`:109-216`) builds
  `UPDATE ... CASE id WHEN ? THEN ? ... WHERE id IN (?...)` with 3N bindings (`:199-215`) from
  `StreakWalker::bonuses`, which yields an entry for every row it walks (`StreakWalker.php:29-42`). Laravel sets
  `ATTR_EMULATE_PREPARES => false` (`vendor/.../Connector.php:24`), so MySQL's native placeholder limit applies.
  The update runs inside `ResultController::updateResult`'s transaction (`:46-60`).
- **Fix:**
  - Give `recalculateStreaks(?int $tournamentID = null)` a tournament filter.
    `Recalculation::afterResultEntered` passes the game's tournament; `all()` passes null.
  - Write the updates in chunks: `foreach (array_chunk($updates, 5000, true) as $chunk)`, one statement per chunk.
  - Serialise result entry with a lock around the transaction in `updateResult`. Use `Cache::lock` only if P22
    confirms a lock-capable store; otherwise use `DB::select('SELECT GET_LOCK(?, 10)')` on MySQL, with a no-op on
    SQLite.
- **Stored points:** No. Streaks already restart at each tournament boundary (#122), so scoping the pass changes
  no value, and the golden master stays byte-identical.
- **Production check first:** P1. Do this now: it tells you how much headroom is left.

### Issue 6 - The admin game editor keeps the exact kick-off time

- **Severity:** High (upgraded from W8's Medium-High)
- **Findings:** W8
- **Tracking:** Not tracked. Related #64: the importer stores the feed's exact minute.
- **Problem:** The admin game editor offers only :00 and :30, and rounds any other time. Opening an imported
  20:45 game to fix its round and pressing save moves the kick-off to 21:00. Predictions then stay open 15
  minutes into the game, or close 15 minutes early.
- **Evidence:** `resources/views/admin/games.blade.php:70-76` has a `<select>` with only `00` and `30`.
  `agmSnapTime` (`:148-152`) rounds the stored time on open, and the rounded value is submitted (`:211-214`).
- **Fix:**
  - Replace the select with `<input type="time" step="60">`, and drop `agmSnapTime`.
  - Server side, keep the existing Vilnius-to-UTC conversion.
  - If the owner wants half-hour picking kept for new games, never rewrite the time of an existing game unless its
    time field was changed.
- **Stored points:** No. Games already moved this way can be put back by re-running the Euroleague import, which
  updates moved fixtures to the feed's time.
- **Production check first:** P9, to see whether any stored game has a minute other than :00 or :30.

### Issue 7 - Google sign-in links or creates an account only for a verified Google email

- **Severity:** Medium
- **Findings:** S6
- **Tracking:** Not tracked. #36 and #37 (closed) reviewed code sign-in, not Google.
- **Problem:** If Google ever reports an address its holder has not verified, that person signs in to the
  sportbet account with the same email.
- **Evidence:** `GoogleAuthController.php:52-61` matches on email, then calls `update(['google_id' => ...])` and
  `Auth::login`. The `email_verified` claim is never read.
- **Fix:** Before the email-link branch and the create branch:
  `if (($googleUser->getRaw()['email_verified'] ?? false) !== true) { return redirect('/')->with('error', ...); }`.
  Add a test with an unverified Google user.
- **Stored points:** No.
- **Production check first:** No.

### Issue 8 - A per-address limit on registration mails

- **Severity:** Medium
- **Findings:** S5
- **Tracking:** Not tracked. Related #102 (closed): registration by code.
- **Problem:** The registration form mails a code to any address that is not registered yet, limited only by 3
  per minute per IP. Someone can flood a stranger's inbox with sportbet mail and damage the sender's reputation.
- **Evidence:** `AppServiceProvider.php:57-59`.
- **Fix:**
  - Return `[Limit::perMinutes(10, 3)->by('email:'.$normalized), Limit::perMinute(3)->by('ip:'.$ip)]`, mirroring
    `login-code-request`.
  - Add `register` to the throttle-to-dialog list in `bootstrap/app.php:47`.
- **Stored points:** No.
- **Production check first:** No.

### Issue 9 - Inserting and deleting games is level 9 only, validated, and refused cleanly when predictions exist

- **Severity:** Medium
- **Findings:** S7 + D20, plus the `gameID` part of S15
- **Tracking:** Related #13 (closed): the same UI-versus-route mismatch, for tournaments.
- **Problem:**
  - The games page shows "insert" and "delete" only to top-level admins, but any admin can call them. Delete also
    accepts a list of ids.
  - Deleting a game that has prediction rows, which means any game with players, ends in a raw database error page.
- **Evidence:** `routes/web.php:143-144` puts the routes in the level-1 `admin` group. The view gates them at
  `games.blade.php:10,109`. `GameController::deleteGame` (`:141-150`) re-checks nothing, unlike
  `EventController.php:155-159`.
- **Fix:**
  - Move both routes into a `level9admin` group, or re-check `admin >= 9` as `EventController` does.
  - Validate `gameID` as `required|integer`.
  - In `deleteGame`, refuse with a message when `prediction_results` rows exist for the game. Whether such a game
    may be deleted at all belongs under question 22.
- **Stored points:** No.
- **Production check first:** No.

### Issue 10 - Clearing a result removes that game's points

- **Severity:** Medium
- **Findings:** D8 = R8, and the "cleared" half of Q12
- **Tracking:** Not tracked.
- **Problem:** If the admin enters a score on the wrong game and then clears both boxes, players keep the match
  points and serija bonuses from that game. The league table goes on paying for a game that now reads as
  unplayed.
- **Evidence:** `ResultController.php:57-59`: the recalculation runs only if at least one box is filled. `all()`
  (`Recalculation.php:79-98`) only visits scored games and never deletes rows.
- **Fix:**
  - When both scores are null, inside the same transaction, delete that game's `point_results` and run
    `recalculateStreaks($tournamentID)` (this depends on issue 5's signature).
  - In `all()`, first delete `point_results` rows whose game is unscored.
  - Do not touch survival or generated rows here. Undoing those is question 4.
- **Stored points:** Yes. Rows for cleared games disappear, and the golden master is unaffected unless it holds a
  cleared game. Run recalculate-all afterwards and tell the parity oracle.
- **Production check first:** P10.

### Issue 11 - Re-scoring an old survival round writes that round's own running total

- **Severity:** Medium
- **Findings:** R6 + R5, and part of Q2
- **Tracking:** Tracked in #216 (open). This is the concrete cause that issue was looking for.
- **Problem:** A Euroleague player who won rounds 1-3 away, home, away stores 12, 22, 34. If the admin re-saves
  round 1 unchanged, round 1 becomes 34, and the player's table total jumps by 22 until someone runs
  recalculate-all. The docs state the sequence 12, 22, 34.
- **Evidence:** `PredictionSurvivalController::updatePredictionSurvivalGame` (`:394-425`) calls
  `PointSurvivalController::updatePointSurvival`, which stores `runTotal()` over every pick attached in the
  tournament, later rounds included (`PointSurvivalController.php:92-107,188-214`). `runTotal()` also pays
  attached picks for rounds that have no win row.
- **Fix:** After any survival write, refold that player's run in that tournament with `SurvivalRun::fold`, in
  `event_day` then id order. Alternatively, compute the row as the running total up to and including that round,
  counting only rounds that already have a win row. Then both passes agree, which closes #216.
- **Stored points:** Yes, for survival. Rows inflated by re-saves go back down. Golden master: #216 says the golden
  survival expectation was never green, so pin the doc's 12, 22, 34 there. Tell the parity oracle.
- **Production check first:** No. P24 shows the size of the effect.

### Issue 12 - Leaving or deleting a league uses that league's own tournament, in one transaction

- **Severity:** Medium
- **Findings:** S11 = D11 = W6 = Q6
- **Tracking:** Not tracked.
- **Problem:**
  - A player who leaves a private Euroleague league can get a "not found" error after the leave has already
    happened. They are then left with no active league in that tournament, and cannot re-register, because their
    inactive public membership still counts as "already in".
  - Deleting a league moves its members into the first public league in the database, which may belong to the
    World Cup.
- **Evidence:** `LeagueController.php:296,329,382` use `League::where('is_public', true)->first()` with no tournament
  filter. `:379` deletes the membership before `:382-385` calls `firstOrFail()`. None of the three methods uses a
  transaction.
- **Fix:**
  - Use `League::where('tournament_id', $league->tournament_id)->where('is_public', true)->first()` in all three
    places.
  - Set `session('leagueID')` only to a league the player is a member of.
  - Wrap each method in `DB::transaction`.
  - "Your only league" stays counted across all tournaments until question 25 is answered.
- **Stored points:** No.
- **Production check first:** P11 (players already stranded).

### Issue 13 - Recalculation buttons become POST; the standings rebuild is transactional and cannot overlap

- **Severity:** Medium
- **Findings:** S12 = D9 = D10 = W12
- **Tracking:** Related #198 (open; the recalculation module) and #27 (closed).
- **Problem:**
  - Both "recalculate" buttons are plain links. A prefetch, a reopened tab or a link on another site clicked by a
    signed-in superadmin runs them.
  - The standings rebuild first empties standings points for every tournament. If it fails halfway, every
    leaderboard shows zero standings points until the next successful run.
- **Evidence:** `routes/web.php:187-188` are `Route::get`. `PointStandingController.php:125` calls
  `PointStanding::truncate()`, which is DDL on MySQL and commits implicitly. `Recalculation::all` commits game by
  game and zeroes `streak_bonus` before rebuilding streaks.
- **Fix:**
  - Make both routes `Route::post`, with `@csrf` forms and a confirm on `admin/index.blade.php`.
  - Replace the truncate with `DB::transaction(fn () => PointStanding::query()->delete(); upsert...)`.
  - Take the same lock as issue 5 around both recalculations.
  - Leave `streak_bonus` out of `pointResultRow` on rewrite, so an interrupted `all()` is not visible.
- **Stored points:** No. The golden master stays identical.
- **Production check first:** P14 (`max_execution_time`, `memory_limit`) and P22.

### Issue 14 - Take a database backup before every deploy that migrates

- **Severity:** Medium
- **Findings:** D14
- **Tracking:** Related #154 (closed; nightly backup) and #225 (closed; required reviewer).
- **Problem:** Every push to main migrates production with no fresh backup. A bad migration, including the unique
  keys in issue 15, could lose up to a day of predictions during a tournament.
- **Evidence:** `scripts/oci/apply-release.sh:52-62`. `sportbet:backup-database --before-migrations` exists, but
  only the nightly timer calls it.
- **Fix:** In `apply-release.sh`, before the migrate step, run
  `php artisan sportbet:backup-database --tag=predeploy --before-migrations`. Abort on exit code 2.
- **Stored points:** No.
- **Production check first:** P21 (is HeatWave point-in-time recovery switched on?).

### Issue 15 - Unique keys on the prediction tables and on the other tables the code assumes hold one row

- **Severity:** Medium (downgraded from D1's High). High if P2 finds duplicates.
- **Findings:** D1 + D15 (`user_settings`) + D16(a, b) + D19
- **Tracking:** Not tracked. Related #63 (closed; the double-clicked join).
- **Problem:** Nothing in the database stops a player from holding two prediction rows for the same game. If that
  ever happens, the empty duplicate gets a random generated score, counts toward switching the player off, and
  can be the row that is scored instead of the player's own.
  - Spot check: the double-click case in `TournamentRegistrationService::register` (`:79-107`) most likely ends in
    a 404 for the losing request, not duplicates. Its `firstOrFail()` runs on a REPEATABLE READ snapshot taken
    before the winner committed, so the transaction rolls back.
  - Duplicates remain possible from concurrent seeding: import versus registration, or game insert versus
    registration (`PredictionRows::seedMissing` reads, then inserts). So this is a guard, not an emergency.
- **Fix:**
  - First, a data migration that removes duplicates. For each table, keep the row that has a score; otherwise the
    lowest id.
  - Then add `unique(['user_id','game_id'])` on `prediction_results`, and `unique(['user_id','team_id'])` on
    `prediction_standings` and `prediction_survivals`.
  - Also add `unique(['user_id','event_id'])` on `prediction_survivals` (NULLs do not collide),
    `unique(['user_id','event_id'])` on `point_survivals`, `unique('game_id')` on `game_odds`, and
    `unique('user_id')` on `user_settings`.
  - Change `seedMissing()` to `insertOrIgnore($missing)`.
  - Deploy after issue 14.
- **Stored points:** Only if P2 finds duplicates. Then recalculate, and tell the parity oracle which rows were
  merged.
- **Production check first:** **Yes, P2.** Every unique key needs a clean table first.

### Issue 16 - Usernames are unique

- **Severity:** Low
- **Findings:** S8 = D12 (the case question is answered by the MySQL collation)
- **Tracking:** Not tracked.
- **Problem:** A player can rename themselves to another player's exact name and look identical on every table.
  Registration already refuses a taken name, so uniqueness is clearly intended.
- **Evidence:** `UserProfileController.php:31-36` has no `unique` rule. There is no unique index. The Google
  sign-up (`GoogleAuthController.php:96`) takes the email's local part without checking.
- **Fix:**
  - Add `Rule::unique('users','username')->ignore($user->id)` to the profile rules.
  - Add a suffix loop to the Google sign-up.
  - Add a unique index after removing duplicates. Under `utf8mb4_unicode_ci` it is automatically case- and
    accent-insensitive, the same way registration's `exists()` check compares.
- **Stored points:** No.
- **Production check first:** **Yes, P12.**

### Issue 17 - Refresh the session context on every signed-in request

- **Severity:** Medium
- **Findings:** W4
- **Tracking:** Not tracked.
- **Problem:** The current round, tournament, "standings locked" flag and admin level are refreshed only when the
  player opens the dashboard (or a reminder link). Everything else can run on hours-old values. After the
  session expires, deep links send players to the hub and admins to the home page. CLAUDE.md says this refresh
  happens "on every authenticated page load"; it does not.
- **Evidence:** `SessionController::setSession` is called only from `MainController.php:38` and
  `PredictionResultController.php:385`.
- **Fix:**
  - Add a middleware on the `auth` group that calls `setSession()` when the session lacks `userID`/`tournamentID`,
    and re-derives `eventID` on every request (one cheap query).
  - Or, to keep it minimal, make the middleware call `setSession()` on every GET page.
  - Issues 2 and 3 do not depend on this.
- **Stored points:** No.
- **Production check first:** P14 (`SESSION_LIFETIME`).

### Issue 18 - League pages count the league's tournament only

- **Severity:** Medium
- **Findings:** R24 = the league-page part of Q5, + W25 + R23
- **Tracking:** R23 is tracked in #213 (open; MainController's third streak rule). The rest relates to #226 and
  #227 (closed), which fixed the league table and rank history only.
- **Problem:** A player in both the World Cup and Euroleague sees a chart, compare totals, standings summary,
  results summary, activity feed and dashboard "current serija" that mix both tournaments. They disagree with
  the league table beside them. CLAUDE.md > Leagues: "everything it shows counts that tournament only".
- **Evidence:**
  - `PredictionResultController.php:414-435`
  - `ChartController.php:30,59`
  - `CompareController.php:57-66`
  - `PredictionStandingController.php:181,202-245` (`Team::all()`)
  - `PointController.php:283-309`
  - `MainController.php:210-247`
  - `ActivityFeedController.php:30-55,107-119`
- **Fix:**
  - Add `events.tournament_id = league.tournament_id` (or `teams.tournament_id`) to each query.
  - For the dashboard serija, walk with `StreakWalker` so that a missing row breaks the run.
  - Admin lists are out of scope here (issue 20).
- **Stored points:** No. Display only.
- **Production check first:** No.

### Issue 19 - The predictions page shows the current tournament, with each game's own score limits

- **Severity:** Medium
- **Findings:** W20, + the round-dropdown part of Q5
- **Tracking:** Not tracked.
- **Problem:** Choosing "Visi etapai" lists every tournament's games. The score boxes then apply the session
  tournament's limits, so a Euroleague player cannot type a normal football score on their old football games.
- **Evidence:** `PredictionResultController.php:33-55,64-67`; `prediction/results.blade.php:5-30`.
- **Fix:**
  - Filter games and the round dropdown by the session tournament.
  - Render each row's min/max and draw rule from `ScoreFormat::forGameId` of that game.
- **Stored points:** No.
- **Production check first:** No.

### Issue 20 - Admin round, team, game and league forms are tied to an explicit tournament

- **Severity:** Medium
- **Findings:** W9 + W10 + D31
- **Tracking:** Related #30 (closed; writes attaching to tournament 1).
- **Problem:**
  - A new round, team or league goes into whichever tournament the admin's session names. Nothing on the form
    shows which one that is.
  - The game form lists every tournament's teams by name, so "Spain" from two tournaments looks the same. A
    mis-click links a game to the wrong tournament's team.
  - Creating a league with no session tournament ends in a database error page.
- **Evidence:**
  - `EventController.php:35`, `TeamController.php:41`, `LeagueController.php:64-78`
  - `GameController.php:34-80`, `admin/games.blade.php:82-105,139-140`
- **Fix:**
  - Add a visible tournament select to the round and team forms, prefilled from the tournament context. Refuse a
    save with no tournament.
  - In the game form, filter teams by the chosen round's tournament. Server side, refuse a game whose two teams
    and round are not all in the same tournament.
  - League creation: refuse when there is no tournament, and write the league and its owner membership in one
    `DB::transaction`. Do the same for a tournament and its public league in `TournamentController::adminStore`.
- **Stored points:** No.
- **Production check first:** P17, as a sanity check for games already crossing tournaments.

### Issue 21 - The admin teams page shows one tournament at a time

- **Severity:** Medium
- **Findings:** W11
- **Tracking:** Not tracked.
- **Problem:** The teams page posts every team of every tournament on each save, finished tournaments included.
  Past PHP's form-field limit, later rows are silently not saved.
- **Evidence:** `TeamController.php:19-27,67-99`; `admin/teams.blade.php:14-92`.
- **Fix:** Scope the page and the save to the context tournament: `Team::where('tournament_id', $id)`, and save
  only posted ids that belong to it.
- **Stored points:** No.
- **Production check first:** P14 (`max_input_vars`, and the total number of teams).

### Issue 22 - Admin result entry checks the penalty winner and confirms early results

- **Severity:** Low
- **Findings:** S16 = the admin half of D30, + D25
- **Tracking:** Related #20 (closed).
- **Problem:**
  - A mistyped penalty-winner id scores every knockout prediction of that game as "wrong team".
  - Entering a result on a game that has not kicked off yet immediately locks it, fills random predictions for
    everyone who has not predicted, and can switch players off.
- **Evidence:** `ResultController.php:53-54`; `UpdateResultRequest.php:15-21`.
- **Fix:**
  - Add `'gameWinnerID' => ['nullable','integer']` to the request, and `Rule::in([home_team_id, away_team_id])`
    once the game is loaded.
  - On the results page, ask for a JS `confirm()` before saving a score for a game whose kick-off is in the
    future. Legitimate early entries are still possible.
- **Stored points:** No.
- **Production check first:** No.

### Issue 23 - The survival page and the dashboard pop-up show refusals

- **Severity:** Low. Medium together with X1.
- **Findings:** W13, + the dashboard half of W14
- **Tracking:** Partly fixed in #212 (closed): the server now answers "refused", but these two pages never read
  the answer.
- **Problem:**
  - When the survival pick is refused, the page still shows the new team. Combined with X1, the player believes
    they have a pick when they have none.
  - The dashboard's quick-predict pop-up hides every error, so a refused save looks saved.
- **Evidence:** `prediction/survival.blade.php:232-245`; `partials/games.blade.php:371-445`.
- **Fix:** On a failed or `success: false` response, restore the stored pick (or score) and show the server's
  `message`, as `prediction/results.blade.php` does.
- **Stored points:** No.
- **Production check first:** No.

### Issue 24 - Survival summary rounds: flagged survival rounds, in playing order

- **Severity:** Low
- **Findings:** R19 = Q4, + W21
- **Tracking:** Related #31 (closed; the `events.id` range).
- **Problem:**
  - The survival summary shows rounds with rate 1, not the rounds flagged for survival. A rate-2 survival round
    counts on the league table but gets no column.
  - "Rounds up to now" is decided by round id, so a round added out of order is hidden or shown too early.
- **Evidence:** `PredictionSurvivalController.php:136-143`; `PointSurvivalController.php:76-79`;
  `PredictionResultController.php:318-319`.
- **Fix:** Filter on `event_survival = 1`, and compare `event_day` (or the first game's date) instead of the id.
- **Stored points:** No.
- **Production check first:** P16.

### Issue 25 - "Correct winners" on Lyderiai uses the full-correct rule

- **Severity:** Low
- **Findings:** R25
- **Tracking:** Related #127 (closed; a hard-coded 5).
- **Problem:** The Lyderiai "correct winners" count also includes half-credit knockout calls and random generated
  predictions. CONTEXT.md says a partial call must not be called correct.
- **Evidence:** `MainController.php:116-140` counts `winner_points >= winner_bonus`.
- **Fix:** Count with `SerijaCorrectness::isFullyCorrect`, which also excludes generated rows.
- **Stored points:** No.
- **Production check first:** No.

### Issue 26 - Admin messages with no league reach every league

- **Severity:** Low
- **Findings:** W16
- **Tracking:** Not tracked.
- **Problem:** A message sent with the blank "- lyga -" option is shown to nobody, even though the code's own
  comment says it is for every league.
- **Evidence:** `MessageController.php:22-26` against its docblock at `:193-198`.
- **Fix:** Use `where(fn ($q) => $q->where('league_id', $id)->orWhereNull('league_id'))` on the dashboard.
- **Stored points:** No.
- **Production check first:** P19. Old league-less messages would suddenly appear, so check what they say first.

### Issue 27 - Admin and import output hardening

- **Severity:** Low. Security, so do it early.
- **Findings:** S13 + S14 + S17
- **Tracking:** Not tracked.
- **Problem:**
  - A team name containing a script tag, from the Euroleague feed or an admin edit, runs as code in every admin's
    browser on the games page.
  - A malicious feed could also write a file outside the crest folder, publish a scripted SVG, or make the server
    fetch an arbitrary URL.
- **Evidence:** `admin/games.blade.php:141-143` uses `{!! ...->toJson() !!}`. `TeamCrestDownloader.php:36-97`.
- **Fix:**
  - Replace the three `{!! !!}` with `@json(...)`.
  - In `baseName()`, refuse `/`, `\`, `..` and NUL, and wrap the result in `basename()`.
  - Drop `image/svg+xml` from downloads.
  - Allow-list the Euroleague CDN hosts.
  - Add a comment in `.env.testing` saying its key is test-only (S17).
- **Stored points:** No.
- **Production check first:** No.

### Issue 28 - Input validation on ids and counts

- **Severity:** Low
- **Findings:** The rest of S15, + D17's `teamCount` bound
- **Tracking:** Related #253 (closed; fixed the same class of bug in `deleteUser`).
- **Problem:** Several admin and league endpoints take ids without validating them. A superadmin typo in
  `teamCount` loops without limit. Declining an invite ignores its status.
- **Evidence:** `LeagueController.php:142,160`; `UserController.php:46,57`; `TeamController.php:32`.
- **Fix:**
  - Validate `inviteID`, `userID` and `leagueID` as `required|integer`, and `teamCount` as
    `required|integer|min:2|max:64`.
  - In `declineInvite`, add `->where('status','pending')`.
- **Stored points:** No.
- **Production check first:** No.

### Issue 29 - A new account is never registered into a tournament whose registration has closed

- **Severity:** Low
- **Findings:** S9, + the deadline half of W17
- **Tracking:** Related #109 (closed).
- **Problem:** Signing up while any tournament is open can put the new player into a different tournament that
  has already started. They then hold empty rows for games that are already locked.
- **Evidence:** `PostRegisterController.php:131-171` ("The deadline is not re-checked here"); the same path runs
  from `GoogleAuthController.php:104`.
- **Fix:** In `resolveIntendedTournament()`, accept only a tournament for which
  `TournamentRegistrationService::isOpenForRegistration()` is true: the intended one first, then the fallback. If
  none is open, register the player into nothing. Which tournament is the default is question 11.
- **Stored points:** No.
- **Production check first:** No.

### Issue 30 - Account creation is atomic and reports real errors

- **Severity:** Low
- **Findings:** D15 (atomicity) + D26
- **Tracking:** Not tracked.
- **Problem:**
  - A failure between creating the user and creating their settings leaves an account whose every visit fails.
  - Any database error during sign-up is reported to the user as "email or username taken", after their code has
    already been used up.
- **Evidence:** `RegisteredUserController.php:191-211,237-260`; `GoogleAuthController.php:90-104`.
- **Fix:**
  - Put `User::create`, `insertUserSettings` and `register()` in one `DB::transaction`.
  - Catch only `UniqueConstraintViolationException` as "taken", and rethrow everything else.
- **Stored points:** No.
- **Production check first:** P3.

### Issue 31 - Reminders: no overlapping runs, deleted users skipped, a moved game reminded again

- **Severity:** Low
- **Findings:** D21 + the `reminded_at` half of D22
- **Tracking:** Related #230 (closed).
- **Problem:**
  - A slow mail run overlaps the next one, and players get the same reminder twice.
  - One user deleted mid-run stops the whole run.
  - A game the importer moves to a later date never gets its reminder.
- **Evidence:** `routes/console.php:10`; `SendPredictionReminders.php`; `EuroleagueScheduleImporter.php:254-258`.
- **Fix:**
  - `->withoutOverlapping(30)` on the schedule.
  - `User::find` plus `continue` instead of `findOrFail`.
  - In the importer, null `reminded_at` for that game's rows when its date changes.
- **Stored points:** No.
- **Production check first:** P22. `withoutOverlapping` needs a shared cache store.

### Issue 32 - The dashboard's "today" is the Vilnius day

- **Severity:** Low
- **Findings:** D29
- **Tracking:** Not tracked.
- **Problem:** A game after 21:00 Vilnius time drops off the dashboard at 03:00 local time, not at midnight.
- **Evidence:** `MainController.php:63` uses `now()->toDateString()`, which is the UTC date.
- **Fix:**
  - Use `now('Europe/Vilnius')->toDateString()` for the display cut-off. Leave the connection time zone alone.
  - Add `'timezone' => '+00:00'` to the MySQL connection only if P13 shows the server is not already UTC, and
    only after checking that the TIMESTAMP columns read back unchanged.
- **Stored points:** No.
- **Production check first:** P13.

### Suggested order

1. Security, in this order: issues 1, 2, 3 (with 23), 27, 7, 8, 9.
2. Result entry: issue 5. Run P1 today.
3. Before any schema change: issue 14, then 15 and 16, after P2 and P12.
4. Data integrity: issues 4, 12, 10 and 13, 11 (with #216), 30.
5. Admin correctness: issues 6, 20, 21, 22.
6. Everything else: issues 17, 18, 19, 24, 25, 26, 28, 29, 31, 32.

Issues 10 and 11 change stored points. Batch them into one recalculation on production, and send one
notification to the sportbet_new parity oracle.

---

## 2. Questions for the owner

29 questions, ordered by how much they affect players. Each one stands on its own. "Recommended" is my suggestion,
not a decision.

**Q1. Should a random filled-in prediction earn winner points?**
Today, when a player forgets to predict, the site fills in a random score at kick-off. If that random score
happens to name the right winner, the player gets winner points anyway: 5 in football, 50 in Euroleague. The
rules page says a filled-in prediction earns no winner points. In a football knockout it is worse. Example: a
filled-in 0-0 in a tie decided on penalties earns 8.30, more than a player who genuinely called a group game
right.
- (a) No winner points for filled-in predictions, in any game. This matches the rules page. **Recommended:** it
  stops absent players being paid for luck. Everyone's past points change, so a full recalculation is needed.
- (b) Keep the flat base points (5 or 50) but no crowd bonus, and cap knockout half-credit at 2.50. The rules page
  would be rewritten to say so.
- (c) Keep today's numbers and change the rules page to match.
- Relates to: open #214; inventory Q1.

**Q2. Should random filled-in predictions count when the site works out the crowd odds?**
The bonus for a correct call depends on how many players picked the same result. Today the random predictions
for absent players are counted as if they were real votes. Example: 8 of 10 real players pick a home win, so a
correct home call pays 6.60. Five absentees get random picks, and it now pays 7.90. The odds panel players see
before kick-off does not include those random votes, so what they see differs from what they are paid.
- (a) Count only real predictions. **Recommended:** the odds then mean "how the players voted", and the panel
  matches the payout. This changes past points.
- (b) Keep counting them, and say so on the rules page.
- Relates to: R3.

**Q3. After your survival team's game has started, can you still switch to another team?**
Today you can. Example: you pick A, which plays Tuesday. At half-time A is losing, so you switch to B, which plays
Thursday. A loses, but because your pick is no longer on A, you are not knocked out. This works right up until
the admin types in A's result.
- (a) No. Once your picked team's game starts, your pick is locked for that round. **Recommended:** it is the only
  version that cannot be gamed.
- (b) Yes, you may switch until your picked team's result is entered (today's behaviour).
- (c) Yes, but only if the new team's game has not started either.
- Relates to: W1, R4. Issue 3 already stops picking a team whose game has started.

**Q4. When an admin enters a wrong result and fixes it minutes later, what happens to the side effects?**
A result entered by mistake has immediate effects. Players who picked the "losing" team in survival are knocked
out and their whole run is wiped. Everyone who had not predicted gets a random prediction, which can count toward
switching them off. When the admin corrects the score, none of this is undone. Example: the admin types 80-78
instead of 78-80. All away-team survival pickers lose their run for good, and after the correction the home-team
pickers lose theirs too.
- (a) A correction replays the game as if the mistake never happened. Survival picks are kept as history instead
  of being wiped, and random predictions made because of the mistake are removed. **Recommended:** the most
  correct option. It needs a data change: survival picks must stop being deleted.
- (b) Survival knock-outs are restored, but random predictions stay. They would have been made at kick-off anyway.
- (c) Keep today's behaviour. The admin must be careful, and a backup is taken before correcting a survival
  result.
- Relates to: D7, R7, W2, R14, D8, inventory Q3.

**Q5. When exactly is a player "switched off" for not predicting?**
Today a player who has had 5 random predictions filled in, counted over every tournament ever, disappears from
all league tables. Any single save turns them back on. After that, one more missed game switches them off again,
because the count never resets. Example: 5 misses in the 2024 football deactivate a player. In the 2026
Euroleague they predict once, miss one game, and vanish from the Euroleague table mid-season.
- (a) 5 misses in the current tournament, with the count starting again in each tournament. **Recommended:** it
  fits how players join tournaments one at a time.
- (b) 5 misses in a row. Any real prediction resets the count.
- (c) Keep today's rule: lifetime, across all tournaments.
- Relates to: R13, inventory Q8.

**Q6. Is "an admin hid this player" the same as "this player stopped playing"?**
Both use the same switch today. So a player the admin hid comes straight back the moment they save a prediction.
A player the admin un-hides is hidden again at their next missed game.
- (a) They are separate: an admin hide stays until an admin undoes it. **Recommended:** otherwise the admin button
  does not really work.
- (b) They are the same thing (today's behaviour).
- Relates to: W15.

**Q7. If one game of a round is postponed, which round do players see?**
The app's "current round" is the round of the earliest game without a score. One postponed game, or a result
typed in late, keeps the whole app on the old round: the predictions page, the reminder badges, the survival pick
and the admin's results page. Example: in a Euroleague double-round week, round 8 has one postponed game. Players
opening the site see round 8, do not notice that round 9's games start tonight, and get random predictions for
them.
- (a) The round whose next game starts soonest. **Recommended:** it matches what players need to do next.
- (b) The earliest round with an unplayed game (today).
- (c) Show both rounds whenever the next round has started.
- Relates to: W3; #3 (closed) made the choice deterministic but did not change the rule.

**Q8. When a game is postponed and the Euroleague import moves it later, should predictions reopen?**
Today the import moves the game, so predictions reopen, even if the game had kicked off by the clock and players
had already seen each other's predictions.
- (a) Reopen only if the original kick-off had not yet passed. Otherwise keep it locked with the old predictions.
  **Recommended.**
- (b) Always reopen (today).
- (c) Never move a game that has already started. The admin handles it by hand.
- Relates to: D22.

**Q9. How is a football knockout won in extra time recorded?**
The site has no separate "after extra time" option. The admin enters either the final score (2-1) or the 90-minute
draw (1-1) plus the team that went through, and the two score differently. Example: a player predicted 2-1 home.
If the admin enters 2-1, the player gets full points plus the exact-score bonus. If the admin enters 1-1 with home
going through, the player gets half points and no exact-score bonus.
- (a) Enter the score after extra time, as a normal win. Only penalties count as "went to a shoot-out".
  **Recommended:** it is the common convention and the simplest to enter.
- (b) Enter the 90-minute score plus the team that went through.
- Relates to: R12; #20 (closed) is related.

**Q10. What happens to a half-filled prediction?**
If a player types a home score but leaves the away score blank, the game kicks off and the row scores nothing. It
is not filled in, and their serija breaks. If only the home score is blank, the random fill overwrites the away
score they did type.
- (a) Refuse to save a half-filled prediction, so the page says "enter both scores". **Recommended.**
- (b) Treat it as no prediction and fill in both scores at kick-off.
- (c) Keep the half the player typed and fill in only the missing half.
- Relates to: R15.

**Q11. A new player signs up from the front page without choosing a tournament. Where do they go?**
Today they go into the tournament named in their sign-in link, or else the newest tournament marked "active" (or
else the newest one of all). That can be a tournament that has already started.
- (a) The open tournament whose first game is soonest. If none is open, no tournament: they choose on the hub.
  **Recommended.**
- (b) Always no tournament. They choose on the hub.
- (c) Keep today's rule, but never a started tournament (issue 29 does that part anyway).
- Relates to: W17; #109 (closed).

**Q12. Can a friend join a Euroleague season after round 1?**
The rules contradict each other. Registration closes when the tournament's first game starts. But the standings
deadline for Euroleague is round 5, "so somebody who joins in round 2 can still predict". Today nobody can join
in round 2.
- (a) For Euroleague, keep registration open until the standings deadline (round 5). **Recommended:** it is what
  the round-5 deadline was for.
- (b) Registration closes at the first game for every tournament (today). The round-5 wording is then removed.
- Relates to: R18; #129 (closed).

**Q13. Accepting an invite to a private league for a tournament you have not joined.**
Today anyone can be invited into a private league. Accepting makes them a league member with nothing to predict,
and the site then treats them as already registered, so the register button disappears. They are stuck.
- (a) Accepting also registers them for that tournament, if registration is open. **Recommended.**
- (b) The invite is refused until they register themselves.
- (c) Invites are only offered to players already in that tournament.
- Relates to: S10, D23, W5.

**Q14. Can a survival round be re-picked after a draw?**
In football survival, a draw keeps you in but leaves the round open, so you can pick another team later in the
same round and still win it. This only matters if football survival is ever switched on again.
- (a) After a draw, the round is over for you and the drawn team counts as used. **Recommended.**
- (b) You may re-pick (today).
- Relates to: R21; #228 and #179 (closed).

**Q15. In survival, can each team be used only once per run?**
The page shows your "unused" teams, which suggests yes, but no rule says it, and the server lets you pick a team
you already used. Doing so quietly moves that team's earlier pick to the new round.
- (a) Yes, once per run. Picking a used team is refused. **Recommended:** it is what the page already tells
  players.
- (b) No limit.
- Relates to: S3(f).

**Q16. When should standings points be recalculated?**
Standings points change only when a top admin presses a separate button. So after the admin ticks Spain into the
quarter-final, the table shows 0 for Spain until someone remembers. Later standings edits, or a deleted account,
also leave everyone's standings points stale.
- (a) Automatically, whenever team outcomes are saved and inside "recalculate all". **Recommended.**
- (b) Keep the manual button.
- Relates to: R10, inventory Q17; open #198.

**Q17. Who counts as "everyone" in the standings crowd bonus?**
The standings bonus grows when few players made the same call. Today "everyone" means only players who ever
clicked something on that team's row. Example: 20 players; 5 tick team X for the quarter-final, 5 opened X's row
without ticking, 10 never touched it. Today the 5 get 18.00. Counting all 20 players, they would get 27.00.
- (a) Every player with a standings prediction in the tournament. **Recommended:** it does not depend on
  accidental clicks. This changes past standings points.
- (b) Keep today's rule and write it into the rules page.
- Relates to: R11, inventory Q14; open #92.

**Q18. Which total ranks players on the public "Lyderiai" and the hub's top 5?**
The league table adds match, serija, standings and survival points. Lyderiai, the hub's top 5 and the welcome
panel add only match and serija. Example: A has 100 match + 30 standings = 130, and B has 110 match. The league
table shows A first; the hub's top 5 for the same tournament shows B first.
- (a) One total everywhere: the league-table total. **Recommended.**
- (b) Keep two totals, and label the Lyderiai one ("match points").
- Relates to: R32, inventory Q16.

**Q19. Should finished tournaments be frozen?**
Both "recalculate" buttons rescore every tournament ever played, using today's rules. Example: pressing the
standings button rewrites last season's standings points under this season's Euroleague scale.
- (a) Frozen. Recalculation only touches tournaments that are not finished. **Recommended.**
- (b) Always rescored under current rules (today).
- Relates to: R30; open #92.

**Q20. Should changing your email address need a code sent to the new address?**
Today anyone using a signed-in browser can change the account's email instantly. After that, sign-in codes go to
the new address, and the real owner cannot get back in. A typo locks an honest player out the same way.
- (a) Yes. A code goes to the new address, and the change applies only once it is entered. A notice goes to the
  old address. **Recommended:** a mistyped address is otherwise a permanent lock-out.
- (b) No (today).
- Relates to: S4.

**Q21. What should deleting an account erase?**
Issue 4 makes self-deletion work. The open part is the history. Today admin deletion erases the audit trail (who
changed which prediction, and sign-in records). Leagues the player owned are kept with no owner.
- (a) Erase the audit trail with the account, and hand an owned league to its longest-standing member.
  **Recommended:** privacy-friendly, and leagues keep an admin.
- (b) Keep the audit trail anonymised, and keep owned leagues without an owner (today).
- (c) Also delete the leagues they owned.
- Relates to: D6, inventory Q10, D28 (how long audit rows are kept).

**Q22. What may each admin level do?**
There are levels 1, 5, 8 and 9. Level 1 is valid but cannot be chosen in the form. Level 8 can promote itself to
9 with one click, so it is really level 9. It is also unclear whether a lower admin who also plays may edit a
game's date or result, which could reopen their own prediction.
- (a) Three tiers: editor (enters results only), admin (plus games, rounds and teams), top admin (plus users and
  recalculation). Remove self-promotion. Only top admins may edit a game that has started. **Recommended.**
- (b) Keep today's levels, and just remove self-promotion.
- Relates to: inventory Q9, C23, C24, S7, S15.

**Q23. When does a tournament count as finished?**
Today a tournament shows as "finished" as soon as every game entered so far has a score, even if its end date is
weeks away. Example: after the last group game, and before the admin adds the round of 32, the World Cup jumps to
"Pasibaigę" and stops taking registrations.
- (a) Finished only when its end date has passed and every game is scored. **Recommended.**
- (b) Keep today's rule.
- Relates to: W18; #50 (closed).

**Q24. A player plays in two tournaments at once. Which one do they see after signing in?**
Today it is whichever membership the database happens to return, and it can change from one sign-in to the next.
- (a) The one they used last. **Recommended.**
- (b) The one with the next game.
- Relates to: W19.

**Q25. "You cannot leave your only league": per tournament, or overall?**
Today a player with a private league in Euroleague and nothing else there can leave it, as long as they have any
league in any other tournament.
- (a) Per tournament: you always keep at least your public league in each tournament you play. **Recommended.**
- (b) Overall (today).
- Relates to: inventory Q7.

**Q26. Can a league owner hand the league to someone else?**
An owner who tries to leave is told "hand the league to another member first", but the app has no way to do that.
Owners can only delete the league.
- (a) Add "make this member the owner". **Recommended.**
- (b) Owners cannot leave. Remove the misleading message.
- Relates to: W22.

**Q27. On the rank history chart, when do standings and survival points count?**
Today they are added to every past game, as if earned from game one. So a late standings recalculation rewrites
everyone's past ranks and the up/down arrows.
- (a) From the moment they were earned. **Recommended:** the history then does not change after the fact.
- (b) Added throughout (today).
- Relates to: W26.

**Q28. How are points rounded to cents?**
Half-credit knockout points can have three decimals, for example 3.975. The database rounds this to 3.98, but the
test database keeps 3.975, so the two can disagree.
- (a) Round half up to 2 decimals, after the round's rate is applied, for match points; 4 decimals for standings.
  **Recommended:** it matches what production already stores.
- (b) Another rule (please say which).
- Relates to: D24, R27, inventory Q15; #220 (closed).

**Q29. Two players tie. In what order are their names listed?**
The league table sorts tied names letter by letter, so "Šarūnas" comes after "Saulius". Lyderiai uses the
database's order, which treats "Š" as "S".
- (a) Lithuanian alphabetical order ("Š" after "S"), everywhere. **Recommended.**
- (b) Whatever order each page uses today.
- Relates to: R31, inventory Q19.

The inventory's remaining questions are about sportbet_new itself, not the old app: Q3 (parity check for broken
survival runs), Q18 (hidden tournaments) and Q20 (backup redaction). They are carried in part 3.

---

## 3. Not worth fixing in the old app

- S17 `.env.testing` key: informational; issue 27 adds a comment.
- D17 = Q13: new teams seed only the admin's rows. The team-insert page is unreachable once any team exists (C16).
- D18: `/main` recomputes rank history twice. Revisit only if players report slowness; the rebuild handles it.
- D16(c): unique on games (event, home, away). The importer already de-duplicates; P17 shows whether it matters.
- D16(d): one public league per tournament. It needs a generated column on MySQL; P18 shows whether it matters.
- D27: CHECK constraints and the BLOB `generated` column. The rebuild types these properly.
- D28: audit and login-code pruning. It follows Q21; tables are small at this scale.
- R9: admin edits (rate, date, format) do not flag a recalculation. Document it on the admin page; the rebuild
  recalculates automatically.
- R22: which game pays in a survival double-header, home 10 or away 12. Euroleague rounds are single games;
  carried into the rebuild.
- R26: a wrong Euroleague playoff call stores odds 0; a group call stores the predicted odds. Keep for parity.
- R28: rate-0 rounds break every serija. P16 shows whether any exist; if none, cap the admin form at `min:1`
  during another change.
- R29: a knockout draw is scored before the penalty winner is entered. Self-corrects on the re-save.
- W14: three separate score-save paths. Only the dashboard half is in issue 23; one save component is for the
  rebuild.
- W23: account id 1 is always top admin. Carried into the rebuild.
- W24: the survival page says "game over" on a round without survival. Wording; decide in the rebuild.
- H1-H13 and C1-C25 (inventory section 4): dead code and data. Leave the old app alone; the rebuild does not
  port them.
- H8 = #215 (open): `odds_points` is always 0. Leave as is.

## 3b. Carry into sportbet_new (Phase 2 must specify these deliberately)

- The lock is checked on the row's own game, and standings on the row's own tournament. No request-supplied
  context decides a write. (Issues 1-3; decision on survival: questions 3 and 15.)
- No round, tournament or admin level cached in the session. Derive them per request. (W4, W19)
- Survival picks are history rows that are never nulled, so every run can be recomputed. Needed for parity
  (inventory Q3) and for question 4.
- One idempotent survival computation shared by the per-game and full passes (#216, R5, R6, R22), with a
  deterministic double-header rule.
- The recalculation as a module (#198). It is scoped per tournament, runs in the background with a lock, and is
  triggered by admin edits that change inputs (R9, R10). Finished tournaments are frozen per question 19.
- Result corrections and clears: defined undo semantics for points, generated rows and survival (D8, D25, R14,
  question 4).
- Generated predictions: whether they earn a bonus (question 1), count in the odds (question 2), and who is
  eligible at which moment (R14).
- Deactivation as its own concept, separate from an admin hide (questions 5, 6).
- One rank total and one username collation, chosen explicitly for Postgres (questions 18, 29).
- Rounding mode stated and applied in code, not left to the database column (question 28).
- Unique constraints from day one on every "one row per" relation (issue 15, D16).
- Tournament scoping for every league page and admin list (issues 18-21, inventory Q5).
- The current-round rule for postponed games (question 7), and postponement behaviour (question 8).
- The first admin is bootstrapped explicitly, not "user id 1" (W23).
- Hidden tournaments (inventory Q18): either implement `is_public`, or drop it.
- Backup redaction policy (inventory Q20).
- Parity oracle: expect differences wherever the owner changes a rule above (questions 1, 2, 17, 19) and wherever
  issues 10, 11 or 15 changed stored rows. Record which production snapshot was taken before and after those
  recalculations.

---

## 4. Production facts to check (read-only)

Run against production MySQL (HeatWave), or a fresh copy of it.

**P1. How many point_results rows are there?**
```sql
SELECT COUNT(*) FROM point_results;
```
Issue 5: result entry fails at about 21,845 rows. It also says how urgent that issue is.

**P2. Are there duplicate rows where the code assumes one?**
```sql
SELECT user_id, game_id, COUNT(*) FROM prediction_results GROUP BY user_id, game_id HAVING COUNT(*) > 1;
```
Repeat for `prediction_standings(user_id, team_id)`, `prediction_survivals(user_id, team_id)`,
`prediction_survivals(user_id, event_id) WHERE event_id IS NOT NULL`, `point_survivals(user_id, event_id)`,
`game_odds(game_id)` and `user_settings(user_id)`.
Issue 15: each unique key needs a clean table, and any duplicates found need a merge rule first.

**P3. Are there accounts with no settings row?**
```sql
SELECT u.id, u.email FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE s.id IS NULL;
```
Issues 4 and 30: these are accounts already stranded by a failed deletion or a failed sign-up.

**P4. Which foreign keys point at users, and what do they do on delete?**
```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'users';
```
Issue 4: production's schema came from a Hostinger dump, so its real delete rules may differ from the migrations.

**P5. Is the legacy survival audit table empty?**
```sql
SELECT COUNT(*) FROM audit_prediction_survival;
```
Issue 4 and C1: if it has rows, deletion must clear them; if it is empty, the table can be dropped in the rebuild.

**P6. Were match predictions edited after kick-off?**
```sql
SELECT pr.id, pr.user_id, pr.game_id, pr.updated_at, g.game_date
FROM prediction_results pr JOIN games g ON g.id = pr.game_id
WHERE pr.generated = 0 AND pr.updated_at > g.game_date;
```
Issue 1: shows whether the lock hole was used. Generated rows are written after kick-off by design, and are
excluded. Admin recalculation does not touch `prediction_results.updated_at`.

**P7. Were standings predictions edited after the deadline?**
Take `prediction_standings.updated_at` joined through `teams` to the tournament. Compare it with that tournament's
deadline: `MIN(games.game_date)` over events with `event_day >=` the tournament's deadline round.
Issue 2: shows whether that hole was used.

**P8. Were survival picks attached after their game kicked off?**
Take `prediction_survivals` with a non-null `event_id`, joined to that event's game for the team, where
`updated_at > game_date`.
Issue 3: indicative only. Picks nulled on a loss have lost their history.

**P9. Do stored kick-off times have minutes other than :00 or :30?**
```sql
SELECT COUNT(*), MINUTE(CONVERT_TZ(game_date, '+00:00', 'Europe/Vilnius')) m
FROM games GROUP BY m;
```
If the named time zone is not loaded, use `MINUTE(game_date)`. Vilnius is a whole-hour offset from UTC, so the
minute is the same either way.
Issue 6: shows how many games the editor would silently move.

**P10. Are there points for games that have no score?**
```sql
SELECT COUNT(*) FROM point_results pr JOIN games g ON g.id = pr.game_id
WHERE g.home_team_score IS NULL OR g.away_team_score IS NULL;
```
Issue 10: these are rows left behind by a cleared result.

**P11. Does any player have zero, or more than one, active league per tournament?**
Count active `league_members` per (user, `leagues.tournament_id`), where the count is not 1 among the players who
hold any membership in that tournament.
Issue 12: these players are stranded or doubled.

**P12. Are there duplicate usernames?**
```sql
SELECT username, COUNT(*) FROM users GROUP BY username HAVING COUNT(*) > 1;
```
Under the default collation this also catches case and accent twins.
Issue 16: the unique index cannot be added until these are resolved.

**P13. What time zone does the database use?**
```sql
SELECT @@global.time_zone, @@session.time_zone, @@system_time_zone;
```
Issue 32: whether TIMESTAMP columns are already stored and read as UTC.

**P14. What are the PHP and session limits in production?**
Read `php -i | grep -E 'max_input_vars|memory_limit|max_execution_time'` in the php container, `SESSION_LIFETIME`
in `prod.env`, and `SELECT COUNT(*) FROM teams`.
Issues 13, 17 and 21: the recalculation timeout, the session expiry, and the teams-page form-field limit.

**P15. What type are the standings points columns?**
```sql
SHOW COLUMNS FROM point_standings;
```
R27 and question 28: FLOAT versus DOUBLE changes standings precision, and the parity oracle's tolerance.

**P16. Are there rate-0 rounds, or survival rounds whose rate is not 1?**
```sql
SELECT id, tournament_id, rate, event_survival FROM events WHERE rate = 0 OR (event_survival = 1 AND rate <> 1);
```
Issue 24 and R28: whether the summary is hiding rounds today, and whether rate 0 is used at all.

**P17. Is any game duplicated, or linked to another tournament's team?**
Games with duplicate (event_id, home_team_id, away_team_id), and games whose teams' `tournament_id` differs from
their event's `tournament_id`.
Issue 20 and D16(c): damage already done by the unscoped admin forms.

**P18. Does any tournament have more than one public league?**
```sql
SELECT tournament_id, COUNT(*) FROM leagues WHERE is_public = 1 GROUP BY tournament_id HAVING COUNT(*) > 1;
```
D16(d) and issue 12: which league displaced members should go to.

**P19. Are there messages with no league?**
```sql
SELECT id, created_at, LEFT(message, 80) FROM messages WHERE league_id IS NULL;
```
Issue 26: these would become visible to every league once it is fixed.

**P20. How many players are switched off, and how many have 5 or more filled-in predictions?**
```sql
SELECT COUNT(*) FROM user_settings WHERE active = 0;
```
Plus, per tournament, the users with at least 5 generated predictions.
Question 5: shows how many players each option would bring back or hide.

**P21. Are HeatWave automatic backups and point-in-time recovery on?**
Not a query: check the OCI console or `oci mysql db-system get`.
Issue 14: the recovery point if a migration goes wrong.

**P22. Which cache store does production use?**
`CACHE_STORE` in `prod.env`, and `SELECT COUNT(*) FROM cache_locks` if it is `database`.
Issues 5, 13 and 31: `Cache::lock` and `withoutOverlapping` only work across requests on a shared store.

**P23. How many filled-in predictions earned winner points?**
Filled-in predictions (`generated = 1`) that earned winner points, split by group games and knockout games.
Question 1: shows how many points each option moves.

**P24. How many survival rows would a refold change?**
Survival rows whose value differs from a refold of the player's run in that tournament. Compute it offline with
`SurvivalRun::fold` on a copy.
Issue 11 and #216: shows how many stored survival rows are wrong today.
