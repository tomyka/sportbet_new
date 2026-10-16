# Slice 18: rules, help and static pages - Implementation Plan

> **Amended 2026-10-16 (slice 18 review fixes, #35).** Where the text below
> names a contract the review changed, this block governs:
> - **One facts type.** `TournamentFacts` (`teamCount`, `deadlineRound`,
>   `survival`) and its zod schema are the domain's (`rules/tournament-facts.ts`),
>   with `NO_TOURNAMENT_FACTS`; `rulesPage(rules, facts | null)` and
>   `helpPage(facts | null)` take it (null is no tournament), so the defaults
>   live once. `standingsCloses` is gone from the facts and both pages: no
>   view read it (R-133 Q1 writes the round's number whatever the season
>   holds). With no tournament /help keeps the survival block hidden.
> - **Dropped, unread:** `bounds` (`drawsAllowed`), `serijaOrder`,
>   `partialTableAccepted`, `finalPlaces`. The partial-table sentence on /help
>   is R-133 Q5's, stated as the ruling, not a derivation.
> - **Published figures per area:** `publishedMatchFigures`
>   (`prediction/published-figures.ts`), `publishedSerijaExamples`
>   (`serija/serija.ts`), `publishedStandingsFigures`
>   (`standings/standings-scoring.ts`); `rulesPage` composes them. Margin and
>   serija points travel in hundredths (`pointsHundredths`, `bonusHundredths`)
>   and the view formats them (`pointsText`, `numberFormat` with
>   `{ grouping: false }`). The rates /rules states are `statedRates`
>   (`round/stage.ts`), sportbet's `x1 / x2` named there.
> - **One db function for the tournament described:**
>   `findDescribedTournament(db, { own, viewer, now, rules })`
>   (`hub/repository.ts`) replaces `findVisitorTournament`, `VisitorTournament`,
>   `firstUnfinishedTournament` and web's `DescribedTournament`: the player's own
>   tournament, else the visitor's, with `loadTournamentFacts` (a team count,
>   parsed with `tournamentFactsSchema`). The Season is no longer loaded.
> - **Web:** the pages only call `loadRulesPageData` / `loadHelpPageData`
>   (`server/described-tournament.ts`, which holds the fee-panel and
>   player-else-visitor branching). The Lithuanian `SURVIVAL_REPEAT_RULE`, the
>   stage marks and the deadline-round phrase live in
>   `components/static/shared-texts.ts`, imported by /rules, /help and the survival
>   page; `help-texts` no longer imports `rules-texts`. Every navigation path is a
>   `shell-paths` constant, each static page is one `PageEntry` with its
>   audiences as data. The charity hero hides its picture at 560px and below,
>   as sportbet's custom.css does.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-5, web-dev 6-11, qa and architect review each, only the lead commits.

**Goal:** `/rules`, `/help`, `/privacy` and `/charity` at sportbet's URLs and texts, `/rules` generated from the domain under `ruledRules` (R-100); `/support` and `/sponsors` redirect (#35).

**Architecture:** The domain decides every figure on `/rules` (`rulesPage`) and every rule-dependent line on `/help` (`helpPage`), calling the internal scorers that `recalculateTournament` uses, so the page cannot drift from scoring. `packages/db` adds `loadTournamentFacts` (team count, deadline round, whether standings close, survival switch of any tournament) and `findVisitorTournament` (a guest's tournament, built on it). `apps/web` has four pages, each loading and returning one component, two redirects and the navigation entries.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-rules-help-design.md`. Rulings R-100, R-106 (state what the code does), R-107 (the prize tie-break sentence stays), R-108 (privacy: three fixes, the owner approves the diff), R-128 (the standings deadline wording; registration is not on these pages), R-133 (the owner's answers to Q1-Q8 and Q10); the rulings table and the answers and open questions Q9, Q11 in the spec.

**Oracle:** sportbet at **1618164** (the parity oracle since 2026-10-15), not 3eb95e7: 2871bb3 halved the streak step to 5 and a4618c6 moved the standings deadline. `rules.blade.php`, `help.blade.php`, `privacy.blade.php` and `charity.blade.php` are unchanged since 3eb95e7; `ScoringRules` reads `streak_step` from `config/points.php`, so sportbet's page now shows `+(N−1)×5` and `+0 / +5 / +10` itself, and qa reads the odds and margin figures off a page running 1618164.

**Gate:** `/privacy` does not land until the owner has approved the diff that Task 7 produces (R-108, Q9). Q1-Q8 and Q10 are answered (R-133) and built as answered; Q11 (the "Atnaujinta:" month) also gates only `/privacy`. Each text is one entry in the page's texts module. Nothing else waits on the owner.

## What changed since the plan of 2026-10-13

The plan was written before slices 12 to 17. Corrections, by cause:

- **Serija step is 5, not 10** (sportbet 2871bb3, R-106 as amended, `SERIJA_STEP = 5`): tile `+(N−1)×5`, rows `+0 / +5 / +10`, `serijaBonus(2, 1)` 5 and `(3, 2)` 20. The plan's 10s were stale.
- **Deadline wording follows R-128 and the standings page** (`standings-view.tsx` already says "Prognozės užsidaro įvedus paskutinių 5-ojo turo rungtynių rezultatus." with the number typed in; `Season.standingsCloses`, `STANDINGS_DEADLINE_ROUND`, `standingsClosesSql`). The pages state the deadline round of the tournament they describe, and the data carries whether the deadline round has a game (state `never`; R-133 Q1: the sentence is shown with the round's number even then, left out only with no tournament).
- **Registration is not on these pages.** R-8 and R-54 are reversed by R-128; sportbet's rules and help never state when registration closes, so nothing to change. The registration form's "Taisyklės" (`register-form-view.tsx:101`, text "until /rules exists") becomes a link.
- **Stage names: the premise was wrong.** The old plan used R-76's names "so the rules name the stages the standings page ticks", but the standings page, its ladder headers, its refusal texts and the help screenshot say "1/4", "1/2", "F"; R-76's names live only in the points popovers and the standings summary (`EUROLEAGUE_STAGE_NAMES`, `summary/standings-summary.ts`, not yet exported). R-133 Q2: R-76's names plus the marks, "Atkrintamosios (1/4)", "Finalo ketvertas (1/2)", "Finalas (F)".
- **No new `STANDINGS_STAGES` table.** The bracket rows come from `STANDINGS_POINTS` (190, 10, 60, 120, exported), `STANDINGS_COUNTS` (8, 4, 2) and `EUROLEAGUE_STAGE_NAMES` (export it); one source for the names.
- **Survival on `/help` follows the tournament's `survival` switch,** not `ShellView.nav.survival`. sportbet's `session('survivalGame')` is `tournaments.survival_game`; `nav.survival` is the round-dependent `NavVisibility::showSurvival` and would drop the block after round 38. A guest sees the block when the tournament they would join plays survival (sportbet showed a guest the summary bullet but not the block; Q7).
- **The player's tournament needs its facts too.** `findVisitorTournament` alone left a signed-in player's team count and deadline round unread; Task 5 reads them for any tournament.
- **Navigation.** `NavGroup` `info`, the rail's `['league', 'info']` block and the menu's "Informacija" block already exist; a player entry is one entry (rail + menu), a guest entry another (audience is single-valued), so nothing is "listed twice" and `NavEntry` is not widened. The phone menu and its "Informacija" are signed-in only in sportbet (`@auth`); a guest's phone bar has only the pills (Lyderiai, Jaunimo linija, Prisijungti), so a guest on a phone reaches "Taisyklės" only by the registration form's link (Q10). The E2E and "Done means" are corrected.
- **Icons:** `journal-text`, `question-circle`, `heart`, `heart-fill`, `shield-lock`, `award-fill`, `rulers`, `graph-up`, `diagram-3-fill` and `receipt` are missing from `IconName`; the rest the pages need exist.
- **No new tokens.** sportbet's `.rules-pts-pos` is `--sb-accent-tint` on `--sb-accent`, bold; `.rules-pts-zero` is `--sb-muted`: `bg-accent-tint text-accent` and `text-muted` exist.
- **The fee panel exists** (slice 12c): `loadDashboardLeague(...).panel` and the `FeePanel` component, R-104/R-124 inside `feePanel`; `/rules` uses the panel only (sportbet's `partials/fee` on `/rules` carries no messages). The "if slice 12 has landed" branch and its follow-up issue go.
- **Charity links:** the hub's text links "Jaunimo linijai" inline and "Sužinoti daugiau"; the leaderboard variant links only the "more" line (`hub.blade.php:23,27`, `leaderboard.blade.php:69`).
- **No per-page `<title>`:** no page in the app sets one (the layout's `SportBet`); the spec's "Metadata" line is dropped.
- **Line references:** `index.ts`'s internal-scorers comment is now at line 256; the plan's "line 219" is stale.

## Decisions taken while planning (refine the spec; record them in it in Task 12)

1. **The scorers are split, not copied.** `marginParts`, `serijaBonus`, `placePoints` and `finalPoints` are extracted from the functions that use them today, which then call them; they stay unexported from `packages/domain/src/index.ts` (the comment at line 256 grows their names). Only `rulesPage`, `helpPage`, their types and `EUROLEAGUE_STAGE_NAMES` are exported.
2. **The worked examples score through `marginParts`, not `scoreMatch`.** `scoreMatch` needs a prediction, a game, a round and a crowd for a figure that depends on two scores; `marginParts` is the part of `scoreMatch` the margin table shows, and `scoreMatch`'s tests prove it sums them.
3. **`rulesPage` takes `{ teamCount, deadlineRound }` as nullable** - a guest on an empty database still gets the page.
4. **The R-100 comparison is a list of keys.** A domain test computes both sets' pages and asserts the keys that differ are exactly `['tiles.rates', 'oddsCountRealOnly']`, named after R-10 and R-2.
5. **One tournament-facts read.** `loadTournamentFacts(db, tournament)` -> `{ teamCount, deadlineRound, standingsCloses, survival }`; the context's tournament for a player and the visitor's for a guest both go through it.
6. **One wording module per page** (`components/rules/rules-texts.ts`, `components/help/help-texts.ts`): every sentence a ruling or an open question touches is one named entry, with its R-number in the comment, so an owner's answer is a one-line change and a test names the ruling.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/prediction/match-scoring.ts`, `.test.ts` (modify) | `marginParts` |
| `packages/domain/src/serija/serija.ts`, `.test.ts` (modify) | `serijaBonus` |
| `packages/domain/src/standings/standings-scoring.ts`, `.test.ts` (modify) | `placePoints`, `finalPoints` |
| `packages/domain/src/summary/standings-summary.ts`, `packages/domain/src/index.ts` (modify) | export `EUROLEAGUE_STAGE_NAMES` |
| `packages/domain/src/rules/rules-page.ts`, `.test.ts` (create) | `rulesPage`, `RulesPage` |
| `packages/domain/src/rules/help-page.ts`, `.test.ts` (create) | `helpPage`, `HelpPage` |
| `packages/db/src/hub/repository.ts` or `packages/db/src/tournament/facts.ts`, `packages/db/src/index.ts` (modify/create) | `loadTournamentFacts`, `findVisitorTournament` |
| `packages/db/test/visitor-tournament.test.ts` (create) | db test |
| `apps/web/src/app/{rules,help,privacy,charity}/page.tsx` (create) | the pages |
| `apps/web/src/components/rules/*.tsx`, `components/help/*.tsx`, `components/static/*.tsx` (create, + tests) | the views and their texts modules |
| `apps/web/src/server/visitor-tournament.ts` (create) | the context's tournament, or the visitor's, with its facts |
| `apps/web/public/img/help/euroleague/*.png`, `public/img/charity/*.png` (create) | copied images |
| `apps/web/src/components/shell/icon-paths-static.ts`, `icon.tsx` (create, modify) | the ten missing icons |
| `apps/web/src/components/shell/nav-entries.ts`, `.test.ts`, `components/hub/charity-card.tsx`, `components/tournament/register-form-view.tsx` (modify) | entries, charity links, the form's "Taisyklės" link |
| `apps/web/next.config.ts` (modify) | the two redirects (not a gate file) |
| `apps/web/tests/feature/static-pages.test.ts` (create) | routes |
| `apps/web/e2e/static-pages.spec.ts` (create) | the journey |
| `CLAUDE.md`, the spec, `docs/phase-2-inventory.md` (modify) | the rule, decisions, C12/C13 settled |

Not changed: `tokens.css` (no new token), `GUARDED_PAGES` (all four pages are public; none is guarded), `SHELL_LINKS` (it holds profile, admin and tournament exit only), `proxy.ts` (its matcher already skips `/img/`).

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>` (builds the app); e2e: `pnpm test:e2e`. The gate (`node quality/gate.mjs`) runs after each edit; a new test file is inside a vitest project, so no `testsOutsideGate` entry is needed (feature and E2E files are already listed).

---

### Task 1: The match and serija scorers split

**Files:** `packages/domain/src/prediction/match-scoring.ts`, `.test.ts`, `packages/domain/src/serija/serija.ts`, `.test.ts`

- [ ] **Step 1: Tests first.** `marginParts`: 88:79 against 88:79 -> rule 50, exact margin 0, bingo 50; 92:83 -> 50, 20, 0; 85:80 -> 46, 0, 0; 79:88 -> 32, 0, 0; 60:115 -> −14, 0, 0 (R-42, MS-6). `serijaBonus(1, rate 1)` 0, `(2, 1)` 5, `(3, 2)` 20 (step 5, sportbet 2871bb3).
- [ ] **Step 2:** run, watch them fail (not defined).
- [ ] **Step 3: Implement.** Extract `marginParts` from `marginAndBingo` (which returns `margin = rule + exactMarginBonus`); extract `serijaBonus` from `walkSerija`'s `pointsWhole(Math.max(0, run - 1) * SERIJA_STEP).times(rate)`. Neither is exported from `index.ts`.
- [ ] **Step 4:** `pnpm --filter @sportbet/domain test && pnpm typecheck`. Every existing scoring, serija and recalculation test passes unchanged.
- [ ] Commit - `refactor(domain): marginParts and serijaBonus split out of scoreMatch and walkSerija, for the rules page (#35)`

### Task 2: The standings scorers split, the stage names exported

**Files:** `packages/domain/src/standings/standings-scoring.ts`, `.test.ts`, `packages/domain/src/summary/standings-summary.ts`, `packages/domain/src/index.ts`

- [ ] **Step 1: Tests first.** `placePoints(p, p)` 190; one place off 180; seven off 120; nineteen off 0 (never below). `finalPoints` over places 1-2: 36 27 / 27 30. `EUROLEAGUE_STAGE_NAMES` is exported and names `place` "Reguliarus sezonas", `playOffs` "Atkrintamosios", `finalFour` "Finalo ketvertas", `final` "Finalas" (R-76; the exported constant already exists, an index test names it).
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement.** `placeLine` and `finalLine` call `placePoints` / `finalPoints`; the crowd bonus (R-35, `positionsGetCrowdBonus`) stays in `placeLine`. The functions are internal; `STANDINGS_POINTS`, `STANDINGS_COUNTS` and `EUROLEAGUE_STAGE_NAMES` are the bracket table's inputs (no `STANDINGS_STAGES`).
- [ ] **Step 4:** domain tests and typecheck pass; recalculation and golden tests unchanged.
- [ ] Commit - `refactor(domain): placePoints and finalPoints split out of scoreStandings; the stage names exported (#35)`

### Task 3: `rulesPage`

**Files:** create `packages/domain/src/rules/rules-page.ts`, `.test.ts`; modify `index.ts`

- [ ] **Step 1: Tests first,** under `for (const [set, rules] of bothSets)`: tiles (50, 50, 50, 20, serija step 5; rates: `×1 / ×2` under sportbet, `×1 / ×2 / ×3` under ruled, from `stageRates`' distinct values in stage order); bounds 50-120, no draws; the five margin examples as Task 1; the five odds examples (shares 93, 50, 33, 10, 3; odds and winner points as qa reads them off sportbet's `/rules` at 1618164 - do not compute them by hand); serija rows +0, +5, +10 and the N row's step, so the tile reads `+(N−1)×5` (R-106), plus a `serijaOrder: 'tip-off'` field (R-106, from `walkSerija`'s order); places miss 0-7, 190 to 120, `last` false, `placesContinue` true, `placeStep` 10; `teamCount` passed through, null kept; bracket rows 60 and 120 with the counts 8 and 4; finals grid; the deadline round and whether it closes (`standingsCloses` state, R-128) passed through, null kept (R-106). The R-100 test: the keys that differ between the two sets are exactly `tiles.rates` (R-10) and `oddsCountRealOnly` (R-2). A share is integer half-up.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement** with only the split scorers, `gameOddsHundredths`, `winnerPointsAt`, `EUROLEAGUE_POINTS`, `SERIJA_STEP`, `STANDINGS_POINTS`, `STANDINGS_COUNTS`, `PREDICTION_MIN` / `PREDICTION_MAX` and the rule set. The fixed inputs (30 players, 28/15/10/3/1; the margin examples' offsets from the middle of 50-120: +3 / −6, +4 each, 0 / −5, swapped, min + 10 / max − 5) are named constants with sportbet's `ScoringRules` line references.
- [ ] **Step 4:** domain tests, typecheck, lint.
- [ ] Commit - `feat(domain): rulesPage - every figure on /rules from the scorers, ruledRules' rates and R-2 (#35, R-100)`

### Task 4: `helpPage`

**Files:** create `packages/domain/src/rules/help-page.ts`, `.test.ts`; modify `index.ts`

- [ ] **Step 1: Tests first.** Table length the team count (null kept); the deadline round and its state passed through (R-106, R-128); final places `STANDINGS_COUNTS.finalPlaces` (2); `partialTableAccepted: true`, named after the standings save (`standings-table.ts`'s row saves and the design's "An incomplete table is accepted"; sportbet's `enforce` refuses only conflicting rows, never a short table, so its Euroleague help sentence "nepilna prognozė nepriimama" is wrong, Q5); `survival` passed through from the tournament's switch.
- [ ] **Steps 2-4** as above.
- [ ] Commit - `feat(domain): helpPage (#35)`

### Task 5: `loadTournamentFacts` and `findVisitorTournament`

**Files:** `packages/db/src/hub/repository.ts` (or a `tournament/facts.ts` beside the catalogue), `packages/db/src/index.ts`, create `packages/db/test/visitor-tournament.test.ts`

- [ ] **Step 1: Tests first** (`useTestDatabase`): `loadTournamentFacts` -> the team count, the deadline round (the tournament's own, else `STANDINGS_DEADLINE_ROUND`), `standingsCloses` from the loaded `Season` (`never` with no game in that round, `open`, `closed`) and the tournament's `survival`, parsed with the domain schema. `findVisitorTournament`: a guest gets the first hub card that is not finished, in `loadHub`'s order (active before upcoming, earliest start, lowest id), with its facts; a non-public tournament is never a guest's (R-50, `ruledRules`); none -> null.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement** through the catalogue, `orderedTournaments` and `loadSeason`; no second ordering written, and no second copy of the deadline-round default (`standings-closes-sql.ts` and `Season` already hold it).
- [ ] **Step 4:** `pnpm --filter @sportbet/db test -- visitor-tournament hub && pnpm typecheck`.
- [ ] Commit - `feat(db): loadTournamentFacts and findVisitorTournament - what a visitor's rules and help describe (#35)`

### Task 6: Images and redirects

**Files:** `apps/web/public/img/help/euroleague/`, `apps/web/public/img/charity/`, `apps/web/next.config.ts`

- [ ] **Step 1:** copy `D:\Projects\sportbet\public\img\help\euroleague\{results,standings,survival}.png` and `public\img\JL_thank.png`, `JL_payment_{el2025,el2024,el2023,el2022,ecb2022,el2021,el2020,ecf2020,el2019,el2018_2,el2018_1}.png` (the eleven the charity view lists; not `JL_payment.png`). the three help screenshots were viewed on 2026-10-16 (dark-theme crops of fixtures, a standings ladder and survival cards: team names only, no player), and so was `JL_payment_el2025.png` (a payment receipt with an order number, no person); web-dev opens the other ten and the lead confirms before the commit.
- [ ] **Step 2:** a feature test: `/support` -> 308 `/charity`, `/sponsors` -> 308 `/`. Watch it fail.
- [ ] **Step 3:** `redirects()` in `next.config.ts`, `permanent: true`.
- [ ] Commit - `feat(web): /support and /sponsors redirect; help and charity images copied (#35)`

### Task 7: `/privacy` and `/charity`

**Files:** create `apps/web/src/app/{privacy,charity}/page.tsx`, `components/static/{privacy,charity}-view.tsx` and tests

- [ ] **Step 1: The privacy diff for the owner (R-108, Q9, Q11).** Write sportbet's `privacy.blade.php` text (every `__()` string and link, in order, one sentence per line) to the scratchpad as `privacy-sportbet.txt`, and the new page's text as `privacy-new.txt`: identical except for R-108's three fixes - "Atnaujinta:" the month Q11 settles; the IP sentence ("IP adresas ir naršyklės informacija, matomi tik serverio žurnaluose; prisijungimų įraše IP adresas nesaugomas.", the spec's wording is the same in substance); the session cookie ("būtinas prisijungimui palaikyti. Galioja 90 dienų ir pratęsiamas kiekvieno apsilankymo metu; ištrinamas atsijungus."). Produce `git diff --no-index --word-diff privacy-sportbet.txt privacy-new.txt` and send it to the lead, who shows it to the owner together with the list of statements that may now be incomplete (Q9). Nothing below for `/privacy` is committed until the owner approves; an owner's change to the wording goes into `privacy-new.txt` and the diff is sent again. `/charity` does not wait.
- [ ] **Step 2: Component tests first.** Privacy: every heading 1-8 and sentence of the approved `privacy-new.txt`, the three fixes by name (R-44, R-45, R-108); the mailto link; external links `rel="noopener"`. Charity: the hero with 7 500€, 8+, 2018 (one `CHARITY_TOTAL`-style constant shared with the hub and leaderboard cards if the architect agrees); "krepšinio prognozių žaidimas" (R-52, R-75); the TransUnion paragraph; eleven proofs in sportbet's order, each a link to its image and with its label ("Euroleague 2025" ... "Euroleague 2018 (1)", "EuroBasket 2022", "Euro 2020").
- [ ] **Step 3:** run, watch them fail.
- [ ] **Step 4: Implement** in tokens only (`token-guard.test.ts`); the hero's amber from the charity card's tokens (`warn`, `warn-tint`, `on-accent`).
- [ ] Commit `/charity` - `feat(web): /charity (#35)`; after the owner's approval, `/privacy` - `feat(web): /privacy - sportbet's text with R-108's three fixes, approved by the owner (#35)`

### Task 8: `/rules`

**Files:** create `apps/web/src/app/rules/page.tsx`, `apps/web/src/server/visitor-tournament.ts`, `components/rules/rules-view.tsx`, `components/rules/rules-texts.ts` (and a file per card if it grows past one screen), tests

- [ ] **Step 1: Component tests first,** from a `rulesPage(ruledRules, ...)` fixture: the six cards in sportbet's order and titles; the tiles' texts; the formula line; the two bounds sentences (from `SAVE_TEXTS` in `server/predictions/texts.ts`, not retyped); the margin table's rows, signs (real minus) and classes; the odds table and the R-2 bullet (Q3, R-133 text); the switch-off bullet (Q4: "Praleidus 20 rungtynių per turnyrą, žaidėjas paslepiamas lentelėse ir spėjimai už jį nebegeneruojami, kol jis vėl išsaugo spėjimą.", wording for the owner to confirm, shown under both sets as it is sportbet_new's own rule R-7/R-32); the serija table; places, the continue caption, "(1-20)" and its absence when `teamCount` is null; the bracket table; the finals matrix; the deadline sentence for the tournament's round (R-106, R-128, Q1) linking to `STANDINGS_PATH` only for a player, and, per R-133 Q1, with the round's number even when that round has no game yet, without it only when there is no tournament; the serija bullet "pagal rungtynių pradžios laiką" and the tile `+(N−1)×5` (R-106); the tie-break sentence word for word (R-107); the bracket rows "Atkrintamosios (1/4)", "Finalo ketvertas (1/2)", "Finalas (F)" (R-133 Q2). Under a `sportbetRules` fixture: `×1 / ×2` and no R-2 bullet.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement.** `server/visitor-tournament.ts`: the request context's tournament for a player (`requestContext`, R-28, R-46), else `findVisitorTournament`; either way `loadTournamentFacts`. The page: `connection()`, load, `rulesPage(ruledRules, ...)`, return `<RulesView>`. The fee panel: for a signed-in player in a tournament, `loadDashboardLeague(db, { player, tournament, rules: ruledRules }).panel` into the existing `FeePanel` (R-104, R-124, R-123 are inside it); a guest or a player with no panel sees none; sportbet's fee partial carries no league messages here, so none are shown. Table colours `bg-accent-tint text-accent font-bold` and `text-muted`, no new token. Card icons from Task 10's set.
- [ ] **Step 4:** component tests, typecheck, lint, token guard.
- [ ] Commit - `feat(web): /rules from rulesPage under ruledRules (#35, R-100)`

### Task 9: `/help`

**Files:** create `apps/web/src/app/help/page.tsx`, `components/help/help-view.tsx`, `components/help/help-texts.ts`, test; modify `components/survival/survival-rules.tsx` and its test (R-133 Q6)

- [ ] **Step 1: Component tests first:** three cards in sportbet's order; the basketball icon; each screenshot with sportbet's alt text ("Rungtynių rezultatų spėjimas", "Turnyro eigos spėjimas", "Išlikimo spėjimas"); the deadline sentence for the tournament's round (R-106, Q1) with the table length and the stage names with marks (Q2); the final's two places; the partial-table sentence "Lentelę galima pildyti dalimis - nepilna prognozė taip pat išsaugoma." (Q5); the survival paragraph carrying "arba kol panaudotos visos komandos" (Q6); the survival block and the summary's survival line only when the tournament's switch is on (Q7), for a guest as for a player; the Informacija list.
- [ ] **Steps 2-4** as above; the page loads through `server/visitor-tournament.ts` and `helpPage`.
- [ ] **Step 5 (R-133 Q6):** the same clause on the survival page: `components/survival/survival-rules.tsx` rule 4 and its test `survival-rules.test.tsx` (which pins "Tos pačios komandos antrą kartą rinktis negalima, kol serija nenutrūksta.") change to "... kol serija nenutrūksta arba kol panaudotos visos komandos." One shared sentence constant for the survival page and `/help`, so the two cannot drift.
- [ ] Commit - `feat(web): /help; the survival rule names the reset (#35, R-133)`

### Task 10: Navigation, links and icons

**Files:** `apps/web/src/components/shell/nav-entries.ts`, `.test.ts`, `icon-paths-static.ts`, `icon.tsx`, `components/hub/charity-card.tsx`, its test, `components/tournament/register-form-view.tsx`, its test

- [ ] **Step 1: Tests first.** Player: "Taisyklės", "Pagalba", "Jaunimo linija", "Privatumas" in group `info`, surfaces `['rail', 'menu']`, after "Lygos" in the rail's last block and in the menu's "Informacija" block (which precedes "Lyga"). Guest: "Taisyklės" in group `main`, surface `['rail']`, after "Lyderiai"; "Pagalba", "Jaunimo linija", "Privatumas" in group `info` (the rail's block after the separator); "Jaunimo linija" also on the `pills` surface (`phone-header.tsx` draws pills; no guest menu exists). Icons `journal-text`, `question-circle`, `heart`, `shield-lock`; the pill's `heart-fill`; the card icons the two views use (`award-fill`, `rulers`, `graph-up`, `diagram-3-fill`, `receipt`) in `icon-paths-static.ts`. `privacyHref()` returns `/privacy`. The charity card: the hub variant links "Jaunimo linijai" inline and the "more" line to `/charity`, the leaderboard variant only the "more" line. The registration form's "Taisyklės" is a `Link` to `/rules`.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement.** No `NavEntry` change (audience already splits the guest's and the player's entries). Entries use `NavLink`, which does not prefetch. Update the charity card's doc comment and `register-form-view.tsx`'s comment ("text until /rules exists").
- [ ] Commit - `feat(web): the information entries, the charity pill and links, the privacy link in the cookie banner, the form's rules link (#35)`

### Task 11: Feature and E2E

**Files:** create `apps/web/tests/feature/static-pages.test.ts`, `apps/web/e2e/static-pages.spec.ts`

- [ ] Feature: each of the four pages 200 for a guest and a player; `/rules` for a guest on an empty database 200 without the table-length caption and the deadline round; `/help` shows the survival block only for a tournament with survival; the redirects (Task 6).
- [ ] E2E at 1280: a guest opens "Taisyklės" from the rail and sees `×1 / ×2 / ×3`; "Pagalba" shows the results screenshot; the cookie banner's link opens `/privacy`; the hub card's charity link opens `/charity`. At 390: a player opens "Taisyklės" from the phone menu's "Informacija" block; a guest sees the "Jaunimo linija" pill and it opens `/charity` (a guest has no menu, as in sportbet; Q10).
- [ ] Commit - `test(web): static pages' routes and journey (#35)`

### Task 12: Docs

**Files:** `CLAUDE.md`, the spec, `docs/phase-2-inventory.md`

- [ ] `CLAUDE.md`, under the dashboard rule: "`/rules` shows only what `rulesPage` returns under `ruledRules` (R-100); its figures come from the scorers `recalculateTournament` uses (`marginParts`, `serijaBonus`, `placePoints`, `finalPoints`, `gameOddsHundredths`), never a typed number. What `/rules` and `/help` say of the standings deadline, the serija order and a short standings table is what the code does (R-106); the facts of the tournament they describe come only from `loadTournamentFacts`."
- [ ] The spec: the planning decisions above, R-133 and the approval of the privacy diff (date, R-108).
- [ ] The inventory: C12 and C13 settled (redirected, slice 18).
- [ ] Commit - `docs: slice 18 - the rules page rule, the owner's answers (#35)`

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test`, the db and feature suites, `pnpm test:e2e`.
- [ ] architect: mp-code-review since the slice's first commit; improve-codebase-architecture on `rules/` and the new components.
- [ ] qa: every row of the spec's rulings table and every figure of sportbet's `/rules` (running 1618164) has a named test; the page on staging read side by side with sportbet's.
- [ ] Close #35 with the "Done means" checked on staging.
