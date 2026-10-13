# Slice 11: summaries, chart and compare

A11 of `docs/phase-2-inventory.md` (#28), less the survival summary (slice
10): `/summary/prediction/results`, `/summary/prediction/standings`,
`/summary/chart` and `/compare/{userID}`, and the "Suvestinė" navigation
block. Read-only pages: nothing here writes, locks or recalculates.

Binding: decisions 5, 10, 11 and 13; R-17, R-18, R-30, R-72, R-73, R-85
and R-86 (`docs/owner-rulings.md`); the rules in `CLAUDE.md` (the domain
decides, pages only load, tokens, Lithuanian text in components, guarded
pages, `idFromText`). Lands after slice 10 and before slice 12, so the
roster is R-73's: every listed player of the tournament.

## The reference

sportbet at **5aa8465**: `routes/web.php` (134, 244-249),
`PredictionResultController::getPredictionResultSummary` (456-490) and
`getPredictionGamesProfile` (326-376),
`PredictionStandingController::getPredictionStandingSummary` (195-212) and
`getPredictionStandingProfile` (227-271), `ChartController::getChartData`,
`CompareController` (`show`, `getPerRoundComparison`),
`app/Support/PredictionVerdict.php`, `app/Support/NavVisibility.php`
(`showSummary`), `resources/views/summary/{results,standings,chart}.blade.php`,
`resources/views/compare/{show,_card}.blade.php`,
`partials/{rail,header}.blade.php` (the "Suvestinė" block),
`partials/points.blade.php:46-56` (the table's name links to compare);
CLAUDE.md > Prediction summary label colours; CONTEXT.md > Standings
deadline.

What sportbet does, in short:

- **"Prognozės" (results summary).** Every game whose tip-off has passed
  (`GameLock::closedSql`; open games never show another player's
  prediction), grouped by round. Rounds holding a started but unscored
  game come first, then finished rounds most recent first; finished rounds
  are collapsed, except the session's round. One column per player (the
  viewer's highlighted, avatar letter and username), ordered by the
  column's "Viso" descending. Each round row shows each player's round sum
  (blank at 0); each game row the result ("-" before it) and per player the
  points (match `full_points` + `streak_bonus`, one decimal) with a popover
  "Nugalėtojas", "Skirtumas", "Tikslus", "Serija" ("+" before a positive
  serija), and the predicted score in a verdict badge. The footer "Viso"
  sums the shown games (blank at 0). The games are *not* narrowed to the
  tournament (every tournament's started games), the predictions to rounds
  up to the session's round.
- **Verdict** (`PredictionVerdict::forResult`): no prediction, no badge;
  no result, `pending` (grey); `ok` (green) when the winner points are
  above 0 and, in a knockout round, the predicted ending (draw or not) and
  shoot-out winner agree; `partial` (amber) in a knockout round when the
  advancing team is right but the ending wrong; else `fail` (red).
- **"Eiga" (standings summary).** The tournament's teams as rows (grouped
  by group name; Euroleague has none), the roster as columns (players with
  standings rows, in query order). Each cell: badges for the place and
  each stage, the final place, and the cell's points total (one decimal,
  only above 0). Badge verdicts `position`, `advanced`, `final`
  (`none`, `pending`, `hit`, `miss`, `partial`); a stage badge shows "✓",
  "✗" (miss) or "-" (not ticked). Popovers per badge and for the total:
  the stage's points, then "Spėjimo taškai" (points / (1 + odds)) and
  "Koeficientas" ("×" 1 + odds) when the odds are above 0. Legend:
  "Pataikyta", "Praleista", "Pusfinalis teisingas, finalo vieta ne",
  "Laukiama", "Nespėta"; stages "G Grupė", "32 1/16", "16 1/8", "QF 1/4",
  "SF 1/2", "F Finalas". Shown while standings are still open, on purpose
  (CONTEXT.md > Standings deadline: "do not 'fix' it").
- **"Grafikas" (chart).** "Taškų dinamika", "{n} rungtynės" (n = 1) or
  "{n} rungtynių". The tournament's scored games by tip-off then id are the
  x-axis (labelled 1..n; the tooltip title "HOM - AWA", the first three
  letters of each team, upper case, or "Žaidimas {i}"); one line per
  roster player, the cumulative match points and serija to one decimal
  ("{username}:  {value} t." in the tooltip). Colour from the `colors`
  table, else a 10-colour palette by position; points drawn only up to 40
  games. Chart.js from a CDN, themed from the tokens.
- **Compare** (`/compare/{userID}`, `[0-9]+`, signed in). Oneself goes to
  `main`; a player outside the viewer's roster is 404. Header: each side's
  shared rank, username and total (match + serija + standings + survival;
  the larger marked winner), "vs" and the round record "{w}W {d}D {l}L"
  (only when a round exists). "Bendri statistikos": "Rungtynių taškai",
  "Eigos taškai", "Išlikimo taškai" (whole numbers, hidden when both 0),
  "Serija", "Bingo" (whole), the larger side marked. "Etapai": per round
  of the tournament (by round day, then id), each side's match points and
  serija, one decimal, the larger marked; header "Etapas". "Atgal" back to
  `main`.
- **Navigation.** "Suvestinė" in the rail and the phone menu: "Prognozės"
  (`bi-list-check`), "Eiga" (`bi-table`), "Išlikimas" (slice 10),
  "Grafikas" (`bi-bar-chart-line`), shown once the tournament's first game
  has tipped off or any result is in (`NavVisibility::showSummary`). The
  pages themselves are not gated by it ("This decides the menu, not the
  data").

## Rulings applied

- **R-85.** The chart and compare count every point - match, serija,
  standings and survival - at the games R-72 places them; points placed at
  a game not yet scored count at the latest scored game (R-72), so the
  chart's last value and the sum of compare's rounds equal the table
  total (R-18).
- **R-86.** Both summaries show the request's tournament only (R-28): the
  results summary's games are narrowed to it, where sportbet showed every
  tournament's.
- **R-73.** The roster of every page here is the tournament's listed
  players, as the league table's, until slice 12 narrows it.
- **R-30.** Ties are listed in Lithuanian alphabetical order (through
  `rankPlayers` and `usernameOrder`).

Neither R-85 nor R-86 is a `RuleSet` field: no stored row derives from
these pages, so a parity run is unaffected (slice 9's precedent). The
history they reuse already takes the rule set (R-17, R-72); every page
passes `ruledRules`.

## Lead decisions (technical)

- **One read for the roster and its points.** Every page here reads the
  tournament through `loadTournamentStanding` (listed players, the rule
  set's rows, totals, usernames), as the league table does, so a summary
  never disagrees with the table beside it. `CLAUDE.md`'s list of its
  readers gains the summaries, the chart and compare. None of them queries
  `tournament_players` itself: every player set here (columns, lines, the
  predictions read, compare's "not listed") is `standing.listed`, so
  slice 12's roster scope on `loadTournamentStanding` (the selected
  league, `is_guest <= viewer`, as sportbet's `LeagueRoster` in all four
  controllers) narrows them all in one change.
- **Column and line order is the league table's** (`leagueTableRows`:
  R-18's total, R-30 for ties) on both summaries and the chart, where
  sportbet ordered "Prognozės" by its own match + serija sum, "Eiga" by
  query order and the chart by user (R-102, owner, 2026-10-13).
- **Started, not scored.** "Prognozės" shows a game once it is no longer
  open (`Game.isOpenAt(now)` false), sportbet's lock; others' predictions
  for an open game are never read. Every started game of the tournament is
  shown: sportbet's "up to the session's round" filter only hid started
  games of a later round, which R-86 makes moot.
- **Round order and folding.** Rounds with a started unscored game first,
  then finished rounds most recent first (by the round's last tip-off);
  finished rounds start folded except the current round (the dashboard's
  `roundProgress`); a round header toggles, in a client component.
- **Verdict, Euroleague's cases only.** `predictionVerdict` returns
  `pending`, `ok` (winner points above 0, and in a knockout round the
  prediction is not a draw) or `fail`. sportbet's `partial` and the "ⓦ"
  shoot-out marks need a shoot-out winner, which only football records
  (decision 11); the union keeps `partial` out until football is ported,
  so its switch fails to compile then. Postponed games (R-63) show "-" and
  `pending`, like an unscored one.
- **Euroleague's standings stages only.** A cell shows the place, "1/4"
  (play-offs), "1/2" (Final Four) and the final place, as slice 9's labels;
  sportbet's always-empty 1/16 and 1/8 badges and legend entries are
  football's and are not built. Legend: "G Grupė", "QF 1/4", "SF 1/2",
  "F Finalas", sportbet's text. The cell verdicts are `standingsVerdict`
  (`position`, `advanced`, `final`, ported case by case), against the
  team's standings facts.
- **"Spėjimo taškai" without a float.** sportbet divides the points back by
  (1 + odds); the domain shows the stage's base from the format instead
  (the number the points were made from) and "×" 1 + odds from the stored
  fixed-point odds, two decimals, rounded half away from zero. Equal to
  sportbet's to one decimal for every stored row (a test over the golden
  scenario proves it).
- **Chart drawn as SVG, no library.** Server-rendered inline SVG of
  `leagueHistory`'s totals; a small client component adds the tooltip
  (sportbet's texts) and hides a line on a legend click (Chart.js's
  default). Colours are ten new series tokens in `tokens.css`
  (`--color-series-1`..`10`, sportbet's palette, with dark variants) by
  line position: sportbet's `colors` table is not migrated (inventory C2,
  no screen sets it). The tooltip's team letters are the first three
  characters, not bytes.
- **Compare is a page only.** sportbet's AJAX `_card` answer has no caller
  in its views; the page is `/compare/[userID]`. The id is read by
  `idFromText`; a refusal, a player not listed, or a viewer not listed
  (sportbet would fail) is `notFound()`; oneself redirects to
  `PLAYER_HOME`. Rank, total, parts and bingo (`countsAsBingo`) are both
  players' `LeagueTableRow`s; "Etapai" sums each side's earned points
  (`earnedPointsOf`, R-72 placement, unscored anchors at the latest scored
  game) by the round of their game, rounds in season order, only rounds
  with a scored game.
- **The league table's names link to compare**, the viewer's own name
  staying plain text, as `partials/points.blade.php` (the note at
  `league-table.tsx:263` ends).
- **Access.** All four are signed-in pages: a guest goes to sign in and
  back through `signInAndReturn`, each joining `GUARDED_PAGES` (compare by
  a matcher on `/compare/<digits>`); a player without a current tournament
  goes to `/`.
- **Navigation.** "Suvestinė" entries in the rail and the menu, in
  sportbet's order: "Prognozės", "Eiga", ("Išlikimas", slice 10's),
  "Grafikas"; new icons `list-check` and `bar-chart-line`. `ShellView`'s
  `nav.summary` is the domain's `summaryShown` (first tip-off passed or a
  result in), computed where the shell's view is built.
- **No caching.** The pages read live; they are signed-in and change with
  every result.

## Design

### Domain (`packages/domain/src/summary/`, `dashboard/`)

- `predictionVerdict(game, prediction, points)`: `'ok' | 'fail' |
  'pending' | null` (null: no prediction).
- `standingsVerdict.position / advanced / final`, as sportbet's three.
- `resultsSummary({ season, now, standing, predictions, current })`: the
  columns (league table order, the viewer marked by the page), the rounds
  (order, folded or not, each player's round sum in cents), each started
  game's result and per player the score, verdict, total and popover
  parts; the "Viso" footer. Sums in cents, blank at 0.
- `standingsSummary({ teams, facts, predictions, rows, columns, format })`:
  per team and player the badges and their verdicts, the stage popovers
  (points, base, multiplier) and the cell total.
- `pointsChart({ season, history, columns })`: the scored games' labels,
  one line per player (`leagueHistory`'s `totalCents`), the "rungtynės" /
  "rungtynių" count, whether points are drawn (up to 40).
- `comparePlayers({ season, rows, table, viewer, other })`: refused
  `not-listed` (a `Result`) or the two sides, the round record and the
  rounds.
- `summaryShown(season, now)` for the shell.

### Database (`packages/db/src/summary/`)

- `loadResultsSummary(db, { player, tournament, now, rules })`:
  `loadTournamentStanding`, the season, the round names, and the listed
  players' predictions on games no longer open (`loadStartedPredictions`,
  filtering by tip-off in SQL and again by `Game.isOpenAt`), parsed by the
  prediction schema.
- `loadStandingsSummary(db, ...)`: the standing, the tournament's teams,
  their standings facts and the listed players' standings predictions.
- `loadPointsChart(db, ...)` and `loadCompare(db, { viewer, other, ... })`:
  the standing and the season; the domain decides.

### Web (`apps/web`)

- Pages `app/summary/prediction/results/page.tsx`,
  `app/summary/prediction/standings/page.tsx`, `app/summary/chart/page.tsx`,
  `app/compare/[userID]/page.tsx`: each loads and returns one component.
- `components/summary/`: the results grid (sticky first column, round
  toggles, popovers, verdict badges), the standings grid and legend, the
  chart (SVG plus its tooltip/legend client part); `components/compare/`:
  header, stats and rounds. Verdict colours as tokens (sportbet's
  `sr-pred-*` and `sst-*`); every text above verbatim.

## Testing

- Domain: `predictionVerdict` and `standingsVerdict` case by case
  (sportbet's PredictionVerdict tests' Euroleague cases); `resultsSummary`
  hides open games, orders rounds and columns, sums and blanks;
  `standingsSummary` badges, symbols and the base/multiplier against
  sportbet's division on the golden scenario; `pointsChart` ends at every
  player's table total (R-85) with standings and survival at their R-72
  games; `comparePlayers` rounds sum to the total, the record, refusals.
- Database: started predictions only (a game at its tip-off instant
  shown, a second before not); another tournament's games and players
  never read (R-86).
- Feature: each page for a player, a guest (sign in and back), a player
  without a tournament; compare's 404s and self-redirect.
- Components: each grid, folding, popovers, badge classes, the chart's
  lines, tooltip and legend toggle, compare's marks; the navigation
  block and its condition.
- E2E at 390 and 1280: open each "Suvestinė" page and compare from the
  league table.

## Done means

On staging the owner opens "Suvestinė" and sees everyone's predictions for
started games only, with verdict colours; everyone's standings with
verdicts; the chart ending at each player's table total; and, from the
league table, compare with rounds that add up to the totals. Every
sportbet rule above and R-85, R-86 has a named test; the parity run still
holds.
