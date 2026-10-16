# Slice 18: rules, help and static pages

A17 and A23 of `docs/phase-2-inventory.md` (#35): `/rules`, `/help`,
`/privacy` and `/charity`, with `/support` and `/sponsors` (section 4, C12
and C13) answered by redirects. Euroleague only (decision 11).

Binding: decisions 5, 6, 11 and 13; R-100, and every ruling that changes a
number or a statement on these pages (listed below), with R-106 to
R-108 and R-128; the rules in
`CLAUDE.md` (the domain decides, pages only load, tokens, Lithuanian text in
components, a navigation entry only with its page).

*Refreshed 2026-10-16 against main (slices 12 to 17 landed) and R-1 to
R-132: the corrections are listed in the plan's "What changed since the plan
of 2026-10-13", and the questions the owner still has to answer are Q1-Q11
at the end of this spec.*

## The reference

sportbet at **3eb95e7**, with the parity oracle now **1618164** (2026-10-15):
the four views below are unchanged between the two; `config/points.php`
(streak step 5, 2871bb3), `config/standings.php` (`deadline_at_round_end`,
a4618c6) and the fee panel (5aa8465, 42f0e51) are what moved. `routes/web.php` (78-83),
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
     `+N−1` serija (line 102, a literal; the table below it reads the
     step, `+(N−1)×5` since 2871bb3), `×1 / ×2` stage rate (line 106,
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
  survival only when `session('survivalGame') == 1`, the tournament's
  `survival_game`, so never for a guest), each with its screenshot from
  `public/img/help/euroleague/` (dark-theme crops of fixtures, a ladder and
  survival cards; no player on them); **Suvestinė** (the four summaries,
  survival's bullet whenever `survivalGame != 0`, so for a guest too);
  **Informacija** (the four static pages). The stage names and the table
  length come from `StandingsFormat`. For the Euroleague (`enforce` true) its
  standings paragraph says the table must be filled in whole and an
  incomplete one is not accepted, which sportbet's own save contradicts
  (it refuses only conflicting rows; Q5).
- **`/privacy`** and **`/charity`** are static views. `/charity` has the
  hero (7 500€, 8+, 2018), the thank-you image, the TransUnion paragraph
  and eleven payment proofs (`public/img/JL_*.png`).
- **`/support`** and **`/sponsors`** are static views nobody links to.
- **The tournament** a page describes is `Tournament::forVisitor`: the
  session's, or for a guest (or a player with none) the first hub card that
  is not finished.
- **Navigation:** the player rail lists "Taisyklės", "Pagalba", "Jaunimo
  linija", "Privatumas" after "Lygos"; the guest rail lists "Taisyklės" in
  its first block and the other three after the separator; the phone menu's
  "Informacija" lists all four, **for a signed-in player only** (the panel is
  `@auth`; a guest's phone bar has the brand and the pills "Lyderiai",
  "Jaunimo linija" and "Prisijungti", no menu); the guest header has a
  "Jaunimo linija" pill. The cookie banner links to `/privacy`. Other links
  to these pages: the registration form's "Taisyklės" (`register.blade.php:43`),
  the hub's charity text (inline "Jaunimo linijai" and "Sužinoti daugiau") and
  the leaderboard's "more" line.

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
| R-76 (lead decision, **reopened, answered: R-133 Q2**) | bracket "Ketvirtfinalis", "Pusfinalis"; prose "1/4, 1/2" | R-76's names plus the marks (R-133): "Atkrintamosios (1/4)", "Finalo ketvertas (1/2)", "Finalas (F)"; R-76's names alone were chosen so the rules name what the standings page ticks, but that page, its ladder and the help screenshot say "1/4", "1/2", "F" |
| R-106, R-128 | deadline "iki pirmųjų rungtynių", serija "(ID tvarka)", tile `+N−1` | what the domain does (below); the deadline is the last result of the tournament's deadline round, as the standings page says it, shown with the round even before it has a game (R-133 Q1) |
| R-106 (Q5) | help: "Lentelę reikia užpildyti visą: nepilna prognozė nepriimama." | what the save does: a short table is accepted (R-133 Q5) |
| R-107 | the prize tie-break sentence | kept word for word |
| R-44, R-45, R-108 | `/privacy`: the session cookie ends with the browser; IP in logs | the three fixes below, approved by the owner as a diff (Q9) |
| R-123, R-124, R-104 | the fee panel on `/rules` | slice 12's `feePanel` through `FeePanel`: one amount format, a league guest sees no money, only the reward |
| R-8, R-54, R-128 | the registration form's closing sentence | not on these pages: sportbet's `/rules` and `/help` never state when registration closes |
| R-125, R-126, R-129, R-97, R-98, R-111, R-114, R-130 to R-132 | - | nothing on sportbet's `/rules` or `/help` states them (admin, import, reminders, profile and deletion); unchanged. `/privacy` is the owner's call (Q9) |
| R-7, R-32, R-57 | "Neperdavus laiku rezultato, spėjimas bus sugeneruotas automatiškai" | a bullet states it (R-133 Q4) |
| R-35, R-3, R-36 (stage ticks) | the bracket table names 60 and 120 and no crowd bonus | left as sportbet's, no caption (R-133 Q8) |

Every other ruling leaves these pages as sportbet has them.

## Settled questions (2026-10-13)

The spec's four open questions, settled on the recommended option. Item 3
is reopened by the refresh of 2026-10-16 (R-133 Q2: names plus marks); the wording of 1 is confirmed by R-133 Q1 (the owner may still
reword it in review).

1. **R-106: the pages state what the code does.** Three statements on
   sportbet's pages are older than its scoring; the new pages say what the
   domain does:
   - the standings deadline: "iki pirmųjų rungtynių pradžios"
     (`partials/rules.blade.php:47`, `help.blade.php:37`) says that the
     standings close when the last result of the tournament's deadline round
     {N} is entered (`STANDINGS_DEADLINE_ROUND`,
     `packages/domain/src/round/season.ts`; sportbet's
     `config/standings.php:118`, `deadline_at_round_end`, sportbet
     a4618c6, #39; R-128): "iki bus įvesti paskutinių {N}-ojo turo
     rungtynių rezultatai", the new app's wording, for the owner to confirm
     (Q1); the standings page already says it with no date (R-80, R-128);
   - the serija order: "(ID tvarka)" (`rules.blade.php:232`) becomes
     "pagal rungtynių pradžios laiką" (`walkSerija`; sportbet's
     `app/Support/StreakWalker.php:17`, issue 232);
   - the serija tile: `+N−1` (`rules.blade.php:102`) becomes `+(N−1)×5`,
     from `serijaBonus` (`SERIJA_STEP = 5`; the owner halved it from 10 in
     sportbet 2871bb3, R-106).
2. **R-107: the prize tie-break sentence stays word for word**
   (`rules.blade.php:72`: "Jei keli dalyviai surenka po lygiai taškų,
   žiūrima į eigos prognozės taškus, po to į daugiausiai tiksliai atspėtų
   rungtynių skaičių."). It is the prize rule the owner applies by hand at
   the season's end; tables keep listing ties by R-18 and R-30.
3. **Stage names (lead decision, reopened 2026-10-16, answered by R-133 Q2):** `/rules` and
   `/help` use R-76's names, "Atkrintamosios", "Finalo ketvertas",
   "Finalas", instead of sportbet's "Ketvirtfinalis", "Pusfinalis" and
   "1/4, 1/2" (`config/standings.php:102-103`), so the rules name the stages
   the standings page ticks. *The premise does not hold on main:* the
   standings page (`standings-view.tsx` legend, `ladder.tsx` headers,
   `server/standings/texts.ts`) and the help screenshot say "1/4", "1/2" and
   "F"; R-76's names appear only in the points popovers and the standings
   summary (`EUROLEAGUE_STAGE_NAMES`).
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
- **(slice plan)** The fee panel on `/rules`: slice 12 has landed
  (`feePanel`, R-104, R-123, R-124; `loadDashboardLeague`, the `FeePanel`
  component). `/rules` shows its panel (not the league messages, which
  sportbet's fee partial does not carry on this page) for a signed-in
  player with a league in the tournament; a guest sees none.
- **One module decides the page.** `rulesPage(rules, tournament)` in
  `packages/domain/src/rules/rules-page.ts` returns every figure and every
  rule-dependent line. The per-area scorers stay internal (`CLAUDE.md`):
  `rulesPage` lives inside the domain package and is the only new export;
  it calls `marginParts` (split out of `scoreMatch`'s `marginAndBingo`),
  `gameOddsHundredths`, `winnerPointsAt`, `serijaBonus` (split out of
  `walkSerija`), `placePoints` and `finalPoints` (split out of
  `scoreStandings`), so a change to any scorer changes the page.
- **The tournament described** is the request's tournament for a player
  (`requestContext`, R-28, R-46), and for a guest (or a player with none)
  the first hub card that is not finished, R-50 applied:
  `findVisitorTournament` in `packages/db/src/hub/`, ordered as `loadHub`
  orders its cards. Either tournament's facts come from one read,
  `loadTournamentFacts`: the team count, the deadline round (the
  tournament's own, else `STANDINGS_DEADLINE_ROUND`), whether the standings
  close (`Season.standingsCloses`: `never` when no game is in the deadline
  round) and the tournament's `survival` switch. With no tournament the
  table-length caption and the deadline round are left out (sportbet
  printed "(1-1)").
- **The entry bounds** come from `PREDICTION_MIN` / `PREDICTION_MAX`, and
  their two sentences from the prediction page's texts module, one copy.
- **Percent shares** in the odds table are integer half-up arithmetic, not
  `Math.round` on a float (`CLAUDE.md`: no float outside the odds formula).
- **Navigation:** the four entries for both audiences, in sportbet's
  blocks (the `info` group, the rail's last block and the player's menu
  "Informacija" already exist; a guest's "Taisyklės" is in `main`); the
  guest "Jaunimo linija" pill. `privacyHref` then links the cookie banner by
  itself; the hub's charity text (inline and "more") and the leaderboard's
  "more" line become links, and the registration form's "Taisyklės" a link
  to `/rules`. A guest on a phone has no menu, as in sportbet (Q10).
- **Survival on `/help`** follows the tournament's `survival` switch
  (sportbet's `session('survivalGame')` is `tournaments.survival_game`), not
  `ShellView.nav.survival`, which is the round-dependent
  `NavVisibility::showSurvival` and would drop the block after round 38.
  Block and summary line both, for a guest as for a player (Q7).
- **Metadata:** no page of this app sets its own `<title>` (the layout's
  `SportBet`); these four do not either.
- **Wording:** every sentence a ruling or an open question touches is one
  entry in the page's texts module, so an owner's answer is a one-line change.

## Design

### Domain (`packages/domain/src/`)

- `prediction/match-scoring.ts`: `marginParts(call, result)` ->
  `{ marginRule, exactMarginBonus, bingo }`, which `scoreMatch` sums as
  today (margin = rule + exact-margin bonus). Internal.
- `serija/serija.ts`: `serijaBonus(runLength, rate)`, used by
  `walkSerija`. Internal.
- `standings/standings-scoring.ts`: `placePoints(predicted, actual)` and
  `finalPoints(predicted, actual)`, used by `placeLine` / `finalLine`.
  Internal. The bracket table is built from `STANDINGS_POINTS`,
  `STANDINGS_COUNTS` and `EUROLEAGUE_STAGE_NAMES` (exported from
  `summary/standings-summary.ts`); no second table of stage names.
- `rules/rules-page.ts`: `rulesPage(rules, { teamCount, deadlineRound, standingsCloses })`
  -> `RulesPage`: `tiles` (winner bonus, margin base, bingo, exact margin,
  serija step 5, rates text), `bounds` (min, max, draws allowed: false),
  `marginExamples` (actual, predicted, miss, points, bonus, exactScore),
  `oddsExamples` (chose, total, share, odds hundredths, winner points),
  `oddsCountRealOnly` (R-2), `serijaExamples` (1, 2, 3, then the N row's
  step), `serijaOrder` (`'tip-off'`, R-106), `placeExamples` (miss 0-7, points, `last`), `placesContinue`,
  `placeStep`, `teamCount`, `bracket` (stage, points, count), `finalsGrid`
  (places 1-2), `deadlineRound` and its closing state (R-106, R-128).
  Exported.
- `rules/help-page.ts`: `helpPage({ teamCount, deadlineRound, standingsCloses, survival })`
  -> the table length, the deadline round and its state, the final's two
  places, whether a partial table is accepted (from the standings save: it
  is), and the tournament's survival flag.

### Database (`packages/db/src/hub/`)

- `loadTournamentFacts(db, tournament)` -> `{ teamCount, deadlineRound,
  standingsCloses, survival }`, from the team list, the tournament's
  deadline round (else `STANDINGS_DEADLINE_ROUND`) and its loaded `Season`.
- `findVisitorTournament(db, { viewer, rules, now })` -> the tournament and
  its facts, or null. Read through the catalogue and `loadHub`'s ordering;
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
  `rules-pts-zero` (sportbet: accent on `--sb-accent-tint`, bold; muted)
  need no new token: `bg-accent-tint text-accent` and `text-muted` exist.
- `public/img/help/euroleague/`, `public/img/charity/`: the copied images.
- `components/shell/nav-entries.ts`: the entries; `next.config.ts`: the
  two redirects.

## Testing

- Domain: `rulesPage` under both sets (`for set of [sportbet, ruled]`):
  every figure equals sportbet's page at 1618164 (read off sportbet's
  running page by qa, recorded in the test), and the two sets differ only
  in `tiles.rates` (R-10) and `oddsCountRealOnly` (R-2) - a test lists
  the differing keys, as `rule-set.test.ts`'s `DIFFERENCES` does. Margin
  examples: 88:79 -> 50 + 50 bingo; 92:83 -> 50 + 20; 85:80 -> 46; 79:88
  -> 32; 60:115 -> −14. Places 190 to 120, continuing; bracket 60 / 120;
  finals 36 27 / 27 30; serija +0, +5, +10. The split scorers keep every
  existing scoring and recalculation test green; a mutation of a scorer
  constant fails a `rulesPage` test.
- Database: `loadTournamentFacts` (team count, deadline round, closing
  state incl. `never`, survival) and `findVisitorTournament` - a guest's
  first unfinished visible card, a non-public tournament never a guest's
  (R-50), none.
- Components: each card's rows; the deadline link only for a player; the
  survival block and summary line on `/help` only for a tournament with
  survival, guest included; the R-2 bullet; the fee panel on `/rules` only
  for a player with a panel; the charity page's eleven proofs and
  "krepšinio"; the privacy text; the charity card's links; the form's
  "Taisyklės" link.
- Feature: the four pages answer 200 to a guest and a player; `/support`
  and `/sponsors` answer 308 to `/charity` and `/`; nav entries all have
  pages (`nav-entries.test.ts`).
- E2E at 1280: a guest opens "Taisyklės" from the rail and sees
  `×1 / ×2 / ×3`; the cookie banner's link opens `/privacy`. At 390: a
  player opens "Taisyklės" from the phone menu's "Informacija"; a guest has
  the "Jaunimo linija" pill (no menu, as in sportbet, Q10).

## Done means

On staging a player opens "Taisyklės", "Pagalba", "Jaunimo linija" and
"Privatumas" from the rail and the phone menu, and a guest from the rail
(and, on a phone, "Jaunimo linija" from its pill); `/rules` shows
sportbet's page with the ruled rates, the R-2 line, R-106's statements
(serija step 5, tip-off order, the deadline as the standings page says it),
R-107's sentence and the stage names with marks (R-133); every figure on it comes
from a domain call; `/privacy` carries R-108's fixes as the owner approved
them; the cookie banner links to `/privacy`; `/support` and `/sponsors`
redirect; #35 is closed with every row of the rulings table above under a
named test.

## Privacy approval (R-108, 2026-10-16)

The owner approved the diff of `/privacy` on 2026-10-16: exactly the three
fixes (the month, the IP sentence, the session cookie), nothing else. Q11 is
answered: "Atnaujinta: 2026 m. spalio mėn.", one constant
(`PRIVACY_UPDATED`, `components/static/privacy-view.tsx`). Q9's list of
statements that may be incomplete stays as the owner left it: not changed.
The page, the "Privatumas" entries (rail and menu for a player, rail for a
guest), the cookie banner's link and the help list's line are built.

## Owner answers (R-133, 2026-10-16) and what is still open

The planner's Q1 to Q8 and Q10 are answered and recorded as R-133 in
`docs/owner-rulings.md`; Q9 and Q11 stay open and gate only `/privacy`.

- **Q1 (answered).** The deadline sentence is always shown with the
  tournament's deadline round, even before that round has a game
  (`/rules`: "Turnyro eigos prognozė turi būti pateikta iki bus įvesti
  paskutinių {N}-ojo turo rungtynių rezultatai."; `/help`: "Kol neįvesti
  paskutinių {N}-ojo turo rungtynių rezultatai, reikia numatyti ..."). The
  clause is left out only when there is no tournament at all.
- **Q2 (answered).** R-76's names plus the marks: "Atkrintamosios (1/4)",
  "Finalo ketvertas (1/2)", "Finalas (F)" in the bracket table, and the
  prose in declined forms with the marks.
- **Q3 (answered, yes).** The R-2 bullet: "Koeficientas skaičiuojamas tik
  pagal tikrus spėjimus - automatiškai sugeneruoti spėjimai į jį
  neįskaičiuojami." (shown under `ruledRules` only).
- **Q4 (answered).** A bullet on `/rules` says a player switched off after 20
  missed games gets no generated predictions (R-7, R-32); proposed text,
  which the owner may reword: "Praleidus 20 rungtynių per turnyrą, žaidėjas
  paslepiamas lentelėse ir spėjimai už jį nebegeneruojami, kol jis vėl
  išsaugo spėjimą."
- **Q5 (answered).** Help: "Lentelę galima pildyti dalimis - nepilna
  prognozė taip pat išsaugoma."
- **Q6 (answered).** "arba kol panaudotos visos komandos" is added to the
  survival sentence on `/help` and on the survival page (slice 10's
  `survival-rules.tsx`, whose test pins the old sentence: that page and test
  change in this slice, web-dev).
- **Q7 (answered).** The survival block and the summary line on `/help`
  follow the tournament's survival switch for every visitor, guests included.
- **Q8 (answered).** The stage-tick table stays as sportbet's, no caption.
- **Q10 (answered).** A guest's phone has no menu, as in sportbet; no rules,
  help or privacy entries for a guest on a phone.
- **Q9 (open, gates `/privacy`).** The R-108 diff of the three fixes goes to
  the owner as Task 7 produces it. Statements the new app may make untrue or
  incomplete outside the three, for the owner to keep or fix in the same
  diff: (1) "Paskyros duomenys" lists only e-mail and user name, the app also
  holds first name, surname and join date (R-114); (2) league payment details
  and amounts paid are held (R-103) and not listed; (3) the cookie list names
  only the session cookie and AdSense, the app also sets short-lived signed
  cookies for sign-in, registration, flash messages and the return page; (4)
  "Techniniai žurnalai saugomi ne ilgiau nei 90 dienų": the Oracle host
  rotates Docker logs by size (10 MB x 3), not by age; (5) sign-in records
  (who, how, when; no IP, R-45) are kept without a stated period; (6) the
  mail provider (Resend) is not named; (7) the page lists no deletion route
  although the profile has one (R-130, R-131). Options: (a) only R-108's
  three fixes; (b) the three plus the owner's choices among 1-7.
- **Q11 (open, gates `/privacy`).** The "Atnaujinta:" month: (a) the planned
  switch-over month as one constant; (b) the month of approval; (c) sportbet's
  "2026 m. birželio mėn." until switch-over.

Settled without asking: `/support` to `/charity` and `/sponsors` to `/`
(planning session of 2026-10-09; C12 and C13), the help screenshots and
charity images copied as they are (the three screenshots and one receipt were
viewed on 2026-10-16: team names and an order number only; the other ten
receipts are checked before the commit), the fee panel on `/rules` (slice
12's), registration closing (R-128, not on these pages).
