# Slice 10: survival picks and the survival summary

A7 of `docs/phase-2-inventory.md` and `/summary/predictionSurvivals` (#27):
the survival page `/prediction/predictionSurvival`, its pick save, and the
survival summary. Euroleague only (decision 11). Closes #13.

Binding: decisions 5, 10, 11 and 13; SU-1 to SU-10 of the catalogue; R-4,
R-5, R-10, R-11, R-12, R-30, R-33, R-34, R-41, R-73 and the new R-81 to
R-84 (`docs/owner-rulings.md`); the rules in `CLAUDE.md` (the domain
decides, one transaction under the lock order, route handlers, Laravel's
answers, guarded pages, tokens, Lithuanian text in components).

## The reference

sportbet at **3eb95e7** (it carries sportbet#256, #292 and #297):
`app/Http/Controllers/PredictionSurvivalController.php` (page 30-73, save
80-118, summary 147-201), `app/Support/SurvivalPick.php` (`decide` 62-116,
`pickLockedIn` 128-136, `allOpen` 185-189, `usedTeams` 210-256),
`app/Support/SurvivalRun.php` (`usedTeams` 173-191),
`app/Support/SurvivalSummary.php`, `app/Support/RoundWindow.php`,
`app/Support/NavVisibility.php` (21-36),
`resources/views/prediction/survival.blade.php`,
`resources/views/summary/survivals.blade.php`, `routes/web.php` (123-124,
248; both behind `auth`).

What sportbet does, in short:

- **The save** posts `teamID` and the round the page showed (`eventID`).
  The form first: no team "Nepasirinkta komanda.", a team that is not an
  integer "Ši komanda nepasiekiama.", a round that is not an integer
  "Turas pasikeitė - perkraukite puslapį." (one message, not a list).
  Then, in one transaction holding the player's pick rows, `decide()` asks
  in this order and answers the first that fails:
  1. the team is one the player holds a pick row for (its tournament is the
     one picked in): "Ši komanda nepasiekiama.";
  2. the tournament has a live round: "Šiuo metu nėra raundo, kuriam būtų
     galima rinktis.";
  3. it is the round the page showed: "Turas pasikeitė - perkraukite
     puslapį.";
  4. the round is flagged for survival in a tournament that plays it:
     "Šiame ture išlikimo žaidimo nėra.";
  5. the round is not already scored for the player: "Šis turas jau
     užskaitytas.";
  6. the team plays in the round: "Ši komanda šiame ture nežaidžia.";
  7. every game of the team in the round is open by the lock (tip-off not
     reached, no result): "Šios komandos rungtynės jau prasidėjo.";
  8. the player's current pick for the round has not tipped off (R-4, the
     clock only): "Tavo pasirinktos komandos rungtynės jau prasidėjo - šio
     turo pasirinkimo keisti nebegalima.";
  9. the team is not used in the current run (R-11; the list resets once
     the run has used as many teams as the player holds rows for, i.e. the
     tournament's teams): "Šią komandą jau rinkaisi - kiekvieną komandą
     galima rinktis tik kartą, kol išnaudosi visas.".
  Accepted: the round's pick is moved to the team. `{success: true}`, or
  422 `{success: false, message}`. Nothing is recalculated.
- **The page** shows only while the session's round plays survival in a
  survival tournament; otherwise one card "Išlikimo žaidimas baigėsi.".
  A hero: the run's length ("Iš eilės") over pips (`max(5, streak + 1)`,
  hits filled, the next one marked), "Surinkta serijoje **N** taškų" (the
  sum of the run's stored rows), once the round is scored "Turas
  užskaitytas: +N" or "Serija nutrūko - kitą turą pradedi iš naujo.", and
  the stake "+N" "Už šį turą" (the scored row's points once scored;
  otherwise the last running total plus 10 at home or 12 away, both
  "+H/A" until a team is picked, following the radio once one is). A card
  headed by the round's name ("Išlikimas" without one), "· Rinkis komandą"
  while a pick can be made, "Laisvų: x · Panaudotų: y"; the notice
  "Pasirinkimas užfiksuotas - pasirinktos komandos rungtynės jau
  prasidėjo." once the pick is locked; a refusal's alert; a radio grid of
  the round's teams by id - crest, name, a line ("Panaudota · N turas",
  "Panaudota", "Rungtynės prasidėjo" or "vs. <opponent>") and a mark (a
  check when used, a lock when disabled, otherwise "Namie" / "Išvykoje").
  The hint "Komandą gali rinktis ar keisti iki jos rungtynių pradžios.".
  While the run is not empty, "Tavo serija" ("Atsistatys, jei pasirinkta
  komanda pralaimės") with a chip per round: crest, team, ":round turas ·
  +:points". "Taisyklės": four numbered rules and a points table (rows
  "Namie" and "Išvykoje", columns "turas", 1-5, "Iš viso"; 10n and 12n,
  totals 150 and 180). A click saves at once; a refusal shows the server's
  message (any answer but a 422: "Pasirinkimas neišsaugotas. Bandykite dar
  kartą.") and puts the radio back on the held pick.
- **The summary** lists the league's players (one row each, with or
  without picks) against the survival rounds up to the current round's
  day (every one once the tournament is finished). A row: rank (position),
  initials avatar, username, one tile per round (`hit`, `miss`, `pending`,
  `none`; crest when a team is known; title "<round> · <team> · <points>",
  "· dar nežinoma", or "· nepasirinkta"), the trailing run ("Iš eilės":
  trailing hits, pending and empty rounds skipped, a miss stops) and the
  total ("taškų", the sum of the stored rows). Ordered by total, then the
  trailing run, then username by PHP's `<=>` (byte order). Legend "Išliko",
  "Iškrito", "Pasirinkta, dar nežinoma", "Nepasirinkta"; header
  "Išlikimas" / "Kiekvienas langelis - vieno turo pasirinkimas"; empty
  "Išlikimo turų šiame turnyre dar nėra."; the viewer's row marked; one
  horizontal scroll shared by every run, anchored at the right, with arrows
  "Ankstesni turai" / "Vėlesni turai". A pending pick shows its team to
  everyone.
- **Navigation:** "Išlikimas" (`bi-bullseye`) on the rail, the phone menu
  and the tabs while the current round and the tournament play survival
  (`showSurvival`); "Išlikimas" (`bi-shield-check`) under "Suvestinė" while
  the summary is shown and the tournament plays survival.

## Rulings applied

- **R-81 (settles #13).** In both rule sets a pick is refused for a team
  with no game in the round and for a team whose game already has a result
  (LR-1's "closed", the owner's #13 ruling of 2026-10-02); "every team
  used" counts the tournament's team list, not the teams that play a game;
  the "team once per run" difference is dropped where R-5 covers it. So
  both `RuleSet` fields the pick rules held are removed:
  - `survivalPickLocksAtTipOff` (SU-4, R-4): sportbet at 3eb95e7 locks a
    pick at its team's tip-off too (`pickLockedIn`), so both sets lock.
  - `survivalTeamOncePerRun` (SU-5, R-11): sportbet refuses a used team
    too (`usedTeams`). What remains different - sportbet's reset on a
    stored 0 after a corrected result, and its moving of a re-picked
    team's single row after a reset - is the pick history against
    sportbet's rows, which `survivalScoredFromStoredRows` (SU-10, R-5)
    already carries. No write path of this app moves a pick.
  The catalogue's SU-4 and SU-5 "Sets" lines, `rule-set.ts`'s comments,
  `rule-set.test.ts`'s `DIFFERENCES` and `tools/migrate/src/parity/rulings.ts`
  follow.
- **R-82.** A pending pick shows "Pasirinkta", not the team, to every
  other player until that team's game tips off or has a result; the viewer
  always sees their own team.
- **R-83.** A summary total that a pending pick may still change is shown
  provisional, "~22": the player has a stored row marked `provisional`
  (R-34) in the summary's rounds.
- **R-84.** The summary lists the survival rounds (rounds 1-38 under R-10)
  numbered up to the current round; every survival round when there is no
  current round.
- **Kept from earlier rulings:** R-4 (lock at the pick's own tip-off, the
  clock: a pick on a game postponed before its tip-off may still change,
  as in sportbet), R-11 (pending counts as used; a loss frees every team),
  R-12 and R-34 (a pending pick waits; later totals provisional), R-33 (a
  skipped round neither ends nor breaks the run), R-41 (a team is open
  until its own game starts), R-10 (`survivalRegularSeasonOnly`, kept),
  R-73 (the tournament's listed players until leagues).

## Lead decisions (technical)

- **Tie-break (slice plan):** the summary's username tie-break is R-30's
  tie order through the rule set (`tieOrder`): Lithuanian under
  `ruledRules`; under `sportbetRules` this page's own, byte order (PHP's
  `<=>`). The rank stays sportbet's position (1, 2, 3), no shared ranks.
- **Roster (slice plan):** every listed player (R-73) until slice 12, read
  through `loadTournamentStanding`, which gives the summary its totals too.
- **The save's address is `/prediction/predictionSurvival/save`** (Next
  cannot serve a page and a handler at one path; slice 6 decision 1, as
  slice 9's `/prediction/standings/save`). It posts `teamID` and `round`,
  the shown round's number (the app keys rounds by number; sportbet's
  `eventID` is an event id), both read only by `idFromText`.
- **The tournament is the posted team's** (sportbet's "the row governs",
  issue 255), never the request's. A team not stored, or a player who is
  not one of its tournament's players, is "Ši komanda nepasiekiama."
  (`unknown-team`), as sportbet answers a team the player holds no row for.
- **The checks are `SurvivalRun.withPick`'s, in sportbet's order** (above,
  2-9), refusals named per check: `unknown-team`, `no-current-round`,
  `round-changed`, `round-has-no-survival` (the round's flag, the
  tournament's `survival`, and under `survivalRegularSeasonOnly` a
  non-regular round), `round-already-scored`, `team-not-playing`,
  `team-already-started` (any of the team's games in the round not
  `isOpenAt` - LR-1 closed: tipped off, a result, postponed or locked
  after a move), `pick-locked` (the current pick's game `hasTippedOffAt`),
  `team-used-in-run`. The new app has no half-entered result (R-64), so
  sportbet's away-score clause has nothing to check.
- **One rule for page and save.** A card is selectable exactly when
  `withPick` would accept it, and "used" is the one `usedTeams` both read
  (sportbet issue 292), so the page never offers a card the save refuses.
  A scored round's own pick is disabled too (sportbet left it clickable,
  then refused it).
- **What the page and the summary show comes from the stored rows.** A
  decided round (`survived`, `lost`) is the rule set's stored
  `survival_points` row with points; a pending round is a pick with no such
  row. The domain's `survivalLedger` merges the two for both pages, so the
  page's run, the summary's tiles and the table's survival points never
  disagree. A derived row with null points (a pick waiting, SU-8) is never
  read for state: the pick history says what is pending.
- **No recalculation on save.** An accepted pick's game is open and the
  replaced pick's game unscored (else `round-already-scored`), so no stored
  points change; a save calls neither `recalculateUnderRuleSet` nor
  `pointsChanged()`, and switches no status (sportbet's does neither).
  The derived pending row of a replaced pick goes at the next
  recalculation; nothing reads it meanwhile (above).
- **Locking.** One `saveTransaction` (5 s `lock_timeout`, then 503): the
  game rows of the posted team and of the player's current pick in the
  current round, `FOR SHARE`, in game id order (the lock order's game
  step, as a prediction save takes it), then the player's
  `tournament_players` rows through `lockPlayerStatuses` - the mutex that
  keeps two posts of one player from both passing the used-team check
  (sportbet locks the player's pick rows). No tournament lock: nothing
  derived is written. The season and picks are read again once the locks
  are held and judged at the later of the call and the database's time
  (`judgedAt`); a round that moved meanwhile is `round-changed`. A refusal
  writes nothing (`decideUnderLock`).
- **Throttle.** `survivalSaveLimits`: 60 accepted saves a minute per
  player, as `predictionSaveLimits` (one click is one save); a post the
  form refuses does not count. Not sportbet's (it has none).
- **Answers.** 200 `{success: true}`; a refusal 422 `{success: false,
  message}` with sportbet's text; cross-site 403; a guest 401; 429 the
  Laravel throttle body; a lock wait past 5 s 503. The page shows a 422's
  message and its fallback for anything else.
- **The run and the streak.** The page's run is the current run before the
  current round: the ledger's rows after the last loss, survived and
  pending. "Iš eilės" counts the survived rows (sportbet counted attached
  picks, which held no pending one before R-12); a pending chip reads
  ":round turas · dar nežinoma". The summary's streak is sportbet's
  `trailingHits` over its tiles.
- **Totals.** The summary's total is the player's survival total from
  `loadTournamentTotals` (via `loadTournamentStanding`), so it equals the
  survival part of the league table (R-18), "~" per R-83.
- **Round names.** The rounds' stored names (`rounds.name`), ":round
  turas" when empty, as sportbet's `event ?: ...`.
- **Navigation.** "Išlikimas" (`bullseye`) joins `NAV_ENTRIES` after
  "Eiga" (rail, menu, tabs; badge kind `survival`; shown when
  `view.nav.survival`); the summary's "Išlikimas" (`shield-check`) is the
  first `summary` entry (rail, menu; shown when `nav.summary &&
  nav.survivalSummary`). Slice 11's summaries go before it. The survival
  badge stays 0, as the standings badge does (slice 9), until the
  missing-predictions count (A16) is built; that work must refresh the
  shell after a pick, as sportbet's `sbRefreshNavBadges` does.
- **Access** as `/prediction/standings`: a guest goes to sign in and back
  through `signInAndReturn` (both bare pages join `GUARDED_PAGES` as
  `survival` and `survivalSummary`); a player without a current tournament
  goes to `/`.
- **The summary's privacy:** names leave `db` only as initials
  (`displayInitials`, the username's first letter when both are empty,
  as sportbet); a surname never reaches the page (#16).

## Design

### Domain (`packages/domain/src/survival/`)

- `rule-set.ts`: `survivalPickLocksAtTipOff` and `survivalTeamOncePerRun`
  removed (R-81).
- `survival-pick-form.ts`: `survivalPickFormEntry({ teamID, round })` ->
  `Result<SurvivalPickEntry, 'no-team' | 'bad-team' | 'bad-round'>`, in
  sportbet's order; `round` optional (a page that does not say).
- `survival-run.ts`: `withPick(team, context, rules)`, `context` =
  `{ season, teams (the tournament's team list), survivalPlayed, now,
  shownRound? }`, refusals as above; `usedTeams(run, context, round)` exported for the
  page (R-11 against `teams.length`, R-81).
- `survival-ledger.ts`: `survivalLedger(run, rows)` -> per round
  `{ round, team, state: 'survived' | 'lost' | 'pending', points,
  provisional }`, from the stored rows with points and the picks without
  one.
- `survival-page.ts`: `survivalPickPage({ season, teams, survivalPlayed,
  run, rows, rules, now })` -> `{ kind: 'over' }` or the open page: round,
  picked team, verdict (`survived` with points, `lost`, or none), pick
  locked, cards (team, opponent, ground, state `open` / `started` /
  `used` with the round it was used in, `selectable`, picked), free and
  used counts, the run, streak, run points, the two stakes.
- `survival-summary.ts`: `survivalSummary({ season, rules, now, viewer,
  players, runs, rows, totals })` -> the rounds (R-84) and the rows (rank,
  player, username, initials, `me`, tiles with `hidden` for R-82, streak,
  total, `provisional` for R-83), ordered as above.
- `survivalSaveLimits(player)`, beside `predictionSaveLimits`.
- `ranking/league-table.ts`: `'survival-summary'` joins `RankedPage`, its
  sportbet tie order byte order; the comparator is exported for the
  summary.

### Database (`packages/db/src/survival/`)

- `page.ts`: `loadSurvivalPickPage(db, { player, tournament, rules, now })`
  -> the domain page with team and round names: the season, the
  tournament's teams, the player's run (`loadSurvivalRun`) and the player's
  survival rows of the rule set's source.
- `summary.ts`: `loadSurvivalSummary(db, { viewer, tournament, rules, now })`
  -> `loadTournamentStanding`, `loadSurvivalRuns`, the season, the round
  names, the listed players' initials; decided by `survivalSummary`.
- `save.ts`: `saveSurvivalPick(db, { player, entry, rules, now }, clock)`,
  the transaction above; writes one `survival_picks` row (upsert on player
  and round). The only writer of a player's pick besides the snapshot load.

### Web (`apps/web`)

- `app/prediction/predictionSurvival/page.tsx` and
  `app/summary/predictionSurvivals/page.tsx` load and return one
  component; `app/prediction/predictionSurvival/save/route.ts` answers
  JSON through `autosaveRoute`.
- `server/survival/save-survival.ts` and `texts.ts`: the use case and the
  Lithuanian refusals.
- `components/survival/`: the pick view (hero, card grid as a radio group,
  run chips, rules and points table, refusal alert, stake following the
  radio) and the summary view (legend, board with one shared scroll and
  arrows, tiles with titles, "~" totals). Crests through `TeamCrest`.
  Colours only from tokens; any new colour is a sportbet token added to
  `tokens.css` for both themes.

## Testing

- Domain: the form's three refusals in order; `withPick`'s nine refusals
  in order, each by name, under both sets (`for set of [sportbet,
  ruled]`), including R-81's two (`team-not-playing`, a result entered
  before tip-off), the reset after the tournament's team list (a team
  that plays no game still counts), a pending pick counting as used, the
  pick lock on a postponed pick (may change) and SU-7's round 39; the
  catalogue's SU-4/SU-5 test names renamed for both sets; `survivalLedger`
  (stored decided, pending pick, null-points row ignored);
  `survivalPickPage` (every card state, selectable equals `withPick`,
  stakes, verdicts, run and streak with a pending pick, `over`);
  `survivalSummary` (R-82 hidden until tip-off or a result and never for
  the viewer, R-83 "~", R-84 window and no current round, order with both
  tie orders, trailing run). `rule-set.test.ts` without the two fields.
- Database: a pick written and moved within the round; a refusal writes
  nothing (also inside a caller's transaction); judged at the database's
  time under the lock (a lagging clock never early, a save that waited
  across the tip-off refused); two concurrent posts of one player cannot
  both use the last free team; a held game lock over 5 s fails; the
  summary's roster is the listed players, its totals the stored ones.
- Feature: every answer of the save (each text, 422 shape, 403, 401, 429,
  503), both pages for a player, a guest's return after sign-in, a player
  without a tournament, the "over" page, the empty summary.
- Components: card states, marks and lines; the radio group and its
  disabled cards; the stake following the radio; a refusal's message and
  the radio put back; the run chips; the rules table; the summary's
  legend, tiles, titles, "Pasirinkta", "~", the viewer's row, the arrows.
- E2E at 390 and 1280: pick a team, switch it, see a refusal for a started
  team, open the summary and see the pick. The staging seed's round 1
  becomes a survival round with a pickable game (see the plan).

## Done means

On staging the owner opens "Išlikimas", picks a team, switches it, sees a
started team refused with sportbet's message, and sees the summary with
their pick; another player's pending pick reads "Pasirinkta"; a pending
earlier pick marks the total "~"; the summary lists rounds up to the
current one. `survivalPickLocksAtTipOff` and `survivalTeamOncePerRun` are
gone, the parity run still holds, #13 is closed, and every sportbet rule
above and R-81 to R-84 has a named test.
