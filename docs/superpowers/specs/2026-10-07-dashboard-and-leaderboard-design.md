# Slice 8: the game page, the league table and the leaderboard

A10 of `docs/phase-2-inventory.md`. Built in four parts on one spec: **8a**,
`/main`'s core and the tournament page's table; **8b**, the games on
`/main` with predicting; **8c**, `/leaderboard`; **8d**, the rank history
under `ruledRules` (R-17, R-72).

Binding: decisions 5, 10 and 13; R-7, R-17, R-18, R-19, R-28, R-30, R-31,
R-46, R-51, R-52, R-59, R-61, R-62 and the new R-71 to R-75
(`docs/owner-rulings.md`); the slice 5-7 rules in `CLAUDE.md`; the slice 5
note that `PLAYER_HOME`'s page shows the one-time message.

## The reference

sportbet at **3eb95e7**: `app/Http/Controllers/{MainController,PointController,ActivityFeedController}.php`,
`app/Support/{LeagueRoster,PlayerTotals,Ranking,SerijaCorrectness}.php`,
`resources/views/{main,leaderboard}.blade.php`,
`resources/views/partials/{points,standings,stat-tiles,fixture-deck,activity-feed,games}.blade.php`,
`resources/views/tournaments/show.blade.php`, and its tests (DashboardTest,
MainPageGameOrderTest, UnauthenticatedMainRedirectTest, ActivityFeedTest,
ActivityFeedTournamentScopeTest, PublicLeaderboardTest,
LeaderboardTieRuleTest, LeagueRankHistoryScopeTest, Unit/Support/RankingTest).

## Owner answers at the brainstorm (2026-10-07)

- R-71: the "serija" tile counts within the tournament.
- R-72: in the rank history a survival point counts from its pick's game, a
  table place from round 38's last game, each stage tick from the game that
  decided it.
- R-73: until leagues, the tables show the tournament's listed players.
- R-74: "Visos rungtynės" uses the predictions page's boxes and autosave.
- R-75: the leaderboard's charity card says "krepšinio"; a started game's
  card shows no "Keisti".

## Design

### 8a - `/main`

- `PLAYER_HOME` becomes `/main`; a guest or a player in no tournament goes
  to `/`. "Pradžia" in the rail and the menu, and the brand link, go to
  `/main` for a signed-in player. `/main` shows the one-time messages.
- The tournament is the request's (R-28, R-46); "the league" is its listed
  players (R-73).
- Panels, in sportbet's order and texts:
  - progress line: the current round (R-6, R-40), scored / total, "N
    šiandien" (Vilnius day);
  - stat tiles: "vieta" with "↑N per 5 žaid." (rank five history entries
    back minus now), "taškai" (the full total, 1 decimal), "bingo" (the
    tournament's bingo rows), "serija" (consecutive fully correct games in
    the tournament, R-71);
  - "Taškų lentelė": `rankPlayers(..., 'league-table', rules)` (R-18, R-30,
    R-31); the sub-columns with sportbet's tooltips (survival only when the
    tournament plays it); the standings popover by stage (Euroleague's
    stage names); top 10 plus the player's own row after "···", "Rodyti
    visus (N)" / "Rodyti mažiau"; a row expands to "Paskutinės 6
    rungtynės", the rank line and the "#", "+ Tšk", "Vieta" table from the
    rank history; names are plain text until slice 11's compare page;
  - "Finalų dalyvių prognozės": the medal tally of the listed players, once
    the first game has started;
  - "Aktyvumas": the bingos of the last 3 scored games and up to 5 live
    runs of at least 3, tournament-scoped.
- The entry-fee panel and league messages are not drawn (slices 13-14).
- The tournament page's public league table: the same table component, no
  own row, then the medal panel.

### 8b - games on `/main`

- "Artimiausios rungtynės": cards of the current round's games (sportbet's
  first 3 Vilnius dates, finished games of earlier days dropped), with
  "Spėti" when open and nothing for a started or played game (R-75), linking
  to `/prediction/results`.
- "Visos rungtynės": the same rows with points and the odds popover (R-61);
  a single click opens the row's plain boxes with the predictions page's
  autosave and messages (R-74, R-59), saving through `savePrediction`.

### 8c - `/leaderboard`

- Public. Every tournament; a player listed with at least one match points
  row. Under `ruledRules` the full total ranks (R-18); sportbet's rule set
  keeps match + serija. Columns #, 🥇🥈🥉 for ranks 1-3, "Žaidėjas",
  "Taškai", "Tikslūs", "Nugalėtojai", "Žaidimai"; sportbet's title, intro,
  empty text and charity card (R-75). "Lyderiai" in the guest rail and the
  phone pills once the table has entries.

### 8d - the rank history under `ruledRules`

- Each stored standings and survival row gets the game it counts from (R-72):
  survival from its pick's game; a table place from round 38's last game;
  a stage tick from the last game of the stage that decided it. Derived by
  the domain from the season, never stored separately.
- `totalsAfterEachGame` uses it (R-17); sportbet's set keeps the flat sum.

### Data

- `loadDashboard(db, viewer, tournament, now, rules)` and
  `loadLeaderboard(db, rules)` only load and ask the domain; ranking,
  history, tally, feed and tiles are domain functions.

## Testing

- Domain: the tiles (R-71), the feed, the history under both sets (R-17,
  R-72), the ranking and tie order, the leaderboard's eligibility and total.
- Database: the dashboard and leaderboard data on the golden scenario under
  both sets.
- Feature and components: every panel and text; guests and players with no
  tournament sent home; the message shown on `/main`; the games list saving.
- Parity: the reader's run compares the league table's and leaderboard's
  ranks with production's (sportbet set) and counts production's guest and
  private-league members (numbers only).
- E2E at 390 and 1280: `/main` after sign-in, a prediction from the games
  list, `/leaderboard`.

## Done means

On staging the owner sees `/main` with the table, tiles, trend, medals,
activity and games, predicts from it, and sees `/leaderboard`; the parity run
holds, with ranks equal to production's; every sportbet rule above has a
named test.
