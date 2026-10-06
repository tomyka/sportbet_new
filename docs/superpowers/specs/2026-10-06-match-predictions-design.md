# Slice 6: match-result predictions

A5 of `docs/phase-2-inventory.md`. Built in three parts on one spec: **6a**,
the predictions list and its navigation entry; **6b**, saving a prediction;
**6c**, the single-game page.

Binding: decisions 5, 10 and 13; LR-1, R-2, R-6, R-7, R-10, R-13, R-15,
R-19, R-40, R-41, R-50, R-51 and the new R-57 to R-60
(`docs/owner-rulings.md`); the 4b/4c/5 rules in `CLAUDE.md` (cookies,
sessions, route handlers answering a real 303, same-origin checks).

## The reference

sportbet at **3eb95e7**: `app/Http/Controllers/PredictionResultController.php`
(list 34-145, save 151-225, single game 425-453),
`app/Http/Requests/UpdatePredictionResultRequest.php`,
`app/Http/Controllers/GameOddsController.php`,
`app/Http/Controllers/AuditPredictionGameController.php`,
`app/Support/{GameLock,MissingPredictions,PointsFormat,ScoreFormat}.php`,
`config/scores.php`, `resources/views/prediction/{results,game-single}.blade.php`,
`resources/views/partials/{rail,bottom-nav}.blade.php`, `routes/web.php`
(114-116, 256-258), and its tests (PredictionSaveTargetTest,
AuditPredictionTest, ScoreFormatTest, HalfTypedPredictionTest,
PredictionRefusalTest, PredictionsPageTournamentScopeTest,
ScoreInputSizeTest, SingleGamePredictionTest, Unit/GameLockTest).

## Owner answers at the brainstorm (2026-10-06)

- Clearing a prediction does not switch a player back on; only a saved
  score does (R-57, a `RuleSet` field).
- "Visi etapai" shows every round (R-58).
- A refused save shows the server's reason (R-59).
- The prediction history starts empty at switch-over (R-60).

## Lead decisions (technical)

- **Odds on read.** `game_odds` is derived only through
  `recalculateTournament`, which ignores odds stored for an unscored game.
  The list's odds panel and the save's answer therefore compute the odds
  from the game's current votes with `CrowdOdds.forGame` under the rule set,
  and store nothing on save. Points are unchanged: odds are fixed at result
  entry (CO-7). A cleared prediction no longer leaves stale stored odds, as
  sportbet's does.
- **Sign-in returns to the prediction pages.** The guarded return paths
  (`guardedReturnPath`) grow to `/prediction/results` (with an optional
  `?event=<id>`) and `/prediction/game/<id>`, so the reminder mail's link
  works after sign-in; each shape checked as strictly as the form's.
- **R-50 on a game.** `/prediction/game/<id>` answers 404 for a game of a
  tournament the viewer may not see, as the tournament page does.
- **After a save on the single-game page** the player goes to
  `PLAYER_HOME` (`/` until slice 8 builds `/main`).

## Design

### Domain

- `predictMatch({ prediction, player, game, entry, now, rules, status })`:
  refused, in order, `not-yours` (the row is not the player's, sportbet
  issue 254), `closed` (`Game.isOpenAt` false: result, R-13's lock, R-41's
  postponement, tip-off passed), then `MatchPrediction.enter`'s refusals
  (whole number, 50-120, level, half-typed R-15). Accepted: the new
  prediction (scores or cleared, `origin` real), and the status change -
  under `ruledRules` only when a score is saved (R-57) and through
  `PlayerStatus.afterRealPrediction` (R-7, R-19: switched back on and the
  count reset in that tournament, an admin hide kept); under
  `sportbetRules` on any accepted save, as sportbet. `RuleSet` gains the
  R-57 field, tested under both sets.
- `winnerPointsAt(odds, rate)`: the panel's "+X pt" per outcome, sportbet's
  `PointsFormat::winnerPointsAt` (round((1+odds)*50*rate, 1)), from the
  scoring module's winner bonus, the round's rate under the rule set
  (R-10).
- The list's grouping (round, then Vilnius day, then tip-off) and the
  default round (`Season.currentRound`, R-6, R-40) are domain functions;
  the badge count is "open games of the current round without a score".

### Database

- `savePrediction(db, ...)`: in one transaction, the `match_predictions`
  row, the tournament player's status, and an `audit_prediction_games` row
  (new table: player, game, old and new scores, when; no IP, R-45) when a
  score is saved, as sportbet writes it only then. Erased with the account
  (R-25).
- `loadPredictionsPage(db, viewer, tournament, round | 'all', now, rules)`:
  the player's rows of that tournament with their points and the live odds
  of each open game, grouped as the domain says; the round menu.
- `countMissingPredictions(db, player, tournament, now, rules)` for the
  "Spėjimai" badge.
- The reader reads no audit table (R-60).

### Web - 6a: the list

- `/prediction/results` (signed in; a guest goes to sign in and comes
  back): sportbet's page - the round menu with "Visi etapai" (R-58), days
  as sportbet's Lithuanian headers, times in Vilnius (R-51), scored rows
  "actual / predicted" with the points breakdown (Nugalėtojas, Skirtumas,
  Tikslus, Serija), locked rows disabled, open rows with the two score
  boxes and the odds panel (no draw column for Euroleague).
- "Spėjimai" in the rail and the phone bar, with sportbet's basketball icon
  and the badge (`ShellView.badges.results`, "Pateikti ne visi dienos
  rungtynių spėjimai.").

### Web - 6b: saving (sensitive)

- `POST /prediction/results`, a same-origin route handler, takes sportbet's
  fields (`gameID`, `prediction_gameID` as the game of the player's own
  row, `homeTeamScore`, `awayTeamScore`); answers sportbet's shapes: 200
  `{success:true, home_odds, draw_odds, away_odds}`, 422
  `{success:false, message}` for a refusal ("Šios prognozės išsaugoti
  negalima.", "Šio mačo prognozuoti nebegalima."), 422 `{message, errors}`
  for validation with sportbet's texts ("Rezultatas turi būti nuo :min iki
  :max.", "Įveskite abu rezultatus.", "Lygiosios negalimos - komandų
  rezultatai turi skirtis.").
- The autosave client as sportbet's: saves when both boxes are filled or
  both empty, client-side range and draw checks, marks saved/cleared,
  redraws the panel from the answer, refreshes the badge; a refusal shows
  its message (R-59), a failure "Spėjimas neišsaugotas. Bandykite dar
  kartą.".

### Web - 6c: the single-game page

- `/prediction/game/[id]` (signed in): sportbet's "Spėjimas" page - teams,
  "vs", tip-off "Y-m-d H:i LT" in Vilnius; locked: "Žaidimas jau
  prasidėjo - spėjimų keisti negalima." and "Jūsų spėjimas"; open: the
  form and "Išsaugoti spėjimą"; no row: "Spėjimas nerastas. Bandykite dar
  kartą nuo" and "pagrindinio puslapio". Unknown or hidden (R-50): 404.

## Testing

- Domain: `predictMatch` refusals in order; R-57 and R-7/R-19 under both
  sets; `winnerPointsAt` against golden EL h1-h3; grouping, default round,
  badge count.
- Database: the save's transaction (row, status, audit) and its rollback;
  audit only on a saved score; erasure with the account; the page query
  and the badge.
- Feature: every save answer (issue 254 cases, lock, each validation text,
  cross-site 403, guest), the list for a member, "Visi etapai", the return
  after sign-in to both pages, the single game's states and 404s.
- E2E at 390 and 1280: predict, autosave and the panel, a locked game's
  refusal message, the single-game page.

## Done means

On staging the owner enters predictions for open games, sees autosave and
the odds panel update, gets "Šio mačo prognozuoti nebegalima." on a started
game, opens a single-game link (signed out: through sign-in and back); the
parity run still holds; every sportbet rule above has a named test.
