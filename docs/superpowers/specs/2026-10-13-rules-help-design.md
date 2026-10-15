# Slice 18: rules, help and static pages

A17 and A23 of `docs/phase-2-inventory.md` (#35): `/rules`, `/help`,
`/privacy` and `/charity`, with `/support` and `/sponsors` (section 4, C12
and C13) answered by redirects. Euroleague only (decision 11).

Binding: decisions 5, 6, 11 and 13; R-100, and every ruling that changes a
number or a statement on these pages (listed below), with R-106 to
R-108; the rules in
`CLAUDE.md` (the domain decides, pages only load, tokens, Lithuanian text in
components, a navigation entry only with its page).

## The reference

sportbet at **3eb95e7**: `routes/web.php` (78-83),
`app/Http/Controllers/RulesController.php`, `HelpController.php`,
`app/Support/ScoringRules.php`, `HelpFormat.php`, `StandingsFormat.php`
(88: the table runs 1 to the tournament's team count),
`app/Models/Tournament.php` (`forVisitor` 71-91), `config/points.php`
(euroleague 109-125), `config/standings.php` (euroleague 86-118),
`config/scores.php` (euroleague 70-74), `config/help.php`,
`resources/views/partials/rules.blade.php`, `help.blade.php`,
`privacy.blade.php`, `charity.blade.php`, `support.blade.php`,
`sponsors.blade.php`, and the navigation (`partials/rail.blade.php` 84-98,
`rail-guest.blade.php` 27-44, `header.blade.php` 36 and 105-121).

What sportbet does, in short:

- **`/rules`** is public. Every figure comes from `ScoringRules`, which
  reads the tournament's format and computes each worked example with the
  scoring services: nothing is typed twice. For a Euroleague tournament it
  shows, in order:
  1. **Totalizatoriaus eiga** - two stages (I "Reguliarusis sezonas", II
     "Atkrintamųjų etapas"), each with prose naming the bracket's stage
     labels ("1/4, 1/2"); the deadline sentence (a link to the standings
     page for a signed-in player, text for a guest); the fee panel
     (`partials/fee`, signed-in only); **Vertinimas**, four bullets
     including the tie-break sentence (line 72) and the fill-in sentence.
  2. **Taškų skaičiavimas - rungtynių rezultatai** - tiles:
     `(1+Koef.)×50`, `50 − |Δ|`, `+50` bingo, `+20` exact margin,
     `+N−1` serija (line 102, a literal), `×1 / ×2` stage rate (line 106,
     a literal); the formula line; the entry bounds ("Rezultatas turi būti
     nuo 50 iki 120.", "Lygiosios negalimos - komandų rezultatai turi
     skirtis.").
  3. **Tikslumas pagal rezultato skirtumą** - the margin rule's prose and
     five worked examples around the middle of the score range (88:79
     predicted 88:79, 92:83, 85:80, 79:88, 60:115), each with its miss, the
     margin points and the bonus (bingo or exact margin), and the
     "negative" caption.
  4. **Koeficientas** - the formula `log₂(Dalyvių_skaičius /
     Spėjusiųjų_šią_baigtį)`, "Taikomas tik atspėjus nugalėtoją.", "fill-ins
     get 0", and five crowd examples (28, 15, 10, 3, 1 of 30) with the
     stored two-place odds and the winner points.
  5. **Sekos premija** - four bullets, the order sentence "(ID tvarka)"
     (line 232), `+10` per extra call, and runs 1, 2, 3, N.
  6. **Taškų skaičiavimas - turnyro eiga** - places as "miss -> points"
     (0 to 7, then "Toliau - po 10 taškų ... kol nukrenta iki 0"), "Vieta
     spėjama bendroje lentelėje (1-N)" with N the team count; the bracket
     table (Ketvirtfinalis 60, Pusfinalis 120); the 2 x 2 finals matrix
     (36 27 / 27 30) with "1 - čempionas, 2 - vicečempionas.".
  There is no survival section.
- **`/help`** is public: **Spėjimai** (match results, standings, and
  survival only when the session's tournament plays it), each with its
  screenshot from `public/img/help/euroleague/`; **Suvestinė** (the four
  summaries, survival's only with survival); **Informacija** (the four
  static pages). The stage names and the table length come from
  `StandingsFormat`.
- **`/privacy`** and **`/charity`** are static views. `/charity` has the
  hero (7 500€, 8+, 2018), the thank-you image, the TransUnion paragraph
  and eleven payment proofs (`public/img/JL_*.png`).
- **`/support`** and **`/sponsors`** are static views nobody links to.
- **The tournament** a page describes is `Tournament::forVisitor`: the
  session's, or for a guest the first hub card that is not finished.
- **Navigation:** the player rail lists "Taisyklės", "Pagalba", "Jaunimo
  linija", "Privatumas" after "Lygos"; the guest rail lists "Taisyklės" in
  its first block and the other three after the separator; the phone menu's
  "Informacija" lists all four; the guest header has a "Jaunimo linija"
  pill. The cookie banner links to `/privacy`.

## Rulings applied

R-100 makes `/rules` show `ruledRules`' numbers; its test is "sportbet's
page, except where a listed ruling changed a rule". The rulings that touch
these pages:

| Ruling | sportbet's page | This app's page |
| --- | --- | --- |
| R-10 (`stageRates`) | tile `×1 / ×2` (a literal) | the rule set's distinct rates, `×1 / ×2 / ×3`; under `sportbetRules` (`stageRates: null`) sportbet's literal |
| R-2 (`crowdOddsCountFilledIn`) | the formula counts every prediction | one bullet more under `ruledRules`: only real predictions are counted |
| R-1 | fill-ins earn base points, odds 0 | unchanged: sportbet's sentences already say so |
| R-42 | +50 exact score, +20 exact margin | unchanged: both rule sets carry it |
| R-35, R-3, R-36 | the page never mentions the standings crowd bonus | unchanged: nothing on the page states it |
| R-14 | places from the final table | unchanged: the page states no timing |
| R-52, R-75 | `/charity`: "futbolo prognozių žaidimas" | "krepšinio", as the hub's charity card already reads |
| R-76 (lead decision) | bracket "Ketvirtfinalis", "Pusfinalis"; prose "1/4, 1/2" | "Atkrintamosios", "Finalo ketvertas", "Finalas" |
| R-106 | deadline "iki pirmųjų rungtynių", serija "(ID tvarka)", tile `+N−1` | what the domain does (below) |
| R-107 | the prize tie-break sentence | kept word for word |
| R-44, R-45, R-108 | `/privacy`: the session cookie ends with the browser; IP in logs | the three fixes below, approved by the owner as a diff |

Every other ruling leaves these pages as sportbet has them.

## Settled questions (2026-10-13)

The spec's four open questions, settled on the recommended option.

1. **R-106: the pages state what the code does.** Three statements on
   sportbet's pages are older than its scoring; the new pages say what the
   domain does:
   - the standings deadline: "iki pirmųjų rungtynių pradžios"
     (`partials/rules.blade.php:47`, `help.blade.php:37`) becomes "iki
     {N}-ojo turo pradžios", N the tournament's deadline round
     (`STANDINGS_DEADLINE_ROUND`, `packages/domain/src/round/season.ts:9`;
     sportbet's `config/standings.php:118`);
   - the serija order: "(ID tvarka)" (`rules.blade.php:232`) becomes
     "pagal rungtynių pradžios laiką" (`walkSerija`; sportbet's
     `app/Support/StreakWalker.php:17`, issue 232);
   - the serija tile: `+N−1` (`rules.blade.php:102`) becomes `+(N−1)×5`,
     from `serijaBonus`.
2. **R-107: the prize tie-break sentence stays word for word**
   (`rules.blade.php:72`: "Jei keli dalyviai surenka po lygiai taškų,
   žiūrima į eigos prognozės taškus, po to į daugiausiai tiksliai atspėtų
   rungtynių skaičių."). It is the prize rule the owner applies by hand at
   the season's end; tables keep listing ties by R-18 and R-30.
3. **Stage names (lead decision):** `/rules` and `/help` use R-76's names,
   "Atkrintamosios", "Finalo ketvertas", "Finalas", instead of sportbet's
   "Ketvirtfinalis", "Pusfinalis" and "1/4, 1/2"
   (`config/standings.php:102-103`), so the rules name the stages the
   standings page ticks.
4. **R-108: `/privacy` is sportbet's text with three fixes:** the session
   cookie "galioja 90 dienų ir pratęsiamas kiekvieno apsilankymo metu,
   ištrinamas atsijungus" (R-44; `privacy.blade.php:35`); the IP address
   "matomas tik serverio žurnaluose, prisijungimų įraše nesaugomas" (R-45;
   line 17); "Atnaujinta:" the switch-over month (line 7). The owner sees
   the diff against sportbet's text and approves it before it lands.

## Lead decisions (technical)

- **(slice plan)** The worked examples call the domain's scoring
  functions; nothing on `/rules` is a typed number except sportbet's fixed
  example inputs (30 players and 28/15/10/3/1 choosers; the margin
  examples' offsets from the middle of the score range).
- **(slice plan)** `/support` redirects to `/charity`, `/sponsors` to `/`,
  both permanent (308, `next.config` redirects): no page, no navigation.
- **(slice plan)** The help screenshots are sportbet's
  `public/img/help/euroleague/*.png`, copied as they are until after
  launch; the charity images (`JL_thank.png`, the eleven
  `JL_payment_*.png`) likewise.
- **(slice plan)** The fee panel on `/rules`: slice 12 builds it for the
  dashboard (`feePanel`, R-104). If slice 12 has landed when this slice
  starts, `/rules` shows slice 12's panel for a signed-in player; if not,
  none, and a follow-up issue is opened.
- **One module decides the page.** `rulesPage(rules, tournament)` in
  `packages/domain/src/rules/rules-page.ts` returns every figure and every
  rule-dependent line. The per-area scorers stay internal (`CLAUDE.md`):
  `rulesPage` lives inside the domain package and is the only new export;
  it calls `marginParts` (split out of `scoreMatch`'s `marginAndBingo`),
  `gameOddsHundredths`, `winnerPointsAt`, `serijaBonus` (split out of
  `walkSerija`), `placePoints` and `finalPoints` (split out of
  `scoreStandings`), so a change to any scorer changes the page.
- **The tournament described** is the request's tournament for a player
  (`requestContext`, R-28, R-46), and for a guest the first hub card that
  is not finished, R-50 applied: `findVisitorTournament` in
  `packages/db/src/hub/`, ordered as `loadHub` orders its cards. It
  supplies the team count and the deadline round. With no tournament the
  table-length caption and the deadline round are left out (sportbet
  printed "(1-1)").
- **The entry bounds** come from `PREDICTION_MIN` / `PREDICTION_MAX`, and
  their two sentences from the prediction page's texts module, one copy.
- **Percent shares** in the odds table are integer half-up arithmetic, not
  `Math.round` on a float (`CLAUDE.md`: no float outside the odds formula).
- **Navigation:** the four entries for both audiences, in sportbet's
  blocks; the guest "Jaunimo linija" pill. `privacyHref` then links the
  cookie banner by itself; the hub's and leaderboard's charity card links
  become links.
- **Survival on `/help`** follows `ShellView.nav.survival`, as sportbet's
  `session('survivalGame')`.
- **Metadata:** each page's `<title>` as sportbet's layout gives it.

## Design

### Domain (`packages/domain/src/`)

- `prediction/match-scoring.ts`: `marginParts(call, result)` ->
  `{ marginRule, exactMarginBonus, bingo }`, which `scoreMatch` sums as
  today (margin = rule + exact-margin bonus). Internal.
- `serija/serija.ts`: `serijaBonus(runLength, rate)`, used by
  `walkSerija`. Internal.
- `standings/standings-scoring.ts`: `placePoints(predicted, actual)` and
  `finalPoints(predicted, actual)`, used by `placeLine` / `finalLine`;
  `STANDINGS_STAGES` (label, name, points) for the bracket table. Internal.
- `rules/rules-page.ts`: `rulesPage(rules, { teamCount, deadlineRound })`
  -> `RulesPage`: `tiles` (winner bonus, margin base, bingo, exact margin,
  serija step, rates text), `bounds` (min, max, draws allowed: false),
  `marginExamples` (actual, predicted, miss, points, bonus, exactScore),
  `oddsExamples` (chose, total, share, odds hundredths, winner points),
  `oddsCountRealOnly` (R-2), `serijaExamples` (1, 2, 3, then the N row's
  step), `serijaOrder` (`'tip-off'`, R-106), `placeExamples` (miss 0-7, points, `last`), `placesContinue`,
  `placeStep`, `teamCount`, `stages`, `finalsGrid` (places 1-2),
  `deadlineRound`. Exported.
- `rules/help-page.ts`: `helpPage({ teamCount, deadlineRound, survival })`
  -> stage names, table length, the final's two places, whether a partial
  table is accepted (from the standings save), and the survival flag.

### Database (`packages/db/src/hub/`)

- `findVisitorTournament(db, { viewer, rules, now })` -> the tournament,
  its team count and deadline round, or null. Read through the catalogue;
  parsed with the domain schema before it leaves.

### Web (`apps/web`)

- `app/rules/page.tsx`, `app/help/page.tsx`: load (context or visitor
  tournament, `rulesPage` / `helpPage` with `ruledRules`) and return one
  component. `app/privacy/page.tsx`, `app/charity/page.tsx`: return one
  component.
- `components/rules/rules-view.tsx` (the six cards), `components/help/
  help-view.tsx`, `components/static/privacy-view.tsx`,
  `charity-view.tsx`. Numbers formatted as sportbet's `plain`, `signed`,
  `plainSigned` (whole numbers without `.0`, a real minus sign), through
  the domain's `numberFormat` (`hub/number-format.ts`). Colours only from tokens; `rules-pts-pos` /
  `rules-pts-zero` become sportbet tokens added to `tokens.css` for both
  themes if none fits.
- `public/img/help/euroleague/`, `public/img/charity/`: the copied images.
- `components/shell/nav-entries.ts`: the entries; `next.config.ts`: the
  two redirects.

## Testing

- Domain: `rulesPage` under both sets (`for set of [sportbet, ruled]`):
  every figure equals sportbet's page at 3eb95e7 (read off sportbet's
  running page by qa, recorded in the test), and the two sets differ only
  in `tiles.rates` (R-10) and `oddsCountRealOnly` (R-2) - a test lists
  the differing keys, as `rule-set.test.ts`'s `DIFFERENCES` does. Margin
  examples: 88:79 -> 50 + 50 bingo; 92:83 -> 50 + 20; 85:80 -> 46; 79:88
  -> 32; 60:115 -> −14. Places 190 to 120, continuing; bracket 60 / 120;
  finals 36 27 / 27 30; serija +0, +10, +20. The split scorers keep every
  existing scoring and recalculation test green; a mutation of a scorer
  constant fails a `rulesPage` test.
- Database: `findVisitorTournament` - the player's own, a guest's first
  unfinished visible card, a non-public tournament never a guest's
  (R-50), none.
- Components: each card's rows; the deadline link only for a player; the
  survival block on `/help` only with survival; the R-2 bullet; the charity
  page's eleven proofs and "krepšinio"; the privacy text.
- Feature: the four pages answer 200 to a guest and a player; `/support`
  and `/sponsors` answer 308 to `/charity` and `/`; nav entries all have
  pages (`nav-entries.test.ts`).
- E2E at 390 and 1280: a guest opens "Taisyklės" from the rail and the
  phone menu, sees `×1 / ×2 / ×3`; the cookie banner's link opens
  `/privacy`.

## Done means

On staging a guest and a player open "Taisyklės", "Pagalba", "Jaunimo
linija" and "Privatumas" from the rail and the phone menu; `/rules` shows
sportbet's page with the ruled rates, the R-2 line, R-106's statements,
R-107's sentence and R-76's stage names; every figure on it comes from a
domain call; `/privacy` carries R-108's fixes as the owner approved them;
the cookie banner links to `/privacy`; `/support` and `/sponsors` redirect; #35
is closed with every row of the rulings table above under a named test.
