# Euroleague rules catalogue

Issue: [#5](https://github.com/tomyka/sportbet_new/issues/5) (Phase 2.1, the
Euroleague scoring domain), part of epic #1. Status: **draft for the owner's
sign-off**; no domain code is written until it is signed off (issue #5,
acceptance criterion 1).

## Purpose

Every rule the Euroleague scoring domain (`packages/domain`, decision 10) must
implement, in one place, each with where it comes from, a worked example with
Euroleague numbers, the ruling that changes it (if any) and the unit test it
implies. Football is out of scope (decision 11); where sportbet's code runs
Euroleague through a path it shares with football and that changes a
Euroleague number, the entry says so, and the section *Shared football paths*
lists them together.

## Sources, in order of authority

1. `docs/owner-rulings.md` (R-1 to R-40): the owner's rulings. They override
   sportbet's docs for the **ruled** set.
2. sportbet's `CONTEXT.md` and `CLAUDE.md` (`D:\Projects\sportbet`, read in
   full at `0da316f`).
3. sportbet's code at `0da316f`: what produced production's stored points.
   File references below are relative to `D:\Projects\sportbet`.
4. `docs/phase-2-inventory.md` section 6 and the production facts at the end
   of `docs/old-app-audit-2026-09-28.md`.
5. The golden master: `tests/Support/GoldenScenario.php` and
   `tests/Fixtures/golden-points.json` in sportbet.

Where the docs and the code disagree and no ruling settles it, the entry
states what the code does (that is what the stored points were computed
with) and the disagreement is an open question at the end. Nothing here is a
rule invented for the rebuild.

## The two rule sets

- **sportbet**: what production's stored points were computed with - the
  code at `0da316f`, including its documented quirks. The parity checker
  (decision 7) runs the domain under this set and must reproduce every stored
  Euroleague row.
- **ruled**: sportbet plus the owner's rulings. Where no ruling touches a
  rule, ruled is identical to sportbet. This is the set sportbet_new goes
  live with.

Each entry ends with a **Sets** line: `same` when no ruling changes it,
otherwise both behaviours and the ruling.

Rulings R-4, R-11, R-13 and R-15 are also being fixed in the live sportbet
(epic tomyka/sportbet#285). They change what may be *entered* (picks,
moves, half-typed scores), not how stored inputs score, so the sportbet set
still scores whatever production holds, including rows written before the
fix.

## Conventions

- Times are UTC; Vilnius time is display only (CLAUDE.md > Time and the
  lock).
- "Fill-in" is the owner's word for sportbet's *generated prediction*.
- "Rate" is a round's whole-number multiplier.
- Odds are written to two places, standings values to four.
- **Rounding is decimal, half away from zero**, as PHP's `round()` does it
  (`round(1.005, 2)` is `1.01`, `round(0.585, 2)` is `0.59`). A binary-float
  implementation in JavaScript gets some of these wrong: `Math.round(1.005 *
  100) / 100` is `1`, and rounding `log2(3/2)` once to two places gives
  `0.58`. The domain ports PHP 8.4's `round()` and proves it against a table
  PHP itself generated (`packages/domain/test/php-reference/`). Decision 10
  already asks for points as exact decimals; CO-2 and ST-9 are where it bites.
- Test names are the `it(...)` strings of Vitest, prefixed with the area.

---

## 1. Locks and rounds

**LR-1. A game takes predictions only while it has no result and its tip-off
is still in the future.** At the tip-off second it is closed; a result
entered early closes it at once.
- Source: `app/Support/GameLock.php:85-88` (`isOpen`), `:130-133` (`openSql`,
  `game_date > now`); CONTEXT.md > Lock.
- Example: Zalgiris - Olympiacos tips off 2026-10-02 18:00:00 UTC (21:00 in
  Vilnius). A save at 17:59:59 is accepted; at 18:00:00 it is refused. If the
  admin enters 88-79 at 16:00 by mistake, the game is closed from 16:00.
- Sets: same. (sportbet's save path checked the lock of the posted game, not
  of the row it wrote - audit issue 1; production fact P6 shows the hole was
  never used. The rule is unchanged.)
- Tests: `lock: a game is open one second before tip-off`, `lock: a game is
  closed at the exact tip-off second`, `lock: a game with a result is closed
  before its tip-off`.

**LR-2. Moving a game's date later reopens it only if it had not locked.**
- Source: sportbet: the lock is computed from the current `game_date` alone
  (`GameLock.php:85-88`), so moving the date reopens it (audit Q8). Ruled:
  R-13.
- Example: Baskonia - Partizan, 2026-11-13 18:00, is postponed at 18:30 to
  2026-12-10 18:00. sportbet: predictions reopen until 12-10, after players
  have seen each other's. Ruled: it stays closed with the predictions made by
  11-13 18:00. Moved at 11-12 instead (before tip-off): both sets reopen.
- Sets: sportbet reopens always; ruled reopens only if the original tip-off
  had not passed (R-13).
- Tests: `lock (ruled): a game moved after its tip-off stays closed`, `lock:
  a game moved before its tip-off reopens`, `lock (sportbet): a moved game
  reopens by the new date`.

**LR-3. The current round decides where a survival pick goes and which round
players are shown.**
- Source: sportbet: the round of the earliest game without a result, by
  tip-off (`app/Http/Controllers/SessionController.php:36-47`; CONTEXT.md >
  Event; CLAUDE.md > Session-driven state). Ruled: R-6.
- Example: round 8's Baskonia - Partizan is postponed to 2026-12-10; round 9
  starts 2026-11-18. sportbet: the current round stays 8 until 12-10, so a
  survival pick made on 11-18 is a round-8 pick and nobody can pick for rounds
  9-14. Ruled: from 11-14 the current round is 9 (its next game is soonest).
- Sets: sportbet earliest unplayed game; ruled round whose next game starts
  soonest (R-6).
- Tests: `round (sportbet): a postponed game holds the current round`,
  `round (ruled): the current round is the one whose next game starts
  soonest`.

**LR-4. Every round has a whole-number rate that multiplies all its match
points and its serija bonus.** It does not multiply survival or standings.
- Source: CLAUDE.md > Scoring logic ("summed and multiplied by the event
  rate", `events.rate` whole numbers only, #34); `app/Services/ScoringService.php:192-210`;
  `app/Services/StreakService.php:144-147`. The importer creates every
  regular-season round at rate 1 (`app/Services/Import/EuroleagueScheduleImporter.php:211-223`);
  anything else is set by an admin. Ruled: R-10.
- Example: play-off game, Real Madrid 84 - Panathinaikos 78. A player
  predicted 85-80 at home odds 0.32: winner 66, margin 49, bingo 0 = 115;
  at rate 2 it stores winner 132, margin 98, full 230.
- Sets: sportbet: whatever the admin set per round (regular season 1 from
  the importer). Ruled: regular season 1, play-in 1, play-offs 2, Final Four
  (both semi-finals and the third-place game) 3, final 3 (R-10). Every
  post-season game is predicted (R-10).
- Tests: `rate: every component is multiplied by the round rate`, `rate
  (ruled): the post-season rates are play-in 1, play-offs 2, Final Four 3,
  final 3`, `rate: survival and standings are not multiplied`.

**LR-5. Entering a result runs one fixed sequence; correcting it reruns the
sequence.**
- Source: `app/Services/Recalculation.php:221-234`: fill-ins, then survival,
  then crowd odds, then match points for the game, then the serija for all
  games. The full recalculation (`:241-262`) rescores every game with a
  result from the stored odds, without fill-ins or new odds, then the serija
  and survival (see SU-10). Ruled: R-5, R-16.
- Example: the admin types 80-78 for Monaco - Virtus (it was 78-80) and fixes
  it a minute later. sportbet: match points and the serija are recomputed
  correctly, but everyone who picked Virtus in survival stays knocked out
  and the Monaco pickers are then knocked out too; fill-ins made by the first
  entry stay. Ruled: as if the mistake never happened (R-5; SU-9, FI-4).
- Sets: sportbet recomputes points but not the side effects; ruled replays
  (R-5). Clearing a result: sportbet leaves that game's points in place
  (audit issue 10; production fact P10 finds none); ruled, a cleared game has
  no points (it is unscored).
- Tests: `result: a correction replaces the game's points`, `result (ruled):
  a correction replays the game as if the mistake never happened`, `result:
  a cleared result leaves no points`.

**LR-6. A finished tournament is frozen.**
- Source: sportbet: every recalculation rescores every tournament ever played
  (audit Q19; `Recalculation.php:241-245` takes every game with a result).
  Ruled: R-21 (finished = end date passed and every game scored), R-22.
- Example: after Euroleague 2026-27 ends, a later season changes a rate or a
  standings value. sportbet: pressing recalculate rewrites 2026-27 under the
  new values. Ruled: 2026-27's points never change.
- Sets: sportbet rescores all; ruled freezes finished tournaments (R-21,
  R-22).
- Tests: `tournament (ruled): a finished tournament is not recalculated`,
  `tournament (ruled): a tournament is finished only when its end date has
  passed and every game is scored`.

---

## 2. Match prediction scoring

**MS-1. A prediction is two whole scores from 50 to 120 that are not level;
blank is allowed.**
- Source: `config/scores.php:188-192`; `app/Http/Requests/UpdatePredictionResultRequest.php:28,59-80`;
  CLAUDE.md > Score formats ("Blank stays valid", a level score is refused).
  Ruled: R-15.
- Example: 85-80 accepted; 85-85, 49-80 and 121-80 refused; both boxes blank
  accepted. 85 with the away box blank: sportbet saves it; ruled refuses it
  ("enter both scores").
- Sets: sportbet stores half-typed predictions; ruled refuses them (R-15).
- Tests: `prediction: a level score is refused`, `prediction: a score below
  50 or above 120 is refused`, `prediction: two blanks are a valid unanswered
  prediction`, `prediction (ruled): a half-typed prediction is refused`.

**MS-2. An unanswered prediction scores nothing: no points row at all, not a
row of zeros.**
- Source: `app/Services/GameScorer.php:300-302`; `app/Http/Controllers/PointResultController.php:361-365`.
  For a half-typed sportbet row: fill-ins only replace rows whose *home*
  score is blank (`app/Services/GeneratedPredictions.php:325-327`).
- Example (sportbet): a player typed 85 for Zalgiris and left Olympiacos
  blank; at the result the row is not filled in (home is not blank) and
  scores nothing, which also breaks the serija (SE-2). A player who left
  Zalgiris blank and typed 80 for Olympiacos has both scores overwritten by
  a fill-in. Ruled: neither row can exist (R-15); a blank row is filled in
  (FI-1).
- Sets: the half-typed cases exist only in the sportbet set (R-15).
- Tests: `score: an unanswered prediction produces no points row`, `score
  (sportbet): a home-only prediction is not filled in and scores nothing`,
  `fill-in (sportbet): an away-only prediction is overwritten by a fill-in`.

**MS-3. Naming the winner pays (1 + odds) x 50; the wrong winner pays 0.**
- Source: `config/points.php:102`; `app/Support/PointsFormat.php:148-151`;
  `GameScorer.php:329-349`; CLAUDE.md > Scoring logic.
- Example (golden, `ada / EL h1`): Zalgiris 88 - Olympiacos 79, ada predicted
  85-80, home odds 0.59: winner points (1 + 0.59) x 50 = 79.5.
- Sets: same.
- Tests: `winner: the right winner pays (1 + odds) x 50`, `winner: the wrong
  winner pays 0`.

**MS-4. The odds used are the crowd odds of the outcome the player predicted,
and they are stored even when the call was wrong.**
- Source: `ScoringService.php:158-176` (home odds for a predicted home win,
  away odds for an away win; draw odds are unreachable, CLAUDE.md > Score
  formats); `GameScorer.php:331-348`.
- Example (golden, `ben / EL h1`): ben predicted 79-88, Olympiacos away; they
  lost. Stored odds 1.59 (the away odds), winner points 0. In a round flagged
  knockout the stored odds are 0 instead (MS-8).
- Sets: same.
- Tests: `odds: a home call uses the home odds`, `odds: a wrong call in a
  regular-season round stores the predicted outcome's odds`.

**MS-5. Margin points are 50 minus how far the predicted margin was from the
real one, paid whether or not the winner was right, with no floor.**
- Source: `ScoringService.php:52-67` (`50 - abs(predictedDiff - actualDiff)`,
  a difference is home minus away); CLAUDE.md > Scoring logic ("Unclamped and
  may go negative", the owner declined a floor, #71); `config/points.php:106-109`.
- Examples (golden): 88-79 predicted 85-80: 50 - |5 - 9| = 46 (`ada / EL
  h1`). 70-95 predicted 120-50: 50 - |70 - (-25)| = -45 (`ada / EL h2`). The
  wrong winner still earns margin points: 88-79 predicted 79-88: 50 - |-9 -
  9| = 32 (`ben / EL h1`).
- Sets: same.
- Tests: `margin: 88-79 predicted 85-80 scores 46`, `margin: a prediction 95
  points off the margin scores -45`, `margin: the wrong winner keeps its
  margin points`.

**MS-6. An exact score adds 20.**
- Source: `config/points.php:104`; `GameScorer.php:343-346`; CLAUDE.md >
  Scoring logic.
- Example (golden, `ada / EL h3`): Zalgiris 90 - Fenerbahce 85 predicted
  90-85 at odds 0.59: 79.5 + 50 + 20 = 149.5.
- Sets: same.
- Tests: `exact score: pays 20 on top of the winner and a full 50 margin`.

**MS-7. A game's points are the three components, each multiplied by the
rate, summed.** The stored row carries the multiplied components and their
sum.
- Source: `ScoringService.php:192-210`; `PointResultController.php:70-84`.
  `odds_points` is always stored as 0 (`ScoringService.php:181-203`, #215).
- Example: see LR-4 (132 + 98 + 0 = 230 at rate 2).
- Sets: same.
- Tests: `points: full points are the sum of the rated components`, `points:
  odds points are always 0`.

**MS-8. A round flagged knockout scores the same points, but a wrong call
stores odds 0.** (shared football path)
- Source: `GameScorer.php:365-409`; the half-credit branches are unreachable
  when neither the prediction nor the result can be level (CLAUDE.md >
  Knockout games, Euroleague paragraph; `GameScorerMatrixTest::test_a_euroleague_playoff_scores_identically_to_the_group_game`);
  the wrong-team branch sets odds to 0 (`:395-398`; audit R26 "keep for
  parity"). The importer never sets the flag (`EuroleagueScheduleImporter.php:211-220`);
  an admin can (`app/Http/Controllers/EventController.php:39,70`).
- Example (golden, `ben / EL h3`, round E2 flagged knockout): Zalgiris 90 -
  Fenerbahce 85, ben predicted 85-90: winner 0, margin 40, stored odds 0.00.
  The same call in a regular-season round stores odds 1.59. Points are
  identical either way.
- Sets: sportbet as above. Ruled: no ruling; R-10 says post-season games are
  "predicted like regular-season games". The stored odds of a wrong call are
  not shown to players anywhere found, so this is a parity detail, not a
  points difference; the ruled domain needs no knockout flag for Euroleague.
- Tests: `knockout round (sportbet): a wrong call stores odds 0`, `knockout
  round: points equal the same prediction in a regular round`.

**MS-9. Euroleague match points never need rounding: every component is a
multiple of 0.5.**
- Source: odds have two places (CO-2) and are multiplied by 50; margin and
  bingo are whole; rates are whole (LR-4). R-31. Stored columns are
  DECIMAL(8,2) (`tests/Feature/GoldenPointsTest.php` `TWO_DECIMAL_COLUMNS`).
  The one exception is MS-10's level-result case.
- Example: odds 0.32 pays 66.0; 0.59 pays 79.5; 1.91 pays 145.5.
- Sets: same.
- Tests: `points: every match component is a multiple of 0.5`.

**MS-10. A level result (only possible by admin error) pays no winner points
in a regular round, and half credit at the draw odds in a knockout-flagged
round with a recorded winner.** (shared football path)
- Source: the admin's result entry is deliberately unbounded (CLAUDE.md >
  Score formats, "Bounds are not applied to admin-entered actual results";
  `app/Http/Controllers/ResultController.php:39-63`). Regular round:
  `ScoringService.php:115-126` (no prediction can be level). Knockout:
  `GameScorer.php:383-394` (the football partial branch,
  `(1 + actual odds) x 25`, `config/points.php:103`).
- Example: the admin types 81-81 for Anadolu Efes - Virtus Bologna with 10
  votes (draw odds log2(20) = 4.32). Regular round: nobody gets winner
  points, everybody's serija breaks, no survival picker is decided
  (`app/Support/SurvivalRun.php:341-354`). Knockout-flagged round with Efes
  recorded as winner: an Efes caller gets (1 + 4.32) x 25 = 133.0; with draw
  odds 2.59 it would be 89.75, which breaks MS-9's half-point rule.
- Sets: same (no ruling) - open question 7.
- Tests: `level result (sportbet): nobody earns winner points in a regular
  round`, `level result (sportbet): a knockout round pays half credit at the
  draw odds`.

---

## 3. Crowd odds

**CO-1. The odds of an outcome are log2(votes / votes for that outcome).**
- Source: `app/Support/CrowdOdds.php:224-227`; `app/Http/Controllers/GameOddsController.php:283-311`;
  CONTEXT.md > Odds (shape only; the formula is code only, inventory Q14).
- Example: 10 votes on Zalgiris - Olympiacos, 8 home, 2 away: home log2(10/8)
  = 0.32, away log2(10/2) = 2.32. A right home call pays 66, a right away
  call 166.
- Sets: same (what counts as a vote differs, CO-6).
- Tests: `odds: log2 of votes over votes for the outcome`.

**CO-2. Odds are rounded to four places, then to two.**
- Source: `CrowdOdds.php:241-244` (#220); stored in DECIMAL(8,2).
- Example (golden `EL h1`): 3 votes, 2 home: log2(1.5) = 0.58496 -> 0.5850
  -> **0.59** (rounding once gives 0.58). Away log2(3) = 1.58496 -> 1.59. A
  binary-float `Math.round` gives 0.58 here; the domain must round in
  decimal.
- Sets: same.
- Tests: `odds: log2(3/2) is stored as 0.59, not 0.58`.

**CO-3. An outcome nobody picked gets the contrarian odds log2(votes / 0.5).**
- Source: `CrowdOdds.php:230-233`; `GameOddsController.php:305-311`.
- Example: 10 votes, all home: away odds log2(20) = 4.32, shown on the
  panel as +266 for an away call. Nobody is ever paid at these odds in
  Euroleague: anyone who predicted that outcome is a vote for it, and a
  fill-in's odds are 0 (FI-3). The draw always gets them (golden `EL h1`
  draw 2.59), and they are hidden because draws are impossible (CLAUDE.md >
  Score formats). The one payout is MS-10.
- Sets: same.
- Tests: `odds: an outcome nobody picked gets log2(votes / 0.5)`.

**CO-4. A game with no votes has odds 0 for every outcome.**
- Source: `GameOddsController.php:291-293`.
- Example: a game where nobody predicted and nobody was filled in (every
  player switched off): odds 0/0/0; nobody is scored anyway. Ruled: a game
  with only fill-ins has no votes (R-2), so 0/0/0, and fill-ins use odds 0
  regardless (R-1).
- Sets: same.
- Tests: `odds: no votes gives 0 for every outcome`.

**CO-5. A game with no stored odds is scored at odds 1.0 for every outcome.**
- Source: `PointResultController.php:334-338`. Reachable only in the full
  recalculation, which uses stored odds (LR-5); the per-result sequence
  always writes odds first (`Recalculation.php:185-190`).
- Example: a scored game whose odds row is missing: a right call pays (1 + 1)
  x 50 = 100 and stores odds 1.00.
- Sets: sportbet only as a parity case; the ruled domain computes odds from
  the votes and has no "missing" state.
- Tests: `odds (sportbet): a game with no odds row scores at 1.0`.

**CO-6. What counts as a vote.**
- Source: sportbet: every prediction of the game with both scores, from any
  registered player (switched off, hidden or in any league), real or filled
  in - and fill-ins are written before the odds at result entry
  (`GameOddsController.php:285-289`; `Recalculation.php:223-229`). Before
  tip-off the panel shows only real predictions, because no fill-in exists
  yet. One set of odds per game, for every league (CONTEXT.md > Odds,
  #227). Ruled: R-2 (and R-9: a late joiner's fill-ins are not votes).
- Example: 10 real predictions, 8 Zalgiris, 2 Olympiacos; 5 absent players
  are filled in with 3 Zalgiris and 2 Olympiacos. sportbet: 15 votes, 11
  home: log2(15/11) = 0.45, a right home call pays 72.5 (the panel had
  promised 66); away log2(15/4) = 1.91 pays 145.5. Ruled: 10 votes: 66 and
  166.
- Sets: sportbet counts fill-ins; ruled counts only real predictions (R-2).
- Tests: `odds (sportbet): fill-ins are votes`, `odds (ruled): only real
  predictions are votes`, `odds: every league scores on the same odds`.

**CO-7. Odds are fixed when the result is entered, not at a full
recalculation.**
- Source: odds are recomputed on every prediction save (inventory A5) and at
  every result entry (`Recalculation.php:229`); the full recalculation keeps
  the stored odds (`Recalculation.php:196-200`).
- Example: a result is re-entered after a correction: odds are recomputed
  from the rows at that moment (including sportbet's fill-ins). A full
  recalculation a month later reuses them.
- Sets: same (ruled computes them from the real predictions at the lock,
  which cannot change afterwards, so the difference is only where the value
  comes from).
- Tests: `odds: the full recalculation reuses the odds the game was scored
  with`.

---

## 4. Filled-in predictions

**FI-1. A player who did not predict gets a fill-in when the result is
entered, unless switched off.**
- Source: `GeneratedPredictions.php:321-358` (rows of that game with a blank
  home score, players not switched off, flagged `generated`); CONTEXT.md >
  Generated prediction. A player with no prediction row for a game gets
  nothing: rows are created at registration and when games are added
  (`app/Support/PredictionRows.php:22-24`). Ruled: R-15 ("missed at tip-off:
  both scores are filled in"), R-7, R-9.
- Example: 30 players, 26 predicted Zalgiris - Olympiacos, 3 did not, 1 is
  switched off. At the result, the 3 get fill-ins; the switched-off player
  gets none and scores nothing for the game.
- Sets: same trigger in effect (a game cannot be predicted after tip-off, so
  "at the result" and "at tip-off" fill the same rows). Whether a
  switched-off player is filled in under the ruled set is open question 1.
- Tests: `fill-in: an unanswered prediction is filled in`, `fill-in
  (sportbet): a switched-off player gets no fill-in`.

**FI-2. A fill-in side is 55 plus three rolls of 0-17; a level pair is nudged
one point apart.**
- Source: `config/scores.php:202-206`; `app/Support/GeneratedScore.php:421-494`
  (the away side moves up or down one at random, staying within 50-120).
- Example: rolls 9, 12, 4 and 17, 3, 5 give 80-80; the away side becomes 79
  or 81. Every fill-in lies within 55-106.
- Sets: same. The scores are random, so parity takes stored fill-ins as
  inputs (inventory section 6, "What it cannot check"); the domain takes the
  generator as a port.
- Tests: `fill-in score: each side lies within 55-106`, `fill-in score: a
  level pair is moved one point apart`.

**FI-3. A fill-in scores like a real prediction with the same score, with its
odds counted as 0.**
- Source: `ScoringService.php:158-166`; R-1 (confirms the code; CONTEXT.md's
  "earns no winner bonus" is wrong). The help page already says so
  (`resources/views/help.blade.php:23`).
- Example: fill-in 82-76 on a real 88-79: winner (1 + 0) x 50 = 50, margin
  50 - |6 - 9| = 47, total 97, stored odds 0. An exact fill-in also gets the
  20. Production holds 2 such rows, 100 points in all (audit P23).
- Sets: same (R-1). Fill-ins break a serija (SE-1) and, in sportbet, are
  votes (CO-6).
- Tests: `fill-in: a right winner pays the flat 50`, `fill-in: stored odds
  are 0`, `fill-in: an exact fill-in pays the 20`.

**FI-4. A fill-in caused only by a mistaken result is removed when the result
is corrected.**
- Source: sportbet keeps it (audit Q4; `Recalculation.php:221-234` has no
  undo). Ruled: R-5.
- Example: the admin enters Partizan - Monaco on 11-20 at 16:00, two hours
  before tip-off, then clears it. sportbet: the 4 players who had not yet
  predicted keep their fill-ins (each counting toward being switched off)
  unless they notice and overwrite them before 18:00. Ruled: the fill-ins
  are removed.
- Sets: sportbet keeps; ruled removes (R-5).
- Tests: `fill-in (ruled): fill-ins made by a mistaken early result are
  removed`.

---

## 5. Serija

**SE-1. Only a real prediction that named the winner extends a serija.** A
fill-in never does; a negative margin does not matter.
- Source: `app/Support/SerijaCorrectness.php:90-121` (not generated and
  winner points above 0; a knockout-flagged round also needs the right team,
  which in Euroleague is the same thing); CLAUDE.md > Streak (Serija) bonus;
  CONTEXT.md > Serija; `EuroleagueGameScoringTest::test_a_negative_difference_does_not_break_the_streak`.
- Example: the right winner with margin points -10 extends the run. A fill-in
  that named the winner (50 points) ends it.
- Sets: same (R-1 keeps fill-ins' points, not their serija).
- Tests: `serija: a real right-winner call extends the run`, `serija: a
  fill-in ends the run`, `serija: a negative margin does not end the run`.

**SE-2. The run is walked per tournament, in tip-off order, and any game
without a points row for the player ends it.**
- Source: `app/Support/StreakWalker.php:21-46`; `PointResultController.php:109-132`
  (every game with a result, by `game_date` then id; #122, #232).
- Example: a round-8 game postponed to 2026-12-10 is walked at 12-10,
  between round 15's games, not in round 8. A game the player left
  unanswered while switched off (no row) ends the run.
- Sets: same.
- Tests: `serija: games are walked in tip-off order`, `serija: a game with
  no points row ends the run`, `serija: a run does not carry across
  tournaments`.

**SE-3. Each game of a run stores (length of the run so far - 1) x 10 x that
game's rate; a player's serija points are the sum.**
- Source: `StreakService.php:144-147`; `config/points.php:105` (step 10,
  #97).
- Example (golden `cai / EL h1-h3`): three right calls at rate 1 store 0, 10,
  20 = 30. Four in a row where the fourth is a rate-2 play-off store 0, 10,
  20, 60 = 90.
- Sets: same.
- Tests: `serija: the first call of a run adds nothing`, `serija: each later
  call adds 10 x its rate`.

---

## 6. Survival

**SU-1. A surviving round pays 10 if the picked team won at home, 12 if it
won away.**
- Source: `config/points.php:110-113`; `PointsFormat.php:175-178`;
  `SurvivalRun.php:376-399`; CLAUDE.md > Survival (#178).
- Example: Fenerbahce win away at Real Madrid: 12. Zalgiris win at home: 10.
- Sets: same.
- Tests: `survival: an away win pays 12`, `survival: a home win pays 10`.

**SU-2. Each surviving round stores the run's total so far; a player's
survival points are the sum of those stored totals.**
- Source: `app/Http/Controllers/PointSurvivalController.php:188-203,284-310`;
  CLAUDE.md > Survival ("RUNNING TOTAL", 12, 22, 34).
- Example: away, home, away wins store 12, 22, 34; the player has 68 survival
  points (golden `dan / EL E1-E2`: 12, 22).
- Sets: same.
- Tests: `survival: a round stores the run's running total`, `survival: the
  player's points are the sum of the stored totals`.

**SU-3. A loss stores 0 for that round and ends the run, in that tournament
only; the next pick starts a new run.**
- Source: `app/Http/Controllers/PredictionSurvivalController.php:416-424,435-440`;
  CLAUDE.md > Survival (#217, run per tournament).
- Example: 12, 22, then the pick loses: 0; next round's home win stores 10.
  (A draw decides nobody - `SurvivalRun.php:341-354` - but a Euroleague game
  cannot be level; see MS-10.)
- Sets: same (ruled keeps the picks as history, R-5, which does not change
  the numbers).
- Tests: `survival: a loss stores 0`, `survival: the run after a loss starts
  from zero`.

**SU-4. A pick belongs to the current round and locks when its team tips
off.**
- Source: sportbet: the pick goes to the current round (LR-3) and can change
  until that round has been scored for the player; the server checks no
  tip-off (`PredictionSurvivalController.php:62-107`, audit Q3; the page
  greys out started games, `:303`). Ruled: R-4, with tomyka/sportbet#256 (no
  pick of a team whose game has started), R-6.
- Example: Asta picks Olympiacos (Tuesday). At half-time they trail, so she
  switches to Barcelona (Thursday). sportbet: allowed until Olympiacos's
  result is entered; she survives Olympiacos's loss. Ruled: from Tuesday's
  tip-off her pick is Olympiacos and cannot change.
- Sets: sportbet changeable until the round is scored; ruled locked at the
  picked team's tip-off (R-4).
- Tests: `survival (ruled): a pick cannot change after its team tips off`,
  `survival (ruled): a team whose game has started cannot be picked`.

**SU-5. A team is used once per run.**
- Source: sportbet: one pick row per team, so picking a used team moves its
  earlier pick to the new round; nothing refuses it
  (`PredictionSurvivalController.php:84-104`; audit Q15). The earlier round
  keeps its stored total but drops out of later totals. Ruled: R-11.
- Example: home wins in rounds 1-4 store 10, 20, 30, 40, round 1 on Zalgiris.
  In round 5 Asta picks Zalgiris again and they win away. sportbet: round 5
  stores 30 + 12 = 42 (round 1 no longer counts), not 52. Ruled: the pick
  is refused. Once all 20 teams have been used in a run, all 20 are
  available again and the run continues (R-11).
- Sets: sportbet moves the pick; ruled refuses it, resetting the list after
  all 20 (R-11).
- Tests: `survival (ruled): a team used in this run is refused`, `survival
  (ruled): after all 20 teams the list resets`, `survival (sportbet):
  re-picking a used team moves its earlier pick`.

**SU-6. A round without a pick stores nothing and does not end the run.**
- Source: code only: the running total sums the picks still attached
  (`PointSurvivalController.php:284-310`), and a round with no pick writes no
  row. CONTEXT.md > Survival pick speaks of "consecutive surviving picks".
- Example: Zalgiris home in round 3 (10), no pick in round 4, Olympiacos away
  in round 5 (win): round 5 stores 22.
- Sets: same (no ruling) - open question 2.
- Tests: `survival (sportbet): a round without a pick does not end the run`.

**SU-7. Survival is played in the regular season only.**
- Source: sportbet: every game of a tournament with survival switched on
  decides the picks attached to its round (`Recalculation.php:225-227`); the
  pick page shows only on rounds flagged for survival, which the importer
  leaves off (`EuroleagueScheduleImporter.php:219`) and an admin switches on.
  Ruled: R-10 (ends after round 38), R-11 (a run can last the whole regular
  season).
- Example: sportbet: an admin could flag a play-off round. Ruled: there is no
  survival pick after round 38.
- Sets: sportbet per-round flag; ruled rounds 1-38 (R-10).
- Tests: `survival (ruled): no pick after round 38`.

**SU-8. A pick on a postponed game waits for that game.**
- Source: sportbet: the postponed game holds the current round (LR-3), so the
  pick stays and nobody can pick for later rounds until it is played. Ruled:
  R-12.
- Example: round 8, Asta picks Baskonia, whose game moves to 12-10. sportbet:
  she (and everyone) cannot pick rounds 9-14 until then. Ruled: she picks for
  rounds 9-14 meanwhile, and the Baskonia pick is decided on 12-10.
- Sets: sportbet blocks later picks; ruled lets them continue (R-12). How the
  running totals and a December loss are counted is open question 3.
- Tests: `survival (ruled): a postponed pick is decided when its game is
  played`, `survival (ruled): later rounds can be picked while a pick waits`.

**SU-9. A corrected result restores the survival it wrongly ended.**
- Source: sportbet: a loss detaches every pick in the run
  (`PredictionSurvivalController.php:435-440`), so a knock-out from a
  mistaken result is permanent (audit Q4). Ruled: R-5 (picks are history
  rows, never deleted).
- Example: the admin types 80-78 for Monaco - Virtus (really 78-80, an away
  win). sportbet: the Virtus pickers store 0 and their runs (say 12, 22, 34)
  are gone for good; after the correction the Monaco pickers are knocked out
  too. Ruled: after the correction the Virtus pickers survive with 34 + 12 =
  46 and only the Monaco pickers store 0.
- Sets: sportbet permanent; ruled replayed (R-5).
- Tests: `survival (ruled): a corrected result restores the run it ended`.

**SU-10. sportbet computes survival two ways, which agree only when rounds
are decided in order and no team is re-picked.**
- Source: at result entry each round stores the sum of the attached picks
  that won (`PointSurvivalController.php:284-310`); the full recalculation
  refolds the stored rows in round order, adding 10 or 12 per non-zero row
  and resetting at a 0 (`PointSurvivalController.php:226-257`;
  `SurvivalRun.php:419-451`); issue #216, inventory Q2 and Q3.
- Example: in SU-5's case the first way stores 42 for round 5, the fold 52.
- Sets: parity only. The sportbet set needs both, and the checker must say
  which pass wrote a row (the two oracles, inventory section 6). The ruled
  set has one computation from the pick history (R-5).
- Tests: `survival (sportbet): the fold reproduces the running totals of an
  in-order run`, `survival (sportbet): the fold differs from the running
  total after a re-pick`.

---

## 7. Standings

**ST-1. A standings prediction is the final regular-season place of every
team, the 8 play-off teams, the 4 Final Four teams, and the champion and
runner-up.**
- Source: `config/standings.php:299-320` (places across the whole table,
  quarterfinal 8, semifinal 4, final places 2, counts enforced); CLAUDE.md >
  Standings formats. Ruled: R-14 ("play-off and Final Four ticks").
- Example: Zalgiris 3rd, ticked for the play-offs and the Final Four, named
  runner-up.
- Sets: same.
- Tests: `standings: every place is used once`, `standings: 8 play-off and 4
  Final Four ticks are required`.

**ST-2. Standings close at the first game of round 5 or any later round.**
- Source: `config/standings.php:329`; `app/Support/StandingsDeadline.php:48-92`
  (an admin may set another round per tournament); CONTEXT.md > Standings
  deadline (others' predictions are visible while open, on purpose). Ruled:
  R-8 (registration closes at the same moment).
- Example: round 5's first game tips off 2026-10-21 17:00: a save at 16:59:59
  is accepted, at 17:00:00 refused. If round 5 is rescheduled after round 6
  has started, round 6's earlier game closes it.
- Sets: same.
- Tests: `standings deadline: the first game of round 5 or later closes
  standings`, `standings deadline: the tournament's own round wins over the
  format's`.

**ST-3. A place pays 190, less 10 for every place off, never below 0.**
- Source: `app/Services/StandingScoringService.php:367-382`;
  `config/standings.php:311` (#92). Before the table is entered a place
  scores 0, not null (`:372-374`).
- Example: Real Madrid finish 3rd; predicted 3rd 190, 5th 170, 20th 20; a
  team predicted 1st that finished 20th scores 0 (19 off).
- Sets: same. When places are entered: ST-8.
- Tests: `standings place: exact pays 190`, `standings place: each place off
  costs 10`, `standings place: never below 0`.

**ST-4. An exact place is multiplied by 1 + odds, where odds = log2(players
who predicted a place for the team / players who predicted this place).**
Near misses get no bonus.
- Source: `app/Support/StandingPointsRow.php:289-300` (odds rounded to four
  places; odds 0 means no bonus); the multiplier is code only (inventory
  Q14). Ruled: R-3, R-14.
- Examples: 10 players gave Real Madrid a place, 2 said 3rd, Real finish 3rd:
  log2(10/2) = 2.3219, 190 x 3.3219 = 631.161. If all 10 said 3rd: 190.
  Golden `ada / ZAL`: 2 players, ada alone exact: 190 x 2 = 380.
- Sets: sportbet counts players who gave that team a place; ruled counts
  every player with a standings prediction in the tournament (R-3). R-14's
  wording and near misses: open question 4; who counts under R-3: open
  question 5.
- Tests: `standings place: an exact call is multiplied by its crowd odds`,
  `standings place: a near miss gets no crowd bonus`, `standings place:
  everyone agreeing pays the plain 190`.

**ST-5. A correct play-off tick pays 60 and a correct Final Four tick 120,
each multiplied by 1 + log2(players counted / players who ticked it).**
- Source: `StandingPointsRow.php:304-326`; `config/standings.php:318` (#92);
  `StandingScoringService.php:387-390`. sportbet counts the players whose row
  for that team has any value in that column (saved ticked or unticked). A
  tick for a team that did not get there, or no tick for one that did,
  scores 0. Ruled: R-3.
- Example: Zalgiris reach the play-offs; 10 players saved Zalgiris's row, 4
  ticked it: 60 x (1 + log2(10/4) = 1.3219) = 139.314. Ruled, with 20
  standings players in the tournament: 60 x (1 + log2(20/4) = 2.3219) =
  199.314. Golden `ada / OLY`: ada was the only player to save Olympiacos's
  play-off column, so sportbet pays 60 (odds 0); ruled, with 2 standings
  players, pays 60 x 2 = 120.
- Sets: sportbet denominator = rows saved for that team; ruled = every
  standings player (R-3).
- Tests: `standings tick: a correct play-off tick pays 60 times its crowd
  odds`, `standings tick (ruled): the crowd is every standings player`,
  `standings tick: a wrong tick pays 0`.

**ST-6. A stage nobody has reached yet stores null, not 0.**
- Source: `StandingPointsRow.php:246-255,309-314`; CLAUDE.md > Standings
  formats ("A stage a format does not play stores and scores null, never
  0"). A stage is live once any team holds its tick; the final once any team
  has a final place. Last 16 and last 32 are always null for Euroleague.
- Example (golden `ada / FEN`): no team is ticked for the Final Four, so
  semifinal points and odds are null; the play-offs are live, so Fenerbahce
  (not in them, not ticked) stores 0 with null odds.
- Sets: same.
- Tests: `standings: an undecided stage stores null`, `standings: a decided
  stage the prediction missed stores 0`.

**ST-7. The final pays 36 for the champion, 30 for the runner-up, 27 for the
two the wrong way round; an exact call is multiplied by its crowd odds.**
- Source: `StandingScoringService.php:400-414` (the 4x4 matrix's corner;
  CLAUDE.md states 36 and 27, the runner-up's 30 is code only);
  `StandingPointsRow.php:330-340` (crowd = players who gave the team a final
  place). Ruled: R-3.
- Example: 6 players named Real Madrid in the final, 3 as champion; Real win:
  36 x (1 + log2(6/3)) = 72. Olympiacos runner-up, 2 of 5 said 2nd: 30 x
  (1 + 1.3219) = 69.657. Named champion, finished runner-up: 27.
- Sets: sportbet as above; ruled denominator per R-3.
- Tests: `standings final: the champion pays 36 times its crowd odds`,
  `standings final: the runner-up pays 30`, `standings final: swapped
  finalists pay 27 and no bonus`.

**ST-8. When standings points are paid.**
- Source: sportbet: only when a top admin presses the standings button, for
  every tournament at once, from whatever has been entered
  (`app/Http/Controllers/PointStandingController.php:121-188`; inventory
  Q17). Ruled: R-14 (the table once after round 38; ticks as each stage is
  decided; paid once and never taken back), R-16 (automatic), R-22 (frozen
  when finished).
- Example: sportbet: an admin enters a mid-season table in round 20 and
  presses the button: places pay on that table until the next press. Ruled:
  places pay only on the table entered after round 38.
- Sets: sportbet manual, any time; ruled once, automatic (R-14, R-16).
  Correcting a wrong entry: open question 6.
- Tests: `standings (ruled): places are scored only from the final
  regular-season table`, `standings (ruled): saving ticks updates points at
  once`.

**ST-9. Standings odds and points are rounded to four places.**
- Source: `StandingPointsRow.php:297,299,321,324,335,338`; production stores
  doubles (audit P15); R-31 (four decimals stored, one shown, ranked to the
  cent).
- Example: 631.161 is stored 631.161, shown 631.2, ranked as 631.16.
- Sets: same (R-31).
- Tests: `standings: odds and points keep four decimals`.

---

## 8. Ranking

**RA-1. A player's total is match points + serija + standings + survival, in
that tournament.**
- Source: `app/Support/Ranking.php:38-48` (league table; #226). sportbet's
  public Lyderiai, the hub's top 5 and the welcome panel use match + serija
  only (`app/Support/PlayerTotals.php` `TOTAL`; inventory Q16). Ruled: R-18.
- Example: A has 2,100 match points and 631.16 standings (2,731.16); B has
  2,500 match points. League table: A first. sportbet's Lyderiai: B first.
  Ruled: A first everywhere.
- Sets: sportbet two totals; ruled one (R-18).
- Tests: `ranking: the total adds match, serija, standings and survival`,
  `ranking (ruled): every page ranks by the same total`.

**RA-2. Players are ordered by total, then by match points without the
serija, both to the cent; players equal on both share a rank (1, 2, 2, 4).**
- Source: `Ranking.php:57-115,153-156`; CONTEXT.md > Rank; CLAUDE.md >
  Leagues (#224, #229). Negative totals sort last, no floor (#72).
- Example: A 2,731.16 total / 2,100 match, B 2,731.16 / 2,050: A 1st, B 2nd.
  C and D both 2,700.00 / 2,000: both 3rd; the next player is 5th.
  2,731.164 and 2,731.158 are both 2,731.16 and tie.
- Sets: same.
- Tests: `ranking: equal totals are split by match points`, `ranking: equal
  on both share a rank and the next skips`, `ranking: totals are compared to
  the cent`.

**RA-3. Tied players are listed in Lithuanian alphabetical order.**
- Source: sportbet: the league table sorts usernames case-insensitively
  then byte by byte (`Ranking.php:61-63`), which puts every accented letter
  after Z; Lyderiai by MySQL's collation, which reads "Š" as "S" (inventory
  Q19). Ruled: R-30.
- Example: Šarūnas ties with Saulius and with Tomas. League table: Saulius,
  Tomas, Šarūnas. Lyderiai: Šarūnas, Saulius, Tomas. Ruled, every page:
  Saulius, Šarūnas, Tomas.
- Sets: sportbet per page; ruled Lithuanian order everywhere (R-30).
- Tests: `ranking (ruled): ties are listed with Š after S and before T`.

**RA-4. Who appears in a table.**
- Source: league table: league members the viewer may see (a guest is seen
  only by guests) who are not switched off (`app/Support/LeagueRoster.php:53-61`);
  Lyderiai: players not switched off with at least one points row
  (`PlayerTotals.php` `eligible`). Hidden players keep their points. Ruled:
  R-7, R-19 (an admin hide is its own state, lifted only by an admin).
- Example: a switched-off player with 1,800 points vanishes from the table;
  their points are unchanged when they come back.
- Sets: sportbet one switch; ruled switched-off and admin-hidden are separate
  (R-7, R-19).
- Tests: `ranking: a switched-off player is not listed`, `ranking (ruled): an
  admin-hidden player stays hidden after saving a prediction`.

**RA-5. Standings and survival points count on the rank history from the
game where they were earned.**
- Source: sportbet adds them to every past game
  (`app/Http/Controllers/PointController.php:122-151`; audit Q27). Ruled:
  R-17.
- Example: standings paid after round 38 (1,640 points) lift a player's rank
  from round 38 on (ruled), not from game 1 (sportbet).
- Sets: sportbet throughout; ruled from when earned (R-17).
- Tests: `rank history (ruled): standings points appear from the game they
  were earned`.

---

## 9. Players (where it affects scoring)

**PL-1. When a player is switched off, and what it does to their points.**
- Source: sportbet: after 5 fill-ins counted over all their predictions in
  every tournament, football included; any save switches them back on
  without resetting the count; a switched-off player gets no fill-ins
  (`GeneratedPredictions.php:312,318-327,366-378`;
  `app/Http/Controllers/PredictionResultController.php:147-150`). Ruled: R-7
  (20 missed games per tournament, count reset by a real save; R-9 fill-ins
  do not count), R-19.
- Example: sportbet: a player who missed 5 games at Euro 2024 starts the
  Euroleague switched off; their first missed Euroleague game has no row, so
  they score nothing and their serija breaks instead of a likely 50+ from a
  fill-in. After one save they are back on, and the next miss switches them
  off again. Ruled: switched off after the 20th fill-in in Euroleague 2026-27.
- Sets: sportbet 5 lifetime; ruled 20 per tournament (R-7). Whether a
  switched-off player still gets fill-ins under the ruled set: open question
  1.
- Tests: `player (sportbet): 5 fill-ins across tournaments switch a player
  off`, `player (ruled): 20 fill-ins in a tournament switch a player off`,
  `player (ruled): a real prediction resets the count`, `player (ruled): a
  late joiner's fill-ins do not count`.

**PL-2. Registration and late joiners.**
- Source: sportbet: registration closes when the tournament's first game
  starts (CONTEXT.md > Registration; `app/Support/ChecksRegistrationDeadline.php`),
  so nobody joins late. Ruled: R-8 (open until the standings deadline, ST-2),
  R-9 (a late joiner gets a fill-in for each game already played, scored
  under R-1, not counted toward R-7, not a vote).
- Example: ruled: Jonas joins in round 3 after 20 games. Each gets a fill-in:
  one on 88-79 at 82-76 scores 97 (FI-3); his serija starts after them; no
  other player's odds or points move.
- Sets: sportbet no late joiners; ruled R-8, R-9.
- Tests: `registration (ruled): open until round 5 starts`, `late joiner
  (ruled): each played game gets a fill-in`, `late joiner (ruled): the
  fill-ins change nobody else's odds`.

---

## Shared football paths that affect Euroleague

Places where sportbet runs Euroleague through code it shares with football,
and a Euroleague number depends on it:

- **Knockout scoring** (MS-8, MS-10): a round flagged knockout stores odds 0
  on a wrong call, and a level result there pays football's half credit.
- **Switch-off count** (PL-1): fill-ins from football tournaments count toward
  a Euroleague player's 5, and `user_settings.active` is global.
- **Unknown format key**: a tournament naming a format nobody knows scores as
  football (`PointsFormat.php:78-99`, `EuroleagueGameScoringTest::test_a_tournament_naming_an_unknown_format_scores_as_football`).
  The ruled domain's closed format union (decision 5) makes this impossible.
- **Passes over every tournament**: the serija walk, the survival fold and the
  standings rebuild run over all tournaments at once
  (`PointResultController.php:121-132`, `PointSurvivalController.php:228-240`,
  `PointStandingController.php:125-128`). Each keeps tournaments apart
  (#122, #217, per-tournament formats), which the golden master pins (cai's
  serija, ben's survival), but a rule change rescores finished football
  seasons too (LR-6).
- **Lyderiai all-time**: the public table sums match and serija points over
  every tournament (`PlayerTotals::allTime`); only the per-tournament views
  are in scope here.

Production holds one tournament, Euroleague (audit, production facts), so no
stored Euroleague row is affected by football data today.

---

## Golden master mapping

`golden-points.json` holds 25 Euroleague entries (tournament "EL",
`euroleague` format, survival on). They are produced by entering the results
in tip-off order (football first, then `EL h1`, `EL h2`, `EL h3`), then the
standings button, then the full recalculation
(`tests/Feature/GoldenPointsTest.php:44-63`). Because tournaments are kept
apart, the Euroleague part can be expressed on its own; the football part
only proves that independence.

### Inputs

- Teams: ZAL, OLY, REA, FEN.
- Rounds: E1 (day 1, rate 1, regular, survival), E2 (day 2, rate 1,
  **knockout-flagged**, survival).
- Games and results: h1 E1 ZAL-OLY 88-79 at 2026-06-15 18:00; h2 E1 REA-FEN
  70-95 at 2026-06-15 20:00; h3 E2 ZAL-FEN 90-85 at 2026-06-20 18:00.
- Match predictions (all real, none blank, so no fill-ins): ada 85-80,
  120-50, 90-85; ben 79-88, 80-90, 85-90; cai 90-80, 75-90, 95-80. dan has no
  match prediction rows at all (he plays survival only) - the domain must
  accept "no row for this game", which scores nothing and generates nothing.
- Team outcomes: places ZAL 1, OLY 2, REA 3, FEN 4; play-offs ZAL, OLY; no
  Final Four tick, no final place.
- Standings predictions: ada places 1-4 in order with play-off ticks on ZAL
  and OLY; ben ZAL 2 (play-off tick), OLY 1, REA 4 (play-off tick), FEN 3.
  Every column not named is blank (null), which is what makes ST-5's
  denominator 1 for OLY.
- Survival picks (set directly, not through the lock): ada FEN E1, ZAL E2;
  ben FEN E1; dan FEN E1, ZAL E2.

### Entries and the rules they exercise

| Entry | Stored | Rules |
|---|---|---|
| game_odds EL h1 | home 0.59, away 1.59, draw 2.59 | CO-1, CO-2, CO-3 |
| game_odds EL h2 | home 1.59, away 0.59, draw 2.59 | CO-1, CO-2, CO-3 |
| game_odds EL h3 | home 0.59, away 1.59, draw 2.59 | CO-1, CO-2, CO-3 |
| point_results ada / EL h1 | 79.5 + 46 + 0 = 125.5, odds 0.59 | MS-3, MS-5 |
| point_results ada / EL h2 | 0 - 45 + 0 = -45, odds 1.59 | MS-4, MS-5 (negative) |
| point_results ada / EL h3 | 79.5 + 50 + 20 = 149.5, odds 0.59 | MS-6 |
| point_results ben / EL h1 | 0 + 32 = 32, odds 1.59 | MS-4, MS-5 (wrong winner) |
| point_results ben / EL h2 | 79.5 + 35 = 114.5 | MS-3 |
| point_results ben / EL h3 | 0 + 40 = 40, **odds 0.00** | MS-8 |
| point_results cai / EL h1 | 79.5 + 49 = 128.5, serija 0 | SE-3 |
| point_results cai / EL h2 | 79.5 + 40 = 119.5, serija 10 | SE-2, SE-3 |
| point_results cai / EL h3 | 79.5 + 40 = 119.5, serija 20 | SE-1 (knockout round), SE-3 |
| point_standings ada / ZAL, OLY, REA, FEN | place 380 (odds 1.0) each; play-off ZAL 60 (odds 0), OLY 60 (odds 0), REA and FEN 0 (odds null); Final Four, final, last 16, last 32 null | ST-3, ST-4, ST-5, ST-6 |
| point_standings ben / ZAL, OLY, REA, FEN | place 180 (odds null) each; play-off ZAL 60 (odds 0), others 0 | ST-3, ST-4 (near miss), ST-5 |
| point_survivals ada / EL E1, E2 | 12, 22 | SU-1, SU-2, SU-3 (#217) |
| point_survivals ben / EL E1 | 12 | SU-1, SU-3 (a football loss does not detach it) |
| point_survivals dan / EL E1, E2 | 12, 22 | SU-1, SU-2 |

The serija of ada and ben stores 0 on every row (no two right calls in a
row). The two survival passes agree here (SU-10).

### Under the ruled set

Five entries change, all standings:

- `ada / OLY` play-off becomes 60 x (1 + log2(2/1)) = 120, odds 1.0, because
  R-3 and R-36 count both standings players, not only ada (ST-5).
- `ada / ZAL`, `ada / OLY`, `ada / REA` and `ada / FEN` places become the
  flat 190 with no odds, because table positions get no crowd bonus (R-35,
  ST-4).

Nothing else moves: there are no fill-ins (R-1, R-2), no re-picks (R-11),
and `ben / EL h3`'s stored odds stay 0, because the ruled domain keeps the
knockout flag (MS-8), which changes no points. `golden.test.ts` asserts
exactly these differences.

### What the golden master does not reach

Fill-ins and their odds (FI-3, CO-6), rates above 1 (LR-4), Final Four and
final standings (ST-5, ST-7), a survival loss or re-pick in Euroleague
(SU-3, SU-5, SU-10), a missing odds row (CO-5), a switched-off player
(PL-1). Each needs its own named unit test; issue #5 only requires the
golden scenario to reproduce exactly under the sportbet set. The inventory's
edge-case list (section 6) maps to: 2 -> MS-8; 3 -> MS-5; 5 -> CO-2, CO-3,
CO-5; 6 -> FI-3, SE-1; 7 -> MS-2, PL-1; 8 -> SE-1..3; 9 -> ST-3..7; 10 ->
SU-1..5, SU-10; 11 -> SE-2, SU-3, RA-1; 12 -> MS-9, ST-9, RA-2; 13 -> LR-4,
MS-7; 14 -> MS-2, LR-5.

### Production facts that bear on parity

One tournament (Euroleague, survival on), 20 teams, 380 games, 250 points
rows; no rate-0 rounds and no survival round with a rate other than 1 (P16);
standings stored as doubles (P15); no points for unscored games (P10); one
switched-off player and one with 5 or more fill-ins (P20); two fill-ins
earned winner points, 100 in all, both regular-season (P23) - R-1 leaves
them unchanged.

---

## Open questions for the owner

All seven were answered on 2026-09-29. Each answer is a ruling in
`docs/owner-rulings.md`, and the ruled set implements it
(`packages/domain`, issue #5).

1. **Does a switched-off player still get filled-in predictions?** No
   (R-32): while switched off the site fills in nothing, those games earn
   nothing, and the total stays frozen until the player comes back - as
   sportbet does today (FI-1, PL-1).
2. **Does skipping a survival round end your run?** No (R-33): a round with
   no pick neither ends nor breaks the run; the example's round 5 stores 22,
   as today (SU-6).
3. **A postponed survival pick (R-12): how are the rounds around it
   counted?** In round order (R-34): a December win makes rounds 8-10 read
   12, 22, 34 and shifts the later totals up; a December loss ends the run at
   round 8, and rounds 9 onwards form a new run. Totals after a pending pick
   are provisional until it is decided (SU-8).
4. **Does the standings crowd bonus apply to a near-miss place?** No table
   position gets the bonus, not even an exact one (R-35): Jonas gets 180 and
   an exact place the flat 190. The stage ticks keep it (ST-4).
5. **Who counts as "every standings player" (R-3)?** Every player in the
   tournament who saved anything on the standings page, complete table or
   not (R-36): 28 in the example, so a correct Final Four tick pays 386.7
   (ST-5).
6. **When the admin corrects a wrongly entered standings fact, do the
   points follow the correction?** Yes (R-37), as a corrected match result
   does (R-5); "never taken back" (R-14) only means a correctly paid tick is
   not removed as the post-season goes on (ST-8).
7. **Can an admin enter a tied Euroleague result?** No (R-38): a level
   result is refused, so a typo cannot break every serija or leave survival
   picks undecided (MS-10).

Two more readings, found while implementing the plan rather than raised
above, were also settled the same day:

- **R-6's fallback, when no game is left to come** (Task 7 of the
  implementation plan): the current round is the round of the most recently
  tipped-off game (R-40), so a finished tournament, or one waiting between
  seasons, keeps its last round on screen.
- **Whether an admin-hidden player still gets filled-in predictions**
  (R-19, Task 18): yes (R-39) - hiding only removes a player from tables;
  only a switched-off player (R-32) gets none.
