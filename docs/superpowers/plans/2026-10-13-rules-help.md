# Slice 18: rules, help and static pages - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-5, web-dev 6-11, qa and architect review each, only the lead commits.

**Goal:** `/rules`, `/help`, `/privacy` and `/charity` at sportbet's URLs and texts, `/rules` generated from the domain under `ruledRules` (R-100); `/support` and `/sponsors` redirect (#35).

**Architecture:** The domain decides every figure on `/rules` (`rulesPage`) and every rule-dependent line on `/help` (`helpPage`), calling the internal scorers that `recalculateTournament` uses, so the page cannot drift from scoring. `packages/db` adds one read, `findVisitorTournament`, for a guest's tournament. `apps/web` has four pages, each loading and returning one component, two redirects and the navigation entries.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-rules-help-design.md`. Rulings R-100, R-106 (state what the code does), R-107 (the prize tie-break sentence stays), R-108 (privacy: three fixes, the owner approves the diff); the lead's decision to use R-76's stage names; the rulings table in the spec.

**Gate:** `/privacy` does not land until the owner has approved the diff that Task 7 produces (R-108). Nothing else waits on the owner.

## Decisions taken while planning (refine the spec; record them in it in Task 12)

1. **The scorers are split, not copied.** `marginParts`, `serijaBonus`, `placePoints` and `finalPoints` are extracted from the functions that use them today, which then call them; they stay unexported from `packages/domain/src/index.ts` (the comment at line 219 grows their names). Only `rulesPage`, `helpPage` and their types are exported.
2. **The worked examples score through `marginParts`, not `scoreMatch`.** `scoreMatch` needs a prediction, a game, a round and a crowd for a figure that depends on two scores; `marginParts` is the part of `scoreMatch` the margin table shows, and `scoreMatch`'s tests prove it sums them.
3. **`rulesPage` takes `{ teamCount, deadlineRound }` as nullable** - a guest on an empty database still gets the page.
4. **The R-100 comparison is a list of keys.** A domain test computes both sets' pages and asserts the keys that differ are exactly `['tiles.rates', 'oddsCountRealOnly']`, named after R-10 and R-2.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/prediction/match-scoring.ts`, `.test.ts` (modify) | `marginParts` |
| `packages/domain/src/serija/serija.ts`, `.test.ts` (modify) | `serijaBonus` |
| `packages/domain/src/standings/standings-scoring.ts`, `.test.ts` (modify) | `placePoints`, `finalPoints`, `STANDINGS_STAGES` |
| `packages/domain/src/rules/rules-page.ts`, `.test.ts` (create) | `rulesPage`, `RulesPage` |
| `packages/domain/src/rules/help-page.ts`, `.test.ts` (create) | `helpPage`, `HelpPage` |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/hub/repository.ts`, `packages/db/src/index.ts` (modify) | `findVisitorTournament` |
| `packages/db/test/visitor-tournament.test.ts` (create) | db test |
| `apps/web/src/app/{rules,help,privacy,charity}/page.tsx` (create) | the pages |
| `apps/web/src/components/rules/*.tsx`, `components/help/*.tsx`, `components/static/*.tsx` (create, + tests) | the views |
| `apps/web/src/server/visitor-tournament.ts` (create) | the context's tournament, or the visitor's |
| `apps/web/public/img/help/euroleague/*.png`, `public/img/charity/*.png` (create) | copied images |
| `apps/web/src/components/shell/nav-entries.ts`, `.test.ts`, `components/hub/charity-card.tsx` (modify) | entries, charity links |
| `apps/web/next.config.ts` (modify) | the two redirects |
| `apps/web/src/app/tokens.css` (modify, if needed) | sportbet's rules-table colours |
| `apps/web/tests/feature/static-pages.test.ts` (create) | routes |
| `apps/web/e2e/static-pages.spec.ts` (create) | the journey |
| `CLAUDE.md`, the spec, `docs/phase-2-inventory.md` (modify) | the rule, decisions, C12/C13 settled |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>` (builds the app); e2e: `pnpm test:e2e`.

---

### Task 1: The match and serija scorers split

**Files:** `packages/domain/src/prediction/match-scoring.ts`, `.test.ts`, `packages/domain/src/serija/serija.ts`, `.test.ts`

- [ ] **Step 1: Tests first.** `marginParts`: 88:79 against 88:79 -> rule 50, exact margin 0, bingo 50; 92:83 -> 50, 20, 0; 85:80 -> 46, 0, 0; 79:88 -> 32, 0, 0; 60:115 -> −14, 0, 0 (R-42, MS-6). `serijaBonus(1, rate 1)` 0, `(2, 1)` 10, `(3, 2)` 40.
- [ ] **Step 2:** run, watch them fail (not defined).
- [ ] **Step 3: Implement.** Extract `marginParts` from `marginAndBingo` (which returns `margin = rule + exactMarginBonus`); extract `serijaBonus` from `walkSerija`'s `Math.max(0, run - 1) * SERIJA_STEP` times rate. Neither is exported from `index.ts`.
- [ ] **Step 4:** `pnpm --filter @sportbet/domain test && pnpm typecheck`. Every existing scoring, serija and recalculation test passes unchanged.
- [ ] Commit - `refactor(domain): marginParts and serijaBonus split out of scoreMatch and walkSerija, for the rules page (#35)`

### Task 2: The standings scorers split

**Files:** `packages/domain/src/standings/standings-scoring.ts`, `.test.ts`

- [ ] **Step 1: Tests first.** `placePoints(p, p)` 190; one place off 180; seven off 120; nineteen off 0 (never below). `finalPoints` over places 1-2: 36 27 / 27 30. `STANDINGS_STAGES`: play-offs 60, Final Four 120, named "Atkrintamosios", "Finalo ketvertas" and the final "Finalas" (R-76, the lead's decision; not sportbet's "Ketvirtfinalis", "Pusfinalis", "1/4, 1/2").
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement.** `placeLine` and `finalLine` call them; the crowd bonus (R-35, `positionsGetCrowdBonus`) stays in `placeLine`. Internal.
- [ ] **Step 4:** domain tests and typecheck pass; recalculation and golden tests unchanged.
- [ ] Commit - `refactor(domain): placePoints, finalPoints and the stage table split out of scoreStandings (#35)`

### Task 3: `rulesPage`

**Files:** create `packages/domain/src/rules/rules-page.ts`, `.test.ts`; modify `index.ts`

- [ ] **Step 1: Tests first,** under `for (const [set, rules] of bothSets)`: tiles (50, 50, 50, 20, serija step 10; rates: `×1 / ×2` under sportbet, `×1 / ×2 / ×3` under ruled, from `stageRates`' distinct values in stage order); bounds 50-120, no draws; the five margin examples as Task 1; the five odds examples (shares 93, 50, 33, 10, 3; odds and winner points as qa reads them off sportbet's `/rules` at 3eb95e7 - do not compute them by hand); serija rows +0, +10, +20 and the N row's step, so the tile reads `+(N−1)×10` (R-106), plus a `serijaOrder: 'tip-off'` field (R-106, from `walkSerija`'s order); places miss 0-7, 190 to 120, `last` false, `placesContinue` true, `placeStep` 10; `teamCount` passed through, null kept; finals grid; the deadline round passed through, null kept (R-106). The R-100 test: the keys that differ between the two sets are exactly `tiles.rates` (R-10) and `oddsCountRealOnly` (R-2). A share is integer half-up.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement** with only the split scorers, `gameOddsHundredths`, `winnerPointsAt`, `EUROLEAGUE_POINTS`, `SERIJA_STEP`, `PREDICTION_MIN` / `PREDICTION_MAX` and the rule set. The fixed inputs (30 players, 28/15/10/3/1; the margin examples' offsets from the middle of 50-120: +3 / −6, +4 each, 0 / −5, swapped, min + 10 / max − 5) are named constants with sportbet's `ScoringRules` line references.
- [ ] **Step 4:** domain tests, typecheck, lint.
- [ ] Commit - `feat(domain): rulesPage - every figure on /rules from the scorers, ruledRules' rates and R-2 (#35, R-100)`

### Task 4: `helpPage`

**Files:** create `packages/domain/src/rules/help-page.ts`, `.test.ts`; modify `index.ts`

- [ ] **Step 1: Tests first.** Stage names from `STANDINGS_STAGES`; table length the team count (null kept); final places 2; partial table accepted as slice 9's standings save accepts it (check `standings-table.ts` and say so in the test name); survival passed through.
- [ ] **Steps 2-4** as above.
- [ ] Commit - `feat(domain): helpPage (#35)`

### Task 5: `findVisitorTournament`

**Files:** `packages/db/src/hub/repository.ts`, `packages/db/src/index.ts`, create `packages/db/test/visitor-tournament.test.ts`

- [ ] **Step 1: Tests first** (`useTestDatabase`): a guest gets the first hub card that is not finished, in `loadHub`'s order (active before upcoming, earliest start, lowest id); a non-public tournament is never a guest's (R-50, `ruledRules`); none -> null; the result carries the team count and the deadline round (the tournament's own, else `STANDINGS_DEADLINE_ROUND`), parsed with the domain schema.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement** through the catalogue and the hub's ordering; no second ordering written.
- [ ] **Step 4:** `pnpm --filter @sportbet/db test -- visitor-tournament hub && pnpm typecheck`.
- [ ] Commit - `feat(db): findVisitorTournament - the tournament a guest's rules and help describe (#35)`

### Task 6: Images and redirects

**Files:** `apps/web/public/img/help/euroleague/`, `apps/web/public/img/charity/`, `apps/web/next.config.ts`

- [ ] **Step 1:** copy `D:\Projects\sportbet\public\img\help\euroleague\{results,standings,survival}.png` and `public\img\JL_thank.png`, `JL_payment_*.png` (the eleven the charity view lists; not `JL_payment.png`). Check none shows another player's data the owner has not seen; ask through the lead if one does.
- [ ] **Step 2:** a feature test: `/support` -> 308 `/charity`, `/sponsors` -> 308 `/`. Watch it fail.
- [ ] **Step 3:** `redirects()` in `next.config.ts`, `permanent: true`.
- [ ] Commit - `feat(web): /support and /sponsors redirect; help and charity images copied (#35)`

### Task 7: `/privacy` and `/charity`

**Files:** create `apps/web/src/app/{privacy,charity}/page.tsx`, `components/static/{privacy,charity}-view.tsx` and tests

- [ ] **Step 1: The privacy diff for the owner (R-108).** Write sportbet's `privacy.blade.php` text (every `__()` string and link, in order, one sentence per line) to the scratchpad as `privacy-sportbet.txt`, and the new page's text as `privacy-new.txt`: identical except for R-108's three fixes - line 7 "Atnaujinta:" the switch-over month; line 17 the IP sentence "IP adresas ir naršyklės informacija, matomi tik serverio žurnaluose; prisijungimų įraše IP adresas nesaugomas."; line 35 the session cookie "būtinas prisijungimui palaikyti. Galioja 90 dienų ir pratęsiamas kiekvieno apsilankymo metu; ištrinamas atsijungus.". Produce `git diff --no-index --word-diff privacy-sportbet.txt privacy-new.txt` and send it to the lead, who shows it to the owner. Nothing below for `/privacy` is committed until the owner approves; an owner's change to the wording goes into `privacy-new.txt` and the diff is sent again. `/charity` does not wait.
- [ ] **Step 2: Component tests first.** Privacy: every heading 1-8 and sentence of the approved `privacy-new.txt`, the three fixes by name (R-44, R-45, R-108); the mailto link; external links `rel="noopener"`. Charity: the hero with 7 500€, 8+, 2018; "krepšinio prognozių žaidimas" (R-52, R-75); the TransUnion paragraph; eleven proofs in sportbet's order, each a link to its image.
- [ ] **Step 3:** run, watch them fail.
- [ ] **Step 4: Implement** in tokens only (`token-guard.test.ts`); the hero's amber from the charity card's tokens.
- [ ] Commit `/charity` - `feat(web): /charity (#35)`; after the owner's approval, `/privacy` - `feat(web): /privacy - sportbet's text with R-108's three fixes, approved by the owner (#35)`

### Task 8: `/rules`

**Files:** create `apps/web/src/app/rules/page.tsx`, `apps/web/src/server/visitor-tournament.ts`, `components/rules/rules-view.tsx` (and a file per card if it grows past one screen), tests; modify `tokens.css` if needed

- [ ] **Step 1: Component tests first,** from a `rulesPage(ruledRules, ...)` fixture: the six cards in sportbet's order and titles; the tiles' texts; the formula line; the two bounds sentences (from the prediction texts module, not retyped); the margin table's rows, signs (real minus) and classes; the odds table and the R-2 bullet; the serija table; places, the continue caption, "(1-20)" and its absence when `teamCount` is null; the bracket table; the finals matrix; the deadline sentence "iki {N}-ojo turo pradžios" (R-106) linking to `STANDINGS_PATH` only for a player, and without the round when it is null; the serija bullet "pagal rungtynių pradžios laiką" and the tile `+(N−1)×10` (R-106); the tie-break sentence word for word (R-107); the stage names "Atkrintamosios", "Finalo ketvertas", "Finalas" (R-76). Under a `sportbetRules` fixture: `×1 / ×2` and no R-2 bullet.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement.** `server/visitor-tournament.ts`: the request context's tournament for a player, else `findVisitorTournament`. The page: `connection()`, load, `rulesPage(ruledRules, ...)`, return `<RulesView>`. The fee panel: slice 12's, for a signed-in player, if slice 12 has landed; otherwise leave it out and open a follow-up issue.
- [ ] **Step 4:** component tests, typecheck, lint, token guard.
- [ ] Commit - `feat(web): /rules from rulesPage under ruledRules (#35, R-100)`

### Task 9: `/help`

**Files:** create `apps/web/src/app/help/page.tsx`, `components/help/help-view.tsx`, test

- [ ] **Step 1: Component tests first:** three cards in sportbet's order; the basketball icon; each screenshot with sportbet's alt text; the sentence "Iki {N}-ojo turo pradžios reikia numatyti ..." (R-106) with the table length and R-76's stage names; survival's block and summary line only when `survival`; the Informacija list.
- [ ] **Steps 2-4** as above; the page loads through `server/visitor-tournament.ts` and `helpPage`.
- [ ] Commit - `feat(web): /help (#35)`

### Task 10: Navigation

**Files:** `apps/web/src/components/shell/nav-entries.ts`, `.test.ts`, `components/hub/charity-card.tsx`, its test

- [ ] **Step 1: Tests first.** Player rail: "Taisyklės", "Pagalba", "Jaunimo linija", "Privatumas" after "Lygos" (or last, until slice 12's entry exists); guest rail: "Taisyklės" after "Lyderiai", the other three after the separator; the phone menu's "Informacija" - check `partials/header.blade.php` 105-121 for which audience sees it and copy it; the guest "Jaunimo linija" pill. Icons `journal-text`, `question-circle`, `heart`, `shield-lock` (add to `icon.tsx` if missing). `privacyHref()` returns `/privacy`. The charity card's "more" text is a link to `/charity`.
- [ ] **Step 2:** run, watch them fail.
- [ ] **Step 3: Implement.** Where one audience needs an entry in two blocks, list it twice with its surfaces split; do not widen `NavEntry`. Update the charity card's doc comment.
- [ ] Commit - `feat(web): the information entries, the charity pill and the privacy link in the cookie banner (#35)`

### Task 11: Feature and E2E

**Files:** create `apps/web/tests/feature/static-pages.test.ts`, `apps/web/e2e/static-pages.spec.ts`

- [ ] Feature: each of the four pages 200 for a guest and a player; `/rules` for a guest on an empty database 200 without the table-length caption; the redirects (Task 6).
- [ ] E2E at 390 and 1280: a guest opens "Taisyklės" from the rail (1280) and the menu (390) and sees `×1 / ×2 / ×3`; "Pagalba" shows the results screenshot; the cookie banner's link opens `/privacy`; the hub card's charity link opens `/charity`.
- [ ] Commit - `test(web): static pages' routes and journey (#35)`

### Task 12: Docs

**Files:** `CLAUDE.md`, the spec, `docs/phase-2-inventory.md`

- [ ] `CLAUDE.md`, under the dashboard rule: "`/rules` shows only what `rulesPage` returns under `ruledRules` (R-100); its figures come from the scorers `recalculateTournament` uses (`marginParts`, `serijaBonus`, `placePoints`, `finalPoints`, `gameOddsHundredths`), never a typed number."
- [ ] The spec: the planning decisions above, and the owner's approval of the privacy diff (date, R-108).
- [ ] The inventory: C12 and C13 settled (redirected, slice 18).
- [ ] Commit - `docs: slice 18 - the rules page rule, the owner's answers (#35)`

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test`, the db and feature suites, `pnpm test:e2e`.
- [ ] architect: mp-code-review since the slice's first commit; improve-codebase-architecture on `rules/` and the new components.
- [ ] qa: every row of the spec's rulings table and every figure of sportbet's `/rules` has a named test; the page on staging read side by side with sportbet's.
- [ ] Close #35 with the "Done means" checked on staging.
