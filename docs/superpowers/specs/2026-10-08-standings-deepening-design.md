# Slice 9 deepening: the standings table, the ladder session, the locked table, one deadline

Issue #24. The four candidates of slice 9's architecture review
(2026-10-08), all taken at the owner's request; the design choices are the
lead's (the owner delegates engineering). **No behaviour changes**: every
answer, text, refusal order and page state stays as slice 9 shipped it
(`docs/superpowers/specs/2026-10-08-standings-predictions-design.md`), and
the existing tests are the guard - they change only where an interface they
call is replaced.

Why: both late bugs of slice 9 (the save counting rows the page had mended;
a stored place refused when posted back) were agreements between the page
and the save that no module owned. Decision 10 asks for "a standings table
knows its deadline"; slice 9 has three free functions over a target bag.

## 1. `StandingsTable` (domain)

`packages/domain/src/standings/standings-table.ts`: one module for "this
player's standings table in this tournament".

- **Built** by `StandingsTable.at({ teams, rows, season, now })` - the
  tournament's teams (id, name), the player's stored rows, the season
  (`StandingsDeadline`) and the moment it is judged at - or by
  `StandingsTable.fromView(view)` (the page's copy, below). It holds the
  stored rows and, from them, the rows mended to R-78's chain (`keptChain`,
  as sportbet's page does on load), and whether it is open (ST-2, asked of
  the season once, at `now`).
- **Decides**
  - `saveRow(entry)`: `Result<TeamPick, StandingsRowRefusal>` - exactly
    slice 9's `predictStandingsRow` (refusal order, unchanged stored place
    kept, conflicts against the mended other rows). A team not in the table
    is `not-yours`.
  - `reorder(order)`: `Result<readonly PlacedTeam[], ReorderRefusal>` -
    exactly `reorderStandings`.
- **Edits, for the page** (each returns a new table, rows kept mended):
  `withTick(team, stage, checked)` (R-78's `afterTick`),
  `withFinalPlace(team, place)`, `withOrder(order)` (the shown order;
  places are not changed until saved - see 2).
- **Shows** `view()`: a plain, serialisable `StandingsView` - the rows in
  sportbet's order (saved place, unplaced by byte order), each with its
  boxes (`playOffs`, `finalFour`, `finalPlace`: open or not, from
  `tickOpen` / `finalPlaceOpen` against the mended rows, and all shut when
  closed), the counts and totals, `placesSaved` (R-79) and `closes` (R-80).
  `fromView(view)` rebuilds the table from it, so the client never needs the
  season.
- `predict-row.ts`, `reorder.ts` and `ladder.ts`'s `standingsLadder` fold
  into it; `chain.ts` and `standingsCounts` stay as its internals and are no
  longer exported from `index.ts`. `standings-form.ts` and
  `save-throttle.ts` are unchanged.
- Tests move to the table's interface. One new property: for every row a
  view shows and every box it says is open, posting that row (as the page
  would, through `withTick` / `withFinalPlace`) is accepted by `saveRow` -
  the guarantee slice 9 had only by agreement.

## 2. The ladder session (web)

`apps/web/src/components/standings/ladder-session.ts`: the ladder's save
orchestration as plain TypeScript, no React.

- `createLadderSession({ view, post, timer, onChange })`: `post` is the two
  adapters (`row(request)`, `order(teams)`, each a `Promise<StandingsOutcome>`
  - production uses `standings-answer.ts`), `timer` is `set` / `clear`
  (production: the window's; tests: fake), `onChange` is called with each new
  state.
- State: the shown `StandingsTable`, the last saved order and places, a
  message per row, the live-region text, the error ring.
- Commands: `move(from, to)` (debounced reorder, 400 ms), `drop(from, to)`
  (immediate), `saveShownOrder()` (R-79), `tick(team, stage, checked)`,
  `finalPlace(team, text)`, `dispose()` (flushes a waiting order).
- It owns every invariant slice 9 kept in refs: one queue (`save-queue.ts`),
  a tick flushing a waiting order first, a row posting its place as last
  saved (updated inside the queued post), a refused order restoring the
  last saved one with "Tvarkos išsaugoti nepavyko, grąžinta ankstesnė.", a
  refused row putting its row back with the message (R-59).
- `ladder.tsx` keeps markup, focus, mouse drag and `useTouchDrag`; it holds
  the session (`useSyncExternalStore` or an effect) and forwards events.
- Tests: `ladder-session.test.ts` with fake posts and fake timers takes the
  ordering cases from `ladder.test.tsx` (the queue, the flush, the last
  saved place, the rollbacks, R-79's button); `ladder.test.tsx` keeps the
  rendering and interaction cases.

## 3. The locked table (db)

`packages/db/src/standings/table-repository.ts`.

- `loadLockedStandingsTable(tx, { player, team, now, clock })`:
  `StandingsTable | null` - the posted team's tournament (issue 255), null
  when the team is not stored or the player does not play there; the
  player's missing rows seeded, all their rows locked by team, the season
  read, the table built at the judged moment (`judgedAt`). Seeding is part
  of loading.
- `saveStandingsRows(tx, player, picks)`: writes the decided rows (the row
  save's five columns, the reorder's places).
- `save-transaction.ts` gains the one shape every standings save has:
  `decideUnderLock(db, { load, decide, write })` - one transaction with the
  5 s lock timeout; a null load and a refused decision roll back everything
  (seeding included) and return the refusal; an accepted one is written.
  `saveStandingsRow` / `saveStandingsOrder` become that, a few lines each.
  The reorder's tournament is its first team's, said once in the
  repository's doc.
- The prediction and result saves keep their current shape (no seeding to
  roll back, different refusal paths); they already share `saveTransaction`
  and `judgedAt`.

## 4. One ST-2 deadline (domain and db)

- The domain owns the rule's examples: `standingsDeadlineExamples`
  (`packages/domain/src/round/`), each a season (rounds, tip-offs, the
  tournament's own deadline round or none) and its deadline, covering: the
  default round 5, an admin's round, a later round's earlier game (a
  rescheduled round 5), no game in or after the round (never), round 5's
  earliest game. `Season.standingsDeadline` is tested against them.
- The db renders the rule to SQL in one place,
  `packages/db/src/season/standings-deadline-sql.ts`, used by the catalogue
  (`tournament/catalogue.ts`) in place of its inline expression.
- `packages/db/test/standings-deadline.test.ts` saves every domain example
  and asserts the SQL's deadline equals the season's, as
  `describeInvariantCheck` does for CHECKs - so the two cannot drift.
  `CLAUDE.md` names the pair beside the invariant rule.

## Tasks and team

backend-dev: 1 (domain), then 3 and 4 (db). web-dev: 2, after 1's
`StandingsTable` and `StandingsView` exist, then switch the page, the use
cases and the routes to them. qa: every existing suite green, the new
property, the session's ordering cases, the deadline examples, E2E.
architect: the result against decision 10 and this spec. Each task test
first; the lead commits; `CLAUDE.md` is updated where it names the replaced
functions.

## Done means

Every suite green (unit, db, component, feature, E2E) with no behaviour
change; `predictStandingsRow`, `reorderStandings`, `standingsLadder` and the
chain helpers are no longer exported; the page and the save answer every box
through one `StandingsTable`; the ladder's ordering is tested without the
DOM; the ST-2 SQL is proven equal to the season on the domain's examples.
