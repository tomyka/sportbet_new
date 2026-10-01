# Phase 2 inventory: porting sportbet to sportbet_new

Prepared 2026-09-28 from a read-only pass over `D:\Projects\sportbet` (Laravel 12, `main`)
and `D:\Projects\sportbet_new\docs\decisions.md`. Nothing in either repo was changed.

Conventions used below:

- **P** = player-facing, **A** = admin, **X** = cross-cutting / no page of its own.
- Paths are relative to `D:\Projects\sportbet` unless they start with `sportbet_new/`.
- "CLAUDE.md > X" / "CONTEXT.md > X" points at the section of the old repo's rules docs that states
  the rule. Where a rule lives **only in code**, that is said explicitly - those are the places a
  rebuild would otherwise guess (see section 5).
- Size: **S** about a day or two of spec+plan+code, **M** under a week, **L** more than a week.

Scale of the old app, for calibration: ~16,400 lines of PHP in `app/` (47 controllers, 23 models,
12 services + 8 import/backup classes, 35 `Support` rule objects), ~9,000 lines of Blade across 96
templates, 631 translation keys per locale, 44 migrations, 130 test files including a golden master
(`tests/Support/GoldenScenario.php`, `tests/Fixtures/golden-points.json`).

---

## 1. Areas

The old app is organised by controller, not by area; the split below follows what a player or admin
actually does. Routes come from `routes/web.php` and `routes/auth.php`. Every route listed is live
unless marked; dead or unlinked routes are repeated in section 4.

### A1. Authentication, registration, sign-out (P, sensitive)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/login` | `login` | `AuthenticatedSessionController@create` - renders nothing; redirects to `/` with `auth_dialog=login` flashed, stores `?tournament=` as `intended_tournament` |
| GET | `/register` | `register` | `RegisteredUserController@create` - redirect, `auth_dialog=register` (throttle `register-page` 10/min/IP, guest) |
| POST | `/register` | - | `RegisteredUserController@store` - validates, mints a `registration` code, mails it, keeps answers in session `registration_pending`; creates nothing (throttle 3/min/IP) |
| POST | `/register/confirm` | `register.confirm` | `@confirm` - claims code, re-checks deadline and uniqueness in a transaction, creates `users` + `user_settings` + registration (throttle 5/10min/email, 15/10min/IP) |
| POST | `/register/cancel` | `register.cancel` | `@cancel` |
| POST | `/login/code` | `login.code.request` | `EmailCodeLoginController@request` - 8-digit code, 5-minute TTL, sent `afterResponse()` (throttle 3/10min/email, 10/10min/IP) |
| POST | `/login/code/verify` | `login.code.verify` | `@verify` (throttle 5/10min/email, 15/10min/IP) |
| POST | `/login/code/cancel` | `login.code.cancel` | `@cancel` |
| GET | `/auth/google` | `auth.google` | `GoogleAuthController@redirect` (Socialite) |
| GET | `/auth/google/callback` | `auth.google.callback` | `@callback` - match by `google_id`, then by email (links it), else create account if registration open |
| POST | `/logout` | `logout` | `AuthenticatedSessionController@destroy` |

- **Code:** `app/Http/Controllers/Auth/*`, `app/Services/OneTimeCodeService.php`, `app/Support/EmailIdentity.php`,
  `app/Support/AuthCodeStep.php`, `app/Support/ChecksRegistrationDeadline.php`, `PostRegisterController`,
  `UserSettingController::insertUserSettings` (user id 1 becomes admin 9), `app/Providers/AppServiceProvider.php`
  (all rate limiters), `app/Mail/LoginCodeMail.php`, `RegistrationCodeMail.php`, `app/View/Composers/AuthDialogComposer.php`.
- **Views:** `modals/main.blade.php` (the one sign-in dialog, included from `layouts/master`), `modals/login.blade.php`,
  `modals/register.blade.php`, `partials/auth/login-code-step.blade.php`, `partials/auth/register-code-step.blade.php`,
  `emails/login-code.blade.php`, `emails/registration-code.blade.php`.
- **Tables:** `users` (RW), `user_settings` (W), `login_codes` (RW), `audit_logins` (W: `code`, `google`, `register`, `register_google`),
  `sessions`, `league_members` + prediction rows (W, via registration into the tournament).
- **Rules:** CLAUDE.md > Authentication - there is no password (two doors only, every sign-in remembered, `/login` and
  `/register` render nothing, two-step registration and its four properties, purpose scoping, mail on the critical path,
  never queue the code); CLAUDE.md > Security (email identity, diacritic folding #41, re-check authority);
  CLAUDE.md > The sign-in dialog; CONTEXT.md > Registration.
- **External:** Google OAuth (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`), Resend mail.
- **Size: L** - small surface but security-critical, four code purposes, throttles, an in-page dialog flow that
  answers every step with `back()`, and the email-identity rule that Postgres collations will not give for free.

### A2. Tournaments hub, tournament page, registering for a tournament (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/` | `tournaments.hub` | `TournamentController@hub` - every tournament ordered by effective status, per card: participants, prediction count, top-5 (`PlayerTotals`), medal tally, next 3 open games, "register" button |
| GET | `/tournament/{slug}` | `tournament.show` | `@show` - public league table (`PointController::getAllUserPoints` at guest level 0), game history, medal tally |
| POST | `/tournament/{slug}/enter` | `tournament.enter` | `@enter` - puts tournament/league in session, to `/main` or back to show |
| GET | `/tournament/{slug}/register` | `tournament.register.form` | `@registerForm` (auth) |
| POST | `/tournament/{slug}/register` | `tournament.register` | `@register` (auth, `confirm` must be accepted) |
| GET | `/tournaments/exit` | `tournaments.exit` | `@exit` - forgets tournament/league |

- **Code:** `TournamentController`, `app/Models/Tournament.php` (`effectiveStatus`, `orderByEffectiveStatus`, `forVisitor`,
  `gameCensus`, `hasStarted`), `app/Services/TournamentRegistrationService.php`, `app/Support/PlayerTotals.php`,
  `app/Support/MedalTally.php`, `app/Support/TeamLogo.php`.
- **Views:** `tournaments/hub.blade.php` (307 lines), `tournaments/show.blade.php`, `tournaments/register.blade.php`,
  `partials/points.blade.php`, `partials/standings.blade.php`, `partials/rail-guest.blade.php`, `welcome.blade.php` (+ `WelcomeComposer`).
- **Tables:** R `tournaments`, `leagues`, `league_members`, `games`, `events`, `teams`, `point_results`, `prediction_standings`,
  `user_settings`; W `leagues` (public league `firstOrCreate`), `league_members`, `prediction_results`, `prediction_standings`,
  `prediction_survivals` (seeded rows).
- **Rules:** CONTEXT.md > Effective status, Registration; CLAUDE.md > Score formats (`Tournament::forVisitor()`),
  CLAUDE.md > Leagues (one active league per tournament).
- **Already in sportbet_new:** a basic `/` list and `/tournament/[slug]` page from the walking skeleton
  (`sportbet_new/apps/web/src/app/page.tsx`, `tournament/[slug]/page.tsx`) - not the full hub.
- **Size: M** - the hub card aggregates five queries; registration seeding is shared with admin and import.

### A3. Request context: who, which tournament, which league, which event (X)

Replaces `SessionController::setSession()` (`app/Http/Controllers/SessionController.php`), called on every
authenticated page load, which caches `userID, leagueID, guest, tournamentID, eventID, eventSurvival, eventRate,
disabled, standingsLocked, admin, resultAmount, locale, fee, survivalGame, navShow*` in the session.

- Decision 5 says the session holds the player only; everything else is resolved per request. The rules each key
  encodes must still be ported exactly:
  - current event = the event of the **earliest unscored game** of the tournament, `ORDER BY games.game_date`
    (CLAUDE.md > Session-driven state, issue #3); 0 when none is left, and several pages then fall back to the
    tournament's last event (`PredictionSurvivalController::resolveFinalEventID`).
  - `disabled` = first game of the tournament has kicked off (closes registration, reveals summary).
  - `standingsLocked` = `StandingsDeadline::hasPassed()`: min `game_date` over events with `event_day >= round`,
    round from `tournaments.standings_deadline_round` else format default (CLAUDE.md > Session-driven state;
    CONTEXT.md > Standings deadline).
  - membership resolution: the active membership in the chosen tournament wins, else any active one (`activeMembership`).
  - `navShowSurvival = event_survival == 1 && tournaments.survival_game`; `navShowSummary = started || any scored game`.
- **Code:** `SessionController`, `app/Support/NavVisibility.php`, `app/Support/StandingsDeadline.php`, `app/Http/Middleware/SetLocale.php`.
- **Size: M** - no page, but every other slice depends on it, and it is where the stale-session class of bugs is retired.

### A4. Formats: football | euroleague (X, domain)

One key, `tournaments.standings_format`, selects four config entries:

| Config | Reader | Governs |
|---|---|---|
| `config/standings.php` | `App\Support\StandingsFormat` | position scope (group/tournament), `position_max`, stages and counts, `min_teams`, `group_cap`, `final_places`, `enforce`, `position_points` base/step, `stage_points` (default map + per-format override), `prediction_deadline_round` |
| `config/scores.php` | `App\Support\ScoreFormat` | min/max/input_max, `draw_allowed`, generated-score distribution (`base`, `rolls`, `die`) |
| `config/points.php` | `App\Support\PointsFormat` | winner bonus, partial bonus, bingo, difference rule (`table`/`margin`) and base, `streak_step`, survival home/away win |
| `config/help.php` | `App\Support\HelpFormat` | match icon, help screenshots |

- **Rules:** CLAUDE.md > Standings formats, Score formats, Scoring logic (tables), Survival: what a surviving round pays;
  CONTEXT.md > Standings format, Score format, Points format. Unknown key falls back to `football` (`PointsFormat::make`).
- **Size: S** - pure data plus a closed union; decision 5 already requires exhaustive switches.

### A5. Match-result predictions (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/prediction/results` | `prediction.results` | `PredictionResultController@getPredictionResultsUser` - games grouped by `event_day` then Vilnius date; `?event=` filter |
| POST | `/prediction/results` | - | `@updatePredictionResultUser` - autosave, JSON `PredictionSaveResponse` with refreshed odds |
| GET | `/prediction/game/{gameID}` | `prediction.game.single` | `@showSingleGame` - single-game page linked from the reminder mail |

- **Behaviour on save:** refuse if `GameLock::isOpen` fails (kick-off passed or result entered); re-activate the player
  (`user_settings.active = true`, line 150); set `generated = 0`; write `audit_prediction_games` with old values when
  both scores are filled; recompute `game_odds` for the game (`GameOddsController::updateGameOdds`).
- **Validation:** `app/Http/Requests/UpdatePredictionResultRequest.php` - format bounds resolved from the **game**, blank allowed,
  draw refused for a drawless format.
- **Code:** `PredictionResultController`, `app/Support/GameLock.php`, `GamePredictionState.php`, `PredictionSaveResponse.php`,
  `TeamStatisticsController::prepareTeamStatistics` + `TeamRecord` (form guide on the dashboard cards), `ScoreFormat`, `PointsFormat::winnerPointsAt` (odds panel).
- **Views:** `prediction/results.blade.php` (345), `prediction/game-single.blade.php`, `partials/games.blade.php` (449), `partials/fixture-deck.blade.php`, `components/team-crest.blade.php`.
- **Tables:** RW `prediction_results`, W `audit_prediction_games`, `game_odds`, `user_settings.active`; R `games`, `events`, `teams`, `point_results`, `game_odds`.
- **Rules:** CONTEXT.md > Lock, Match result; CLAUDE.md > Score formats; CLAUDE.md > Time and the lock (UTC in DB, Europe/Vilnius display);
  CLAUDE.md > Knockout games (the prediction carries `game_winner_id` for a predicted draw).
- **Size: L** - the most-used page, autosave, knockout penalty-winner picker, odds panel, live odds recompute.

### A6. Standings predictions (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/prediction/standings` | `prediction.standings` | `PredictionStandingController@getPredictionStandingsUser` |
| POST | `/prediction/standings` | - | `@updatePredictionStandingsUser` - per-row autosave (position box, stage checkboxes, final place) |
| POST | `/prediction/standings/reorder` | `prediction.standings.reorder` | `@reorderPredictionStandingsUser` - whole permutation, one transaction, writes `group_position` only |

- **Code:** `PredictionStandingController`, `UpdatePredictionStandingRequest` (`rowConflicts()`), `ReorderPredictionStandingsRequest`,
  `app/Services/StandingsPredictionValidator.php`, `app/Support/StandingsRules.php`, `StandingsReorder.php`, `StandingsFormat.php`, `StandingsDeadline.php`.
- **Views:** `prediction/standings.blade.php` (686 lines: box for football, ladder with arrows / mouse drag / long-press touch drag, `#ps-live` announcements).
- **Tables:** RW `prediction_standings`; R `teams`, `games`, `events`, `tournaments`.
- **Rules:** CLAUDE.md > Standings formats (ladder, reorder invariants, focus follows the club, `aria-disabled`, enforce only for euroleague);
  CONTEXT.md > Standing, Standings deadline (reading others' predictions while open is intended).
- **Size: L** - two input models, accessibility behaviour documented as rules, deadline re-read on the write path.

### A7. Survival picks (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/prediction/predictionSurvival` | `prediction.survival` | `PredictionSurvivalController@getPredictionSurvivalUser` - the current event's games, which teams are still unused, the current run |
| POST | `/prediction/predictionSurvival` | - | `@updatePredictionSurvivalUser` - refuses with no live round, no team, or a round already scored (issue 231) |

- **Model of a pick:** one `prediction_survivals` row per (player, team of the tournament); `event_id` set = that team is used for that round.
  A loss nulls every `event_id` of that player **in that tournament** (`resetUserSurvivalSequence`).
- **Views:** `prediction/survival.blade.php` (renders only when `session('eventSurvival') == 1`).
- **Tables:** RW `prediction_survivals`; R `point_survivals`, `games`, `events`, `teams`.
- **Rules:** CLAUDE.md > Survival: what a surviving round pays (running total, loss stores 0, draw decides nobody,
  run per tournament, only drawless formats may switch it on); CONTEXT.md > Survival pick.
- **Size: M.**

### A8. Results entry and the recalculation pipeline (A)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/admin/results` | `admin.results` | `ResultController@getResultsCurrentRound` (session `eventID`) |
| GET | `/admin/resultsAll` | `admin.resultsAll` | `@getResultsAll` (every game of every tournament) |
| POST | `/admin/updateResult` | `admin.updateResult` | `@updateResult` - saves score and shoot-out winner (only kept on a draw), then `Recalculation::afterResultEntered` |
| GET | `/admin/recalculateAllGamePoints` | `admin.recalculateAllGamePoints` | `@recalculateAllGamePoints` (superadmin) - `Recalculation::all()` |
| GET | `/admin/updateStandingPoints` | `admin.updateStandingPoints` | `PointStandingController@updateStandingPoints` (superadmin) - truncates and rebuilds all `point_standings`, redirects to `/admin/teams` |

- **`afterResultEntered(game)` order is load-bearing** (`app/Services/Recalculation.php`): 1. `GeneratedPredictions::fillFor` (fill blank
  predictions of active players with a random format score, flag `generated`, deactivate players with >= 5 generated rows);
  2. survival for that game if the tournament plays it; 3. `game_odds` from the crowd; 4. `point_results` for that game;
  5. global `recalculateStreaks()`.
- **`all()`**: rescore every scored game (no generation, no odds), streaks, then `recalculateSurvivalPoints()` (fold over stored rows).
- **Code:** `ResultController`, `app/Services/Recalculation.php`, `GeneratedPredictions.php`, `GameOddsController`, `PointResultController`,
  `PointStandingController`, `PointSurvivalController`, `PredictionSurvivalController::updatePredictionSurvivalGame`, `app/Support/GeneratedScore.php`, `CrowdOdds.php`.
- **Views:** `admin/results.blade.php` (3-digit boxes, no format bounds), `admin/index.blade.php` (the recalc tiles).
- **Tables:** W `games` (scores, `game_winner_id`), `prediction_results` (generated rows), `user_settings.active`, `game_odds`, `point_results`,
  `point_survivals`, `prediction_survivals`, `point_standings`.
- **Rules:** CLAUDE.md > Recalculating scores; CLAUDE.md > Scoring logic; CONTEXT.md > Generated prediction, Points, Odds;
  CLAUDE.md > Score formats ("Bounds are not applied to admin-entered actual results").
- **Size: L** - this is the write path whose output the parity checker judges.

### A9. Scoring engine (X, domain - the heart of decision 3)

Pure rules, to live in `packages/domain`. Old locations and what they decide:

| Rule | Old code | Stated in |
|---|---|---|
| Group game: winner bonus `(1+odds) x bonus` if direction right; difference points; bingo; all x `events.rate` | `GameScorer::groupComponents`, `ScoringService::calculateGamePoints`, `PointsFormat::winnerPoints` | CLAUDE.md > Scoring logic |
| Football difference: `points_calculations` keyed `{min(abs(hd),7)}_{clamped signed ad}`, away sign flipped when home over-predicted, value / 2 | `ScoringService::getTablePoints` | CLAUDE.md > Scoring logic (the flip rule is **code only**) |
| Euroleague difference: `50 - abs(predDiff - actualDiff)`, unclamped, may be negative | `ScoringService::getMarginPoints` | CLAUDE.md > Scoring logic |
| Knockout: full / half (actual odds) / half for right-pens-wrong-winner / 0; wrong team stores odds 0; bingo needs shoot-out winner | `GameScorer::knockoutComponents` | CLAUDE.md > Knockout games (CONFIRMED RULE) |
| Odds picked: predicted outcome's crowd odds; **generated row gets odds 0 but still earns `(1+0) x bonus`** | `ScoringService::getGameOdds` | code only; ScoringService docblock notes it contradicts CONTEXT.md (issue 214) |
| Crowd odds `log2(total/count)`, nobody-picked = `log2(total/0.5)`, stored `round(round(x,4),2)` | `app/Support/CrowdOdds.php`, `GameOddsController` | CONTEXT.md > Odds (shape only); formula and rounding **code only** (#220) |
| Serija: per tournament, kick-off order (`game_date`, then id), missing row breaks, `bonus = (len-1) x step x rate` | `StreakWalker`, `StreakService`, `SerijaCorrectness` | CLAUDE.md > Streak (Serija) bonus; CONTEXT.md > Serija; step per format in config |
| Standings position: `max(0, base - step x |actual - predicted|)`; stage flag match pays stage points; final matrix 4x4 | `StandingScoringService` | CLAUDE.md > Standings formats; config comments |
| Standings crowd multiplier: exact position / correct stage / exact final x `(1 + log2(total/same))`, rounded 4, float columns; inactive stage stores null | `StandingPointsRow` | "null never 0" in CLAUDE.md; the **crowd multiplier on standings is code only** |
| Survival: running total per run per tournament, home/away value, loss 0 + reset, draw decides nobody, a team winning twice in a round paid once | `SurvivalRun`, `PointSurvivalController::runTotal/recalculateSurvivalPoints` | CLAUDE.md > Survival |
| Ranking: total then result points, both to the cent, competition ranks, username A-Z (case-insensitive then binary) | `app/Support/Ranking.php`, `PlayerTotals` | CLAUDE.md > Leagues (One rank rule), CONTEXT.md > Rank |
| Generated score distribution | `GeneratedScore` | config/scores.php comments |
| Verdict colour (green/amber/red/grey) | `app/Support/PredictionVerdict.php` | CLAUDE.md > Prediction summary label colours |

- **Size: L** - small code, but it is the parity bar; every branch needs a named unit case, and the golden scenario
  (`tests/Support/GoldenScenario.php`, 455 lines; `tests/Fixtures/golden-points.json`) should be ported as the first oracle.

### A10. Dashboard, league table, public leaderboards (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/main` | `main` | `MainController@loadApp` - league table (`PointController::getAllUserPoints`) with last-6 game history per player, rank history, snapshot (rank, total, bingo count, current serija, rank change over 5), activity feed, fee panel, league messages, medal tally, upcoming games (today's finished + next 3 dates) with form guide, tournament progress |
| GET | `/leaderboard` | `leaderboard` | `MainController@leaderboard` - public "Lyderiai": all tournaments, total = match + serija only, per-format bingo/winner thresholds |
| GET | `/dashboard` | `dashboard` | redirect to `/main` (Breeze leftover) |

- **Code:** `MainController`, `PointController` (`getAllUserPoints`, `getAllUsersGameHistory`, `getRankHistory`), `ActivityFeedController`,
  `FeeController`, `MessageController::getProfileMessages`, `PredictionStandingController::getPredictionStandingTop4`, `app/Support/Ranking.php`,
  `PlayerTotals.php`, `LeagueRoster.php`, `MedalTally.php`, `app/View/Composers/LeaderboardOfferComposer.php`.
- **Views:** `main.blade.php`, `leaderboard.blade.php`, `partials/points.blade.php`, `stat-tiles`, `activity-feed`, `fee`, `messages`, `standings`, `games`, `welcome`.
- **Tables (R):** `point_results`, `point_standings`, `point_survivals`, `prediction_results`, `league_members`, `user_settings`, `leagues`, `messages`, `games`, `events`, `teams`, `game_odds`.
- **Rules:** CLAUDE.md > Leagues (league scoped to one tournament #226/#227, guest visibility `is_guest <= viewer`, one rank rule #224, cent precision #229,
  entry fee pots); CLAUDE.md > Negative totals on the public table (#72); `PlayerTotals` docblock (public totals exclude standings and survival - code only).
- **Size: L** - the most-hit page; ~46 queries in the old app; two different "total" definitions must both be kept.

### A11. Summaries, chart, head-to-head (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/summary/prediction/results` | `summary.prediction.results` | `PredictionResultController@getPredictionResultSummary` - everyone's predictions for closed games, verdict colours |
| GET | `/summary/prediction/standings` | `summary.prediction.standings` | `PredictionStandingController@getPredictionStandingSummary` |
| GET | `/summary/predictionSurvivals` | `summary.prediction.survivals` | `PredictionSurvivalController@getPredictionSurvivalSummary` - run per player per round, sorted by `SurvivalSummary` |
| GET | `/summary/chart` | `summary.chart` | `ChartController@getChartData` - cumulative points per player (Chart.js) |
| GET | `/compare/{userID}` | `compare.show` | `CompareController@show` - two players side by side, per-event points; AJAX returns `compare/_card` |

- **Views:** `summary/results.blade.php`, `summary/standings.blade.php`, `summary/survivals.blade.php`, `summary/chart.blade.php`, `compare/show.blade.php`, `compare/_card.blade.php`.
- **Rules:** CLAUDE.md > Prediction summary label colours and the warning under it; GameLock closes every summary query on open games;
  CONTEXT.md > Standings deadline (summary visible while standings open, on purpose).
- **Size: M-L** - five pages, mostly read-only; several are not tournament-scoped in the old code (open question Q5).

### A12. Leagues and invites (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/leagues` | `leagues.index` | `LeagueController@index` - my leagues in the current tournament, pending invites (all tournaments) |
| POST | `/leagues/create` | `leagues.create` | `@create` - private league, creator is `is_admin` and owner |
| POST | `/leagues/update` | `leagues.update` | `@update` - league admin only |
| POST | `/leagues/invite` | `leagues.invite` | `@invite` |
| GET | `/leagues/searchUsers` | `leagues.searchUsers` | `@searchUsers` - LIKE on name/surname/username across all users, 10 results |
| POST | `/leagues/accept` | `leagues.accept` | `@acceptInvite` - creates membership (inactive), deletes the invite |
| POST | `/leagues/decline` | `leagues.decline` | `@declineInvite` - deletes the invite |
| POST | `/leagues/switch` | `leagues.switch` | `@switchLeague` - deactivates the player's other leagues in that tournament |
| POST | `/leagues/leave` | `leagues.leave` | `@leaveLeague` |
| POST | `/leagues/delete` | `leagues.delete` | `@deleteLeague` - owner only; members moved to "the" public league; messages detached |

- **Views:** `leagues/index.blade.php` (376), `partials/league-switcher.blade.php`, nav badge for invites.
- **Tables:** RW `leagues`, `league_members`, `league_invites`, `messages.league_id`.
- **Rules:** CLAUDE.md > Leagues; CONTEXT.md > League, Guest; CLAUDE.md > Outstanding predictions (invite badge counted by `LeagueInvite::pendingCountFor`, not tournament-scoped on purpose).
- **Size: M.**

### A13. League entry-fee payments (P for league admins, A for superadmins)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET/POST | `/leagues/{league}/payments` | `leagues.payments`, `leagues.payments.update` | `LeaguePaymentController@edit/@update` - league admin re-checked in DB, public league refused |
| GET/POST | `/admin/leagues/{league}/payments` | `admin.leagues.payments`, `.update` | `@adminEdit/@adminUpdate` (superadmin) |

- **Views:** `leagues/payments.blade.php`, `admin/league-payments.blade.php`, `partials/league-payments-form.blade.php` (JSON autosave returns pots).
- **Tables:** RW `league_members.paid_amount`; R `leagues.base_fee`.
- **Rules:** CLAUDE.md > Leagues > Entry fee payments (issue 140); CONTEXT.md > Fee, Paid amount (expected = fee x full members, collected = sum paid).
- **Size: S.**

### A14. League messages (A writes, P reads)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/admin/messages` | `admin.messages` | `MessageController@getMessageAll` |
| POST | `/admin/messages` | `admin.messages.update` | `@updateMessage` - update, or delete (re-checks admin >= 9 in the controller) |
| POST | `/admin/messageInsert` | `admin.messageInsert` | `@insertMessage` |

- Dashboard shows `messages` where `active = 1 AND league_id = current league`. **Size: S.**

### A15. Profile, notifications, account deletion, locale (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET/POST | `/userProfile` | `userProfile` | `UserProfileController@getUserProfile` / `@updateUserProfile` (email normalised, unique) |
| GET/PATCH | `/profile` | `profile.edit`, `profile.update` | same two methods (Breeze aliases, no link) |
| POST | `/profile/notifications` | `profile.notifications` | `@updateNotifications` - `receive_reminders` |
| GET | `/profile/notifications/unsubscribe/{user}` | `profile.notifications.unsubscribe` | `@unsubscribe` - `signed` middleware, from the reminder mail |
| POST | `/profile/deletion-code` | `profile.deletionCode` | `@requestDeletionCode` (throttle 3/10min/user) |
| DELETE | `/profile` | `profile.destroy` | `@destroy` - verifies an `account_deletion` code (throttle 5/10min/user) |
| POST | `/locale` | `locale.update` | `LocaleController@update` - `lt` or `en`, stored in `user_settings.locale` and session |

- **Code:** `UserProfileController`, `app/Services/ProfileService.php`, `app/Mail/AccountDeletionCodeMail.php`. **Views:** `userProfile.blade.php` (246), `partials/locale-switch.blade.php`.
- **Tables:** RW `users`, `user_settings`, `login_codes`; D all of the player's rows (`ProfileService::deleteAccount`).
- **Rules:** CLAUDE.md > Authentication (every write to `users.email` normalised; a wrong address is a permanent lockout).
- **Size: M.**

### A16. Navigation and "you still owe a prediction" badges (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/nav/missing` | `nav.missing` | `NavBadgeController` - JSON `{results, standings, survival, invites}` |

- **Code:** `app/Support/MissingPredictions.php`, `app/View/Composers/NavBadgeComposer.php`, `components/nav-badge.blade.php`,
  `partials/rail*.blade.php`, `partials/header.blade.php`, `partials/bottom-nav.blade.php`.
- **Rules:** CLAUDE.md > Outstanding predictions are marked on the navigation (every badge answered by `nav/missing`; a badge is a to-do, never a verdict).
- **Size: S-M** (the layout shell itself - rail, header, bottom tabs, cookie consent - rides along here).

### A17. Public content pages (P)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/rules` | `rules` | `RulesController@getRulesDetails` - every number derived from the format objects (`app/Support/ScoringRules.php`, 380 lines: accuracy grid, margin examples, odds examples, position grid, finals grid, streak examples), plus the fee panel when signed in |
| GET | `/help` | `help` | `HelpController@show` - `HelpFormat` + `StandingsFormat` for `Tournament::forVisitor()` |
| GET | `/privacy` | `privacy` | static view |
| GET | `/charity` | `charity` | static view (linked from rail, header, hub, leaderboard, welcome) |
| GET | `/support` | `support` | static view - no link (see section 4) |
| GET | `/sponsors` | `sponsors` | static view - no link (see section 4) |

- **Rules:** CLAUDE.md > Score formats (public pages resolve the format with `forVisitor`, never from a nullable session id).
- **Size: M** - `/rules` must regenerate its worked examples from the domain package, not retype them.

### A18. Admin panel (A)

Middleware tiers (`app/Http/Middleware`): `admin` = `user_settings.admin > 0`; `superadmin` = `>= 5`; `level9admin` = `>= 9`.
Every check re-reads the database. Levels in use: 0, 1, 5, 8, 9 (`UserController:55`).

| Method | Path | Name | Tier | Handler |
|---|---|---|---|---|
| GET | `/admin` | `admin` | none (redirect only) | `RedirectController` -> `/admin/index` |
| GET | `/admin/index` | `admin.index` | admin | view `admin/index` (tiles, gated per level) |
| GET | `/admin/games` | `admin.games` | admin | `GameController@getGameAll` |
| POST | `/admin/insertGame` `/admin/updateGame` `/admin/deleteGame` | `admin.insertGame` ... | admin | insert seeds `prediction_results` for every member of the tournament and a blank `game_odds` row; dates entered in Vilnius time -> UTC |
| GET | `/admin/leagues` | `admin.leagues` | admin | `LeagueController@adminIndex` |
| POST | `/admin/leagues/update` | `admin.leagues.update` | superadmin | `@adminUpdate` |
| POST | `/admin/leagues/delete` | `admin.leagues.delete` | level 9 | `@adminDelete` |
| POST | `/admin/promoteSelf` | `admin.promoteSelf` | admin | `UserController@promoteSelf` - level 8 raises itself to 9 |
| GET | `/admin/users` | `admin.users` | superadmin | `UserController@getAllUsersFull` |
| POST | `/admin/updateUser` `/admin/deleteUser` `/admin/toggleHidden` | ... | level 9 | set level (0,1,5,8,9); hard-delete a user and all rows; flip `user_settings.active` |
| GET/POST | `/admin/teams` | `admin.teams`, `admin.teams.update` | superadmin | `TeamController@getTeam/@updateTeams` - actual group positions, stage flags, final place |
| POST | `/admin/updateTeamDetails` | `admin.updateTeamDetails` | superadmin | name, group |
| GET/POST | `/admin/teaminsert` | `admin.teaminsert`, `admin.teamsinsert` | superadmin | placeholder teams `team1..N` (form shown only when **no team exists at all**) |
| GET/POST | `/admin/events`, POST `/admin/eventInsert` | `admin.events`, `.update`, `admin.eventInsert` | superadmin | name, `event_day`, survival flag, knockout flag, `round_type`, active, integer `rate`; delete needs level 9 in controller |
| GET | `/admin/audit` | `admin.audit` | superadmin | `AuditController@index` - logins and prediction changes, paginated, filter by user |
| GET/POST | `/admin/tournaments`, `/create`, `/{t}/edit`, `/{t}` | `admin.tournaments*` | level 9 | CRUD; creating a tournament creates its public league; `refuseSurvivalWithDraws` (issue 228); per-tournament standings deadline round (issue 143) |
| POST | `/admin/tournaments/{t}/context` | `admin.tournaments.context` | level 9 | sets the admin's session tournament |
| GET/POST | `/admin/settings` | `admin.settings` | superadmin | deprecated (section 4) |

- **Views:** `admin/layouts/master.blade.php`, `admin/partials/{header,rail}.blade.php`, `admin/{index,games,results,events,teams,teaminsert,users,leagues,league-payments,messages,audit,import,settings}.blade.php`, `admin/tournaments/{index,form}.blade.php`.
- **Rules:** CLAUDE.md > Admin panel (access control in middleware, never in views; 37 of 38 routes gated); CLAUDE.md > Security (re-check authority);
  CLAUDE.md > Scoring logic (`events.rate` whole numbers only, #34); CLAUDE.md > Time and the lock (admin enters Vilnius time).
- **Size: L** in total; split across slices (tournaments, events/games/teams, users, leagues, audit).

### A19. Euroleague season import (A + CLI)

| Method | Path | Name | Handler |
|---|---|---|---|
| GET | `/admin/import` | `admin.import` | `EuroleagueImportController@index` (superadmin) |
| POST | `/admin/import/preview` | `admin.import.preview` | `@preview` - `EuroleagueScheduleImporter::plan()`, read only |
| POST | `/admin/import` | `admin.import.store` | `@store` - `apply()` in one transaction |
| CLI | `php artisan euroleague:import <tournament> [--season=E2026] [--dry-run]` | - | `app/Console/Commands/ImportEuroleagueSchedule.php` |

- Creates teams, events (`"<n> turas"`, `event_day = n`, rate 1, survival off, not knockout), games (keyed by event+home+away; re-run updates tip-off),
  blank `game_odds`, missing crests (`TeamCrestDownloader` into `public/img/teams`), and seeds prediction rows for players already in the tournament.
- **External:** `api-live.euroleague.net/v2/competitions/E/seasons/{season}/games`, crest CDNs. Fixture: `tests/Fixtures/euroleague-e2026-games.json`.
- **Rules:** CLAUDE.md > Importing a season (`utcDate` only, `local.club`/`road.club`, unmatched name refuses the whole import); CLAUDE.md > Team logos.
- **Size: M.**

### A20. Mail and prediction reminders (X)

- Mailables: `LoginCodeMail`, `RegistrationCodeMail`, `AccountDeletionCodeMail`, `PredictionReminder` (views under `resources/views/emails/`).
  All sent with `->send()`; codes sent `dispatch(...)->afterResponse()`.
- `reminders:send` (`app/Console/Commands/SendPredictionReminders.php`), scheduled every 15 minutes (`routes/console.php:11`): per opted-in player,
  unpredicted open games within 48 h; reminder time = kick-off - 1 h, pulled to 21:00 for games at/after 22:00 and to 21:00 the day before for
  games before 08:00 (Vilnius); one mail lists every such game on that Vilnius day; marks `prediction_results.reminded_at`; aborts on a missing Resend key.
  Mail carries a signed unsubscribe link and a link to `/prediction/game/{id}`.
- **Rules:** CONTEXT.md > Reminder; CLAUDE.md > There is no queue, and nothing may be queued; CLAUDE.md > Authentication (log-mailer refusal, `critical` logging);
  `docs/email-delivery.md`.
- **External:** Resend (prod), Mailpit (staging). **Size: M.**

### A21. Internationalisation (X)

- `lang/lt.json` and `lang/en.json`, 631 keys each; the **keys are the Lithuanian source strings** (`__('Lyga sukurta')`). Default locale `lt`
  from `user_settings.locale` or session (`SetLocale`). Stage names in `config/standings.php` are Lithuanian literals too.
- **Size: M** as a cross-cutting cost: choose the new key scheme once, then every slice ships both locales.

### A22. Scheduler, background work, backups (X)

- Production runs `php artisan schedule:work` in a `scheduler` container (`docker/production/compose.yml:61`); no queue worker exists.
- Scheduled: `reminders:send` every 15 min; `inspire` hourly (scaffold, section 4).
- Backups: `sportbet:backup-database` (`app/Console/Commands/BackupDatabase.php` + `app/Services/Backup/*`, ~1,400 lines) run by a host systemd timer at 02:17 UTC;
  sessions/login_codes/cache/jobs dumped empty, `remember_token` nulled (`docs/database-backup.md`). sportbet_new already has a nightly `pg_dump`
  with restore test (`sportbet_new/infra/host/backup.sh`), so this area is mostly done; only the redaction policy needs a decision.
- **Size: S.**

### A23. Assets: team logos, help screenshots (X)

- `App\Support\TeamLogo`: `public/img/teams/<lowercased team name>.<svg|png>`, svg preferred, `_placeholder.svg` fallback; importer matches names with `TeamLogo::baseName()`.
- Help screenshots under `public/img/` and `public/img/help/euroleague/`. **Rules:** CLAUDE.md > Team logos. **Size: S.**

### A24. Audit trail (A)

- `audit_logins` written on every sign-in path (`AuditLoginsController::insertAuditLogin`, `user_id` stored as a string);
  `audit_prediction_games` written on every complete prediction save with the old values. Read by `/admin/audit`. **Size: S.**

---

## 2. Data model

Final shape after all 44 migrations in `database/migrations`. "Parity" column: **REPRODUCE** = the checker recomputes it and must match;
**INPUT** = the checker reads it from the production copy; **VERIFY** = recomputable as a secondary check; blank = not part of parity.
"Origin": **E** entered by a person, **D** derived by the app, **S** system/framework.

| Table | Purpose | Key columns | Known quirks | Parity | Origin |
|---|---|---|---|---|---|
| `tournaments` | One competition | `slug` unique, `sport` (free text), `standings_format` (default `football`), `standings_deadline_round` null, `status` enum upcoming/active/finished (declared intent only), `start_date`, `end_date`, `is_public`, `survival_game`, `cover_image`, `description` | `is_public` and `cover_image` never read; `status` is not what players see (`effectiveStatus`) | INPUT (`standings_format`, `survival_game`) | E |
| `events` | A round | `tournament_id` NOT NULL, `event`, `event_day` smallint (the deadline-round number), `event_survival` tinyint, `is_knockout` bool, `round_type` varchar(20) null (admin UI filter only), `active` tinyint, `rate` tinyint | `active` never read by live code; rate is whole numbers (#34); survival summary filters `rate = 1` rather than `event_survival` | INPUT (`rate`, `is_knockout`, `event_day`, `tournament_id`) | E |
| `teams` | A team in one tournament | `tournament_id` NOT NULL, `team` (also the logo file name), `group_name`, actual `group_position`, `last32`, `last16`, `quarterfinal`, `semifinal` (0/1 flags), `final` (place 1-4) | tinyint flags; the actual outcome lives on the team row, not in a results table; `link` dropped (#64) | INPUT | E |
| `games` | A match | `event_id`, `home_team_id`, `away_team_id` (widened to bigint, FKs added 2026-09-16), `game_date` UTC, `home_team_score`, `away_team_score` smallint null, `game_winner_id` (shoot-out winner, kept only on a draw), `reminder_sent` | `reminder_sent` dead (CONTEXT.md > Reminder); one-sided result possible (one box blank) | INPUT | E |
| `game_odds` | Crowd odds per game | `game_id`, `home_odds`, `draw_odds`, `away_odds` decimal(8,2) null | not unique on `game_id` (`firstOrNew`); a blank row is inserted with each game; missing row scores as 1.0/1.0/1.0; drawless formats store the contrarian max as `draw_odds` | INPUT for points, VERIFY by recompute | D |
| `points_calculations` | Football difference lookup | `home_score_difference` 0..7, `away_score_difference` -7..7, `points` (x2) | 120 rows since `2026_06_08_000001` (the "66-row" comment in CLAUDE.md predates the expansion); values stored doubled | INPUT (or port as constant) | S (seeded by migration) |
| `prediction_results` | A player's score call per game | `user_id`, `game_id`, scores null, `game_winner_id` (predicted shoot-out winner), `generated` **binary/blob**, `prediction_date`, `reminded_at` | `generated` is a BLOB holding `1`/`0`/NULL; `prediction_date` never written; no unique (user, game); a blank row per game is the normal state | INPUT | E (+ D for generated rows) |
| `prediction_standings` | A player's table call per team | `user_id`, `team_id`, `group_position`, `last32`, `last16`, `quarterfinal`, `semifinal` (0/1/null), `final` | no unique (user, team) | INPUT | E |
| `prediction_survivals` | Survival pick slots | `user_id`, `team_id` (FK since 2026-09-16), `event_id` null | one row per (player, team); `event_id` is nulled on a loss, so history is destroyed; `event_id` still smallint without FK | INPUT (only live runs) | E + D (reset) |
| `point_results` | Match points per player per game | unique (`user_id`,`game_id`); `winner_points`, `difference_points`, `bingo_points`, `odds`, `odds_points`, `full_points` decimal(8,2) signed; `streak_bonus` decimal(8,2) default 0 | `odds_points` always 0 (issue 215); `odds` stores the odds used (0 for generated and for wrong-team knockout; actual odds for partials); rows can outlive a cleared result | **REPRODUCE** | D |
| `point_standings` | Standings points per player per team | unique (`user_id`,`team_id`); `<stage>_points` and `<stage>_odds` for group_position, last32, last16, quarterfinal, semifinal, final | changed from smallint to **`float`** in `2026_06_28_104439` (check actual MySQL type: FLOAT vs DOUBLE); values rounded to 4 places; null = stage not played; table truncated and rebuilt for all tournaments at once | **REPRODUCE** | D |
| `point_survivals` | Survival history per resolved round | `user_id`, `event_id`, `team_id`, `survival_points` smallint | running total of the run, not the round's value; 0 = loss; the only surviving record of a broken run | **REPRODUCE** (fold) | D |
| `users` | Accounts | `username`, `name`, `surname`, `email` unique (utf8mb4_unicode_ci, folds diacritics), `google_id` unique null, `remember_token` | `password` and `email_verified_at` dropped (#42, #44); `username` not unique | INPUT (ids, usernames for ranking tie-break) | E |
| `user_settings` | Per-user flags | `user_id`, `admin` tinyint (0/1/5/8/9), `result_amount`, `time_zone`, `receive_reminders`, `active` (default true), `locale` (default `lt`) | `time_zone` never read; `result_amount` only feeds dead code; `active` is global, not per tournament; no unique on `user_id` | INPUT (`active` decides who gets generated rows and who is ranked) | E + D |
| `leagues` | Private/public competitions | `tournament_id` NOT NULL, `name`, `description`, `is_public`, `owner_id` (null on delete), `base_fee` int, `penalty_step` int, `use_league_odds`, `reward_description` | `use_league_odds` dead (#227); `penalty_step` stored/edited but never shown or used | | E |
| `league_members` | Membership | unique (`league_id`,`user_id`); `is_admin`, `is_guest`, `active` (the selected league within a tournament), `paid_amount` decimal(8,2) null | `active` is not "valid membership" (see `LeagueRoster` docblock) | INPUT for ranking views only | E |
| `league_invites` | Invites | unique (`league_id`,`invited_user_id`); `invited_by_id`; `status` enum pending/accepted/declined | only `pending` is ever written - accept and decline delete the row | | E |
| `league_game_odds` | Per-league odds | PK (`league_id`,`game_id`) | unused - nothing reads or writes it (CLAUDE.md:178) | | - |
| `messages` | League notices on the dashboard | `league_id` null, `message` varchar(255), `active` | detached (`league_id = null`) when a league is deleted | | E |
| `login_codes` | One-time codes | `email`, `purpose` (login/registration/account_deletion), `code_hash`, `expires_at`, `consumed_at`, `ip_address` | dumped empty in backups | | S |
| `audit_logins` | Sign-in log | `user_id` **varchar**, `ip_address`, `login_method` | string user id (decision 4) | | S |
| `audit_prediction_games` | Prediction change log | `user_id`, `game_id`, new and `old_` scores/winner | `user_id` FK without cascade - blocks self-deletion? (Q10) | | S |
| `audit_prediction_survival` | - | `user_id`, `event_id`, `game_winner_id` | created in `0001_01_01_000005:188`, never read or written | | - |
| `settings` | Old global settings | `setting`, `value` smallint | only `survivalGame` (superseded by `tournaments.survival_game`) and inert `timeDifference` rows; read only by the deprecated `/admin/settings` | | - |
| `colors` | Chart colours | `color_code` | joined `users.id = colors.id` in `ChartController:36`; no UI to set one | | S (seeded) |
| `sessions`, `cache`, `cache_locks` | Framework | | cache holds rate-limiter counters only | | S |
| `jobs`, `job_batches`, `failed_jobs` | Framework queue | | no worker; must stay empty (CLAUDE.md > There is no queue) | | - |
| `groups`, `user_groups`, `password_reset_tokens` | - | | already dropped | | - |

Decimal and rounding facts the new schema must carry: decimals default to (8,2); crowd odds rounded to 4 then 2 before storage (#220);
standings odds and points rounded to 4 and stored in float columns; ranking compares totals rounded to 2 and displays 1.

---

## 3. Proposed porting order

Each slice is sized for its own spec -> plan -> code cycle. The first four are the spine the rest hang on; after slice 7 the order within
player pages is flexible and can follow the calendar (the next tournament's format first).

| # | Slice | Why here | Done means |
|---|---|---|---|
| 1 | **Core schema + production-copy reader** (`tools/migrate`, read side only): tournaments, events, teams, games, game_odds, points_calculations, users, user_settings, leagues, league_members, prediction_results/standings/survivals, point_results/standings/survivals, into the new Postgres schema (decision 4 types: `generated` boolean, decimals, enums, `audit_logins.user_id` integer) | The parity checker needs production data in the new shape; decision 7 rehearses this script anyway, so write it once, early, and keep extending it | A production dump loads into a throwaway Postgres with row counts per table matching the dump; every value parsed by Zod; quirks (`generated` blob, one-sided scores, orphan rows) reported, not silently fixed |
| 2 | **Formats + scoring domain** in `packages/domain`: A4 and A9 (match scoring incl. knockout, football table, margin rule, crowd odds, serija walk, standings rows, survival fold/total, ranking, generated-score spec, verdict) | Decision 7: scoring before any page; everything else reads these | Every rule in CLAUDE.md > Scoring logic / Knockout / Streak / Survival / Standings formats / Leagues rank rule has a named unit case; the golden scenario's inputs, expressed as domain inputs, reproduce `golden-points.json` exactly |
| 3 | **Parity checker v1** (section 6) | Decision 7's oracle; lands with scoring (Phases table) | Run against the latest production copy: every `point_results`, `point_standings`, `point_survivals` row reproduced, or every difference listed, classified and signed off by the owner (stale-in-production vs new-code-wrong) |
| 4 | **Auth + request context + layout shell**: A1, A3, A16 shell, A21 infrastructure, A15 locale switch | Every player page needs a signed-in player and a resolved tournament/league/event | Code sign-in, Google sign-in, two-step registration and sign-out work on staging against Mailpit; `/login` and `/register` redirect to `/` with the dialog open; throttles as in A1; email identity rule tested with diacritics; both locales render |
| 5 | **Hub, tournament page, tournament registration**: A2 (full), seeding prediction rows | Entry point for everyone; registration is where prediction rows come from | `/`, `/tournament/{slug}`, `/tournament/{slug}/register`, `/enter`, `/tournaments/exit` at the same URLs and behaviour; effective status and `forVisitor` ordering as documented; registration closes at first kick-off |
| 6 | **Match-result predictions**: A5 | The main prediction type; generates the inputs scoring reads | `/prediction/results`, `/prediction/game/{id}` at the same URLs; lock refused server-side; bounds per format from the game; autosave returns odds; audit rows written; odds recomputed on save |
| 7 | **Results entry + recalculation pipeline**: A8 | The new app's own write path for derived rows; after this the checker can compare "old stored" vs "new app recomputed from inputs" and "new app on replay" | `/admin/results`, `/admin/resultsAll`, `/admin/updateResult`, `/admin/recalculateAllGamePoints`, `/admin/updateStandingPoints` at the same URLs; replaying a production copy's results through the new pipeline reproduces the stored rows (except generated scores, which are random - see section 6) |
| 8 | **Dashboard and league table**: A10 | Needs ranking (2) and stored points (7) | `/main` shows the league table, histories, snapshot, activity feed, fee panel, messages, medal tally, upcoming games; ranks equal to the old app on a production copy for every league; `/leaderboard` totals and ranks equal |
| 9 | **Standings predictions**: A6 | Independent of 8; the ladder is a self-contained UI job | `/prediction/standings` (+ `/reorder`) at the same URLs; football box and euroleague ladder; enforce only for euroleague; deadline re-read on write; the two reorder invariants tested |
| 10 | **Survival picks + survival summary**: A7, `/summary/predictionSurvivals` | Scoring for survival exists since 2/7; the page and the summary share the "pending pick" logic | Picks refused in scored/absent rounds; summary renders runs identical to the old app on a production copy |
| 11 | **Summaries, chart, compare**: rest of A11 | Read-only views over data that now exists | The four URLs render the same data as the old app for a production copy, with the scoping decisions of Q5 applied |
| 12 | **Leagues, invites, payments, messages (read side)**: A12, A13, A14 read | Social layer; depends on 4 and 8 | All `/leagues*` routes at the same URLs; guest visibility rule tested; pots equal to the old app |
| 13 | **Admin: tournaments, events, games, teams**: A18 part 1 | Needed before the new app can run a tournament end to end without the old admin | Admin CRUD at the same URLs and tiers; `refuseSurvivalWithDraws`; Vilnius-to-UTC entry; creating a game seeds prediction rows and a blank odds row |
| 14 | **Admin: users, leagues admin, messages admin, audit**: A18 part 2, A14 write, A24 | Sensitive surfaces, kept out of other batches (CLAUDE.md > Security) | Tier checks in middleware and re-checked in the handler for destructive actions; delete-user semantics per Q10 |
| 15 | **Euroleague import**: A19 | Needed only before the next Euroleague season; heavy on external I/O | Preview then apply, re-runnable, fixture test with no network; same rows as the old importer on the fixture |
| 16 | **Mail templates + reminders + scheduler**: A20, A22 | The reminder rule is independent; the scheduler container is infra | Reminder timing cases unit-tested (22:00, 08:00, DST days); one mail per player per day; signed unsubscribe works |
| 17 | **Profile, notifications, account deletion**: A15 | Low traffic, security-relevant | All profile routes at the same URLs; deletion code flow; email normalisation on edit |
| 18 | **Rules, help, static pages**: A17, A23 | Derived from the domain package, so last is cheapest | `/rules` numbers generated from the domain formats and equal to the old page for both formats; `/help`, `/privacy`, `/charity` (and `/support`, `/sponsors` if kept) |

Cross-cutting from slice 4 onwards: every page ships both locales, and every slice extends the production-copy reader (slice 1) with the
tables it introduces, so the rehearsed migration of decision 7 grows alongside the app instead of at the end.

---

## 4. Dead or deprecated candidates for the owner to confirm (decision 6)

Nothing below has been decided. "Drop" means "not ported and not migrated"; for columns with data, the owner may still want the data kept.

### 4a. Documented as removed, unused or deprecated (high confidence)

| # | Item | Evidence |
|---|---|---|
| H1 | Table `league_game_odds` | CLAUDE.md:178 "remain, unused - nothing writes or reads them" (#227); decisions.md decision 4 names it |
| H2 | Column `leagues.use_league_odds` | CLAUDE.md:178, same sentence; no read in `app/` or `resources/` |
| H3 | Column `games.reminder_sent` | CONTEXT.md:80 "the old per-game flag and nothing reads it"; superseded by `prediction_results.reminded_at` (migration `2026_09_26_000000`) |
| H4 | `settings` rows `timeDifference` | CLAUDE.md:393-395 "inert and can be left alone; nothing reads the table for it" |
| H5 | `settings` row `survivalGame` (and so the whole `settings` table) | copied into `tournaments.survival_game` by `2026_06_30_100000_create_tournaments_and_add_fks.php`; only reader is the deprecated admin page (H7) |
| H6 | Routes `GET/POST /userSettings` (`userSettings`), view `userSettings.blade.php`, `UserSettingController@getUserSettings/@updateUserSettings` | `routes/web.php:95` "@deprecated - settings merged into profile page; routes kept to avoid 404 on stale bookmarks"; no link except the page itself |
| H7 | Routes `GET/POST /admin/settings` (`admin.settings`), view `admin/settings.blade.php`, `SettingController` | `routes/web.php:206` "@deprecated - settings removed from admin panel"; only link is inside its own view |
| H8 | Column `point_results.odds_points` | always written 0 (`ScoringService::calculateGamePoints`, docblock "It is always zero", issue 215); read only to display that zero |
| H9 | Queue tables `jobs`, `job_batches`, `failed_jobs` | CLAUDE.md > There is no queue, and nothing may be queued (no worker in production) |
| H10 | Session key `eventDay` | CLAUDE.md:490 "never set by SessionController" |
| H11 | `groups`, `user_groups`, `password_reset_tokens`, `users.password`, `users.email_verified_at`, `teams.link`, password and verification routes | already dropped (CLAUDE.md > Leagues, > Authentication, > Team logos); listed so nothing reintroduces them; `database/factories/GroupFactory.php` is the leftover |
| H12 | Full-page `/login` and `/register` | CLAUDE.md > Authentication (#111): the routes stay as redirects, the pages are gone - port the redirects only |
| H13 | Warnings card `partials/warnings.blade.php` | CLAUDE.md > Outstanding predictions (issue 163): gone, replaced by nav badges |

### 4b. Looks unused from the code (needs the owner's knowledge)

| # | Item | Evidence |
|---|---|---|
| C1 | Table `audit_prediction_survival` | created `0001_01_01_000005_create_sportbet_table.php:188`; no model, no read or write anywhere in `app/`, `database/`, `tests/` |
| C2 | Table `colors` + `App\Models\Color` + `ColorSeeder` | only use `ChartController:36` joins `users.id = colors.id` (colour by user id); no UI sets one; chart falls back to a 10-colour palette |
| C3 | Column `user_settings.time_zone` | never read or written in `app/` (only a backup SQL string matches) |
| C4 | Column `user_settings.result_amount` (session `resultAmount`) | written only by the deprecated `/userSettings` (H6); read only by the never-called `PredictionResultController::getPredictionGamesUserResultAmount` |
| C5 | Column `prediction_results.prediction_date` | never written; read only by the same never-called method |
| C6 | Column `events.active` | written by the admin event form (`EventController:41,72`) and importer; read only by the never-called method |
| C7 | Column `tournaments.is_public` | written by the admin form (`TournamentController`), never read - the hub lists every tournament |
| C8 | Column `tournaments.cover_image` | written by the admin form, never rendered |
| C9 | Column `leagues.penalty_step` | validated and saved by `LeagueController` create/update/adminUpdate, selected by `FeeController::getGroupDetails`, but not displayed or used in any calculation |
| C10 | Enum values `league_invites.status = accepted/declined` | `acceptInvite`/`declineInvite` delete the row; only `pending` is ever written |
| C11 | `GET /users` (`users`), `UserController@getAllUsers`, `users.blade.php` | no `route('users')` or `/users` link anywhere in `resources/views` |
| C12 | `GET /sponsors`, `sponsors.blade.php` | no link; content is a single Zalgiris logo linking to transunion.com |
| C13 | `GET /support`, `support.blade.php` | no link; text says the site "moved to Hostinger servers" and asks for Contribee donations - out of date since the Oracle move (#155) |
| C14 | `GET/PATCH /profile` (`profile.edit`, `profile.update`) | Breeze aliases of `/userProfile`; no reference in views (`routes/web.php:33-34`) |
| C15 | `GET /dashboard` (`dashboard`) | redirect to `/main` under "Original routes" (Breeze); no `route('dashboard')` in views |
| C16 | `GET /admin/teaminsert` + `POST /admin/teaminsert` + `admin/teaminsert.blade.php` (placeholder teams `team1..N`) | the form renders only when `Team::all()->count() == 0` across **all** tournaments (`TeamController:21-23`), so it is unreachable once any tournament has teams; seeds rows only for the admin |
| C17 | Scheduled `inspire` command, hourly | `routes/console.php:7-9` - Laravel scaffold |
| C18 | Dead controller methods (code, not features) | `PredictionResultController::getPredictionGamesUserResultAmount`, `PointStandingController::getStandingsUserPoints`, `PointSurvivalController::getPredictionSurvivalUserPoints`, `::getPointSurvivalEventID`, `PointResultController::getUserProfilePoints`, `TeamStatisticsController::getTeamStatistics`, `ResultController::getEventGameUnfinishedCount` - no caller in `app/`, `resources/`, `routes/` |
| C19 | Model `App\Models\PointCalculation` | no table `point_calculations`; the live model is `PointsCalculation` |
| C20 | Views never rendered | `profiles.blade.php` (posts to `profiles_post`, no such route), `statistics/{predictions,team,teams}.blade.php`, `summary/games.blade.php`, `mail.blade.php`, `email/mail.blade.php` (1 line each), `layouts/master_blank.blade.php`, `layouts/app.blade.php` + `layouts/guest.blade.php` (+ `app/View/Components/AppLayout.php`, `GuestLayout.php`), `partials/pointsStandings.blade.php` |
| C21 | Breeze Blade components | `components/{auth-session-status,input-error,input-label,primary-button,text-input}.blade.php` - only `<x-nav-badge>` and `<x-team-crest>` are used |
| C22 | Config flag `REHEARSAL_BANNER` (`config/app.php:36`, `partials/rehearsal-banner.blade.php`) | written for the Oracle rehearsal copy (issue 150); off in production |
| C23 | Admin level 1 | accepted by `updateUser` validation (`UserController:55`, `in:0,1,5,8,9`) and by the `admin` middleware (`> 0`), but the users form offers only 0 User, 5 Editor, 8 Admin, 9 Super (`admin/users.blade.php:79-89`) |
| C24 | `/admin/promoteSelf` and level 8 as a tier | `UserController::promoteSelf` lets a level-8 admin raise itself to 9 with one click; effectively level 8 = level 9 |
| C25 | `config/services.php` postmark / ses / slack entries | framework defaults; nothing configures or uses them |

---

## 5. Open questions for the owner

Only gaps where the rules docs are silent or contradict the code, and a rebuild would otherwise guess. Parity (decision 6/7) is assumed
to mean "reproduce what the code stores" unless the owner says otherwise.

| # | Question | The gap |
|---|---|---|
| Q1 | **Generated predictions and the winner bonus.** Keep the code's behaviour? | CONTEXT.md > Generated prediction: "it earns no winner bonus". Code: `getGameOdds` returns odds 0 for a generated row and `winnerPoints(0) = (1+0) x 5`, so a correct generated row earns 5 (football) or 50 (euroleague) x rate. `ScoringService.php:150-157` records the contradiction (issue 214) and leaves it. Parity requires the code's number; the docs say otherwise. |
| Q2 | **Which survival rows are right when the two passes disagree?** | `Recalculation.php:38-42`: "Whether running one after the other is idempotent is an open question - see issue 216". `afterResultEntered` resolves the round from picks; `all()` folds stored rows. |
| Q3 | **Is "the fold reproduces the stored rows" an acceptable survival parity check?** | A loss nulls the picks behind the run (`resetUserSurvivalSequence`), so `point_survivals` cannot be recomputed from inputs for any broken run. Only live runs can be replayed. Decision 7 asks for every row recomputed. |
| Q4 | **Survival rounds: `event_survival` or `rate = 1`?** | The survival page appears when `events.event_survival = 1` (`NavVisibility::showSurvival`), but the survival summary and `getPointSurvivalEventID` list only events with `rate = 1` (`PredictionSurvivalController:138`, `PointSurvivalController:76`). A survival round with rate 2 would score but not show in the summary. |
| Q5 | **Tournament scoping of pages the docs do not mention.** Scope to the current tournament, or reproduce? | CLAUDE.md scopes the league table and histories (#226/#227) but these read across all tournaments: summary results game list (`getPredictionResultSummary`, no tournament filter), chart (`ChartController`, every scored game), compare per-round totals (`CompareController::getPerRoundComparison`), dashboard serija count (`MainController::getSnapshotData`), dashboard standings breakdown (`PointController::getPredictionStandingsUserPoints`, user only), standings summary (`Team::all()`, `getPredictionStandingProfile`), medal tally per league, the event dropdown on `/prediction/results` (`Event::orderBy('id')`), and every admin list (`Event::all`, `Team::all`, all games). |
| Q6 | **Which public league receives members when a league is deleted or left?** | `LeagueController:296,329,382` use `League::where('is_public', true)->first()` - the first public league in the database, not the one of the league's tournament. CLAUDE.md > Leagues says a league belongs to one tournament but does not say where displaced members go. |
| Q7 | **"You cannot leave your only league"** - per tournament or overall? | `leaveLeague` counts memberships in all tournaments. |
| Q8 | **Is "active" per player or per player-in-tournament?** | `user_settings.active` is global: 5 generated rows across all tournaments deactivate (`GeneratedPredictions::DEACTIVATE_AFTER`), any prediction save reactivates (`PredictionResultController:150`), and inactive players vanish from every league table and get no generated rows. CONTEXT.md only says "Enough of them deactivates the player". Is the threshold 5 a confirmed rule? |
| Q9 | **Admin tiers.** What do levels 1, 5, 8, 9 mean, and which tier may insert, edit and delete games? | Game insert/update/delete routes sit in the level-1 `admin` group, while the games view shows delete only to level >= 9 (`admin/games.blade.php:10,109`); event and message delete re-check >= 9 in the controller, game delete does not. Level 8 can self-promote (C24); level 1 is valid but not offered (C23). CLAUDE.md > Admin panel names three tiers, not the numbers. |
| Q10 | **What does deleting an account delete?** | Self-deletion (`ProfileService::deleteAccount`) removes memberships, points, predictions, settings and the user but not `audit_logins`, `audit_prediction_games`, `login_codes`, owned leagues or invites; admin delete (`UserController::deleteUser`) also removes the audits. `audit_prediction_games.user_id` is an FK without cascade, so self-deletion of a player with audit rows would fail on MySQL. Owned leagues keep existing with `owner_id = null`. |
| Q11 | **Fix the prediction-save lock check?** (a fix, not a rule change, but it changes behaviour) | `updatePredictionResultUser` checks the lock of the posted `gameID` (line 140) but updates the row named by `prediction_gameID` (line 151) without checking that it belongs to that game, so a crafted post can edit a locked prediction. The rebuild would check the row's own game. `gameWinnerID` is also not checked to be one of the two teams. |
| Q12 | **Half-entered and cleared results.** | `ResultController::updateResult` runs the pipeline when only one score is filled; `GameScorer::scoreOf` then throws a `TypeError` inside the transaction. Clearing both scores leaves that game's `point_results` in place, and `all()` never revisits unscored games. What should the new app do in both cases? |
| Q13 | **Seeding rows for teams added mid-tournament.** | Admin team insert seeds prediction rows only for the admin who inserts (`TeamController::insertTeams`); admin game insert seeds every member; the importer seeds everyone. Is "only the admin" intended? |
| Q14 | **Standings crowd multiplier as a rule.** | The standings points multiplier `(1 + log2(total/same))`, its denominators (players with a non-null prediction for that stage; `final > 0` for the final), rounding to 4 and float storage live only in `StandingPointsRow` - no rules doc states them. Parity needs them; confirm they are the spec. Same for the football table's away-sign flip (`getTablePoints`) and the crowd-odds formula/contrarian half-player. |
| Q15 | **Rounding when a value has more places than the column.** | Partial knockout credit `(1 + 0.59) x 2.5 = 3.975` and the euroleague `(1+odds) x 25` can exceed two places; MySQL stores the float's decimal string into DECIMAL(8,2) (round half away from zero). The new app must pick one rounding mode; confirm half-up is the rule (the checker will show whether any stored row depends on it). |
| Q16 | **Two definitions of "total".** | League table total = match + serija + standings + survival; public "Lyderiai", the hub top 5 and the welcome panel use match + serija only (`PlayerTotals` docblock "Standings and survival points are deliberately not in it"). CLAUDE.md > Leagues describes one rank rule but not which total each page ranks. Keep both? |
| Q17 | **Standings recalculation trigger.** | `point_standings` is rebuilt only by the separate `/admin/updateStandingPoints` button, for every tournament at once; `recalculateAllGamePoints` does not touch it. Keep a manual button, or recalculate when team outcomes are saved? |
| Q18 | **Hidden tournaments.** | `tournaments.is_public` is editable but the hub shows every tournament. Should a non-public tournament be hidden (then C7 is a missing feature, not dead)? |
| Q19 | **Username tie-break and case.** | `Ranking::sortLeaderboard` orders equal players by `strcasecmp` then `strcmp`; `PlayerTotals` orders by SQL `u.username` under MySQL's `utf8mb4_unicode_ci` (accent- and case-insensitive). Postgres collation will differ for Lithuanian letters. Which order is the rule? |
| Q20 | **Backup redaction.** | The old backup nulls `remember_token` and empties sessions/login codes (`BackupPolicy`); sportbet_new's `pg_dump` (Phase 1) dumps everything. Apply the same policy? |

---

## 6. Parity checker scope

### What it recomputes and compares

| Target | Recompute from | Compare |
|---|---|---|
| `point_results` (all columns except timestamps) | `games`, `events` (`rate`, `is_knockout`, `tournament_id`), `tournaments.standings_format`, stored `game_odds`, `prediction_results`, `points_calculations` | key set (user, game) - missing, extra - and each of `winner_points`, `difference_points`, `bingo_points`, `odds`, `odds_points`, `full_points` exactly at 2 places |
| `point_results.streak_bonus` | the recomputed rows above plus `prediction_results.generated`, walked per tournament in `game_date`, id order | exact at 2 places |
| `point_standings` (points and odds) | `teams` (actual outcomes, `tournament_id`), `prediction_standings`, `tournaments.standings_format` | key set (user, team) and each of the 12 columns; null vs 0 distinguished; floats compared to 4 places |
| `point_survivals` | stored `point_survivals` + `games` + `events` + format (the `SurvivalRun::fold` rebuild), plus a replay of live runs from `prediction_survivals` | each row's `survival_points`; replay covers only runs whose picks are still attached (Q3) |
| `game_odds` (secondary) | `prediction_results` with both scores (generated rows included) | 2 places; differences here explain `point_results` differences but are reported separately |
| Rankings (secondary, after slice 8) | the reproduced rows, `league_members`, `user_settings.active`, usernames | rank per player per league equal to `Ranking` on the old rows |

### Inputs it needs from a production copy

`tournaments`, `events`, `teams`, `games`, `game_odds`, `points_calculations`, `prediction_results` (incl. `generated`), `prediction_standings`,
`prediction_survivals`, `point_results`, `point_standings`, `point_survivals`, `user_settings` (`active`, for eligibility checks), `users` (ids, usernames),
`league_members` (for ranking checks). No personal fields beyond ids and usernames are needed; the reader can drop emails and names.

### Two oracles, not one

Stored production rows reflect whatever code last wrote them. CLAUDE.md > Workflow notes says a scoring change needs
`/admin/recalculateAllGamePoints` run on production, and standings need `/admin/updateStandingPoints`; if either was skipped after a rule
change (issues 232 ordering, 217 survival scoping, 178 survival values, 92 standings points, 229 precision), stored rows disagree with the
current PHP code. The checker therefore compares against (a) the production copy as dumped and (b) the same copy after the old app's two
recalculation passes run on it. A row that differs in (a) but matches in (b) is stale production data, not a new-code bug.

**The owner's choices (2026-09-30, `docs/superpowers/specs/2026-09-30-parity-checker-design.md`):** both oracles, and (b) is run by the
checker itself, in sportbet's image at the commit production runs, on the throwaway copy - no manual step. Parity holds when no row is
`new-code-wrong` (the new code under `sportbetRules` against (b)); `stale` rows are counted, and production is recalculated before
switch-over so they go. The report may name players by username on the owner's PC; an issue gets only the verdict and the counts per class.

### Edge cases the rules docs call out (each needs a checker fixture)

1. Knockout, football: right team + right ending (full, predicted odds); right team wrong ending (half, **actual** odds, stored `odds` = actual);
   right draw path wrong shoot-out winner (half, actual odds); wrong team (0, stored `odds` = 0); bingo needs the shoot-out winner on a draw
   (CLAUDE.md > Knockout games).
2. Euroleague knockout scores exactly like a group game (CLAUDE.md > Knockout games, `GameScorer` branches unreachable).
3. Negative difference points, both rules, summed without a floor (#71); football table values down to -18/2.
4. Football table clamp at 7 and the away-sign flip when home was over-predicted (`getTablePoints`).
5. Missing `game_odds` row scores as 1.0/1.0/1.0 (`doUpdateGamePoints`); outcome nobody picked gets the contrarian `log2(total/0.5)`;
   double rounding 4 then 2 (log2(3/2) -> 0.59, #220).
6. Generated rows: odds 0, still earn `(1+0) x bonus` (Q1), never extend a serija; a generated knockout draw has no shoot-out winner.
7. Unanswered prediction (either score null) produces no row; inactive players get no generated row and so break their serija.
8. Serija: per tournament (#122), kick-off order not id order (#232), bonus `(len-1) x step x rate`, step 1 football / 10 euroleague (#97),
   a partial breaks it, a missing row breaks it.
9. Standings: stage the format does not play, or no team holds its flag yet, stores **null** not 0; final counted once any team has a place;
   two-place final uses the matrix corner (36/27); position points floored at zero (football 3/1, euroleague 190/10); `stage_points` default map
   with euroleague override (60/120) (CLAUDE.md > Standings formats, config/standings.php).
10. Survival: running totals (12, 22, 34), home 10 / away 12 euroleague, flat 10 football (#178); loss stores 0 and resets only that
    tournament's run (#217); draw decides nobody and does not break the run (#179); a team playing twice in a round is paid once;
    `event_day`, id ordering in the fold.
11. Multi-tournament players: two independent serija walks and survival runs; league totals count one tournament only (#226/#227).
12. Precision: stored values are 2-place decimals, ranking compares to the cent and displays 1 place (#229); a float left-over must not split a tie.
13. Rates are integers (#34); `full_points` = sum of the three components each already multiplied by rate.
14. Data shapes: `generated` blob `'1'`/`'0'`/NULL; one-sided actual scores (Q12); stale rows for games whose result was cleared; `point_results`
    rows whose game or event no longer exists (FKs were added late, `2026_09_16_*`).

### What it cannot check, and should say so in its report

- Generated scores themselves are random (`random_int`), so the checker takes stored generated predictions as input rather than regenerating them.
- Broken survival runs (Q3).
- `game_odds` for games whose predictions changed after the result was saved (not possible through the UI, but possible by hand).

---

*Prepared read-only. Files read in full: old `CLAUDE.md`, `CONTEXT.md`, `routes/*.php`, `config/{points,scores,standings,help}.php`, every
migration, and the controllers, services and support classes named above; the rest was surveyed by grep for callers and links.*
