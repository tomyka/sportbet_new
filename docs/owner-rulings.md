# Owner rulings

Product rules the owner decided where sportbet's docs and code disagreed or
were silent (the 2026-09-28 audit, `docs/old-app-audit-2026-09-28.md`, and
its basketball re-evaluation). They are the specification for the matching
Phase 2 slices, and override sportbet's CONTEXT.md where the two differ.
Euroleague only for now (decision 11).

**Which apply to the live sportbet app too** (owner, 2026-09-29): the
fairness and safety rulings R-4, R-11, R-13, R-15, R-20, R-24 and R-26 are
also fixed in sportbet now, through its epic tomyka/sportbet#285. R-41 is
applied there too, by sportbet#256 (its round close reversed by sportbet#297),
and R-42 by sportbet#291; production runs both since sportbet 1ac955f
(2026-09-30). R-15 (sportbet#287) and R-38 (sportbet#274) followed in
3eb95e7, production's since 2026-10-05. Every other
ruling is built only in sportbet_new: most change points or need new data,
and sportbet is retired at the switch-over. The parity checker therefore
compares sportbet_new against sportbet's own rules where a ruling differs,
and the switch-over notes list each such difference for players.

## Scoring

**R-1. Filled-in predictions keep their base points but lose the odds
multiplier** (audit Q1, 2026-09-29). A prediction the site fills in for a
player who forgot is scored like a real prediction with the same score, with
its odds counted as 0: a lucky random winner earns the flat 50. The intent:
players are not punished for forgetting occasionally, and it stays a bit luck
based. This is what sportbet's code already does for Euroleague; its
CONTEXT.md ("earns no winner bonus") is wrong. Recorded on
tomyka/sportbet#214.

**R-2. Crowd odds count only real predictions** (B1, 2026-09-29). Filled-in
predictions are not votes: the odds mean how the players who predicted
voted, so the panel players see before tip-off matches what they are paid.
sportbet today counts filled-in predictions after they are generated; that
changes past points, so the fix needs a full recalculation in the old app.

**R-3. The standings crowd bonus compares with every standings player**
(B2, 2026-09-29). "Everyone" in the standings bonus is every player with a
standings prediction in the tournament, not only those who saved something on
that team's row. The bonus must not depend on which rows a player happened to
click; with it the quarter-final bonus pays at all.

**R-42. An exact margin earns +20 and an exact score +50 on top of the margin
points** (catalogue MS-6, 2026-09-29). Margin points stay 50 minus how far the
predicted margin was from the real one. On top: a prediction with the exact
margin but not the exact score earns +20; an exact score earns +50 instead
(the two bonuses do not stack). Example, real result 90-85: predicted 95-90
earns 50 + 20; predicted 90-85 earns 50 + 50; winner points (1 + odds) x 50
as before; every component times the round's rate. In basketball an exact
margin or score is hard to hit, so both deserve a bonus. This is how the game
was always meant to work: sportbet's config (bingo 20, no margin bonus) was
wrong, and the old app was fixed (tomyka/sportbet#291, in production since
2026-09-30 and recalculated), so both rule sets carry this rule. The +20 is
stored in the margin (difference) points; bingo stays the exact score's.


## Survival

**R-4. A survival pick locks when its team's game tips off** (B3,
2026-09-29). Once the game of the team a player picked for a round has
started, that round's pick cannot change - not even to a team that has not
played yet. Together with tomyka/sportbet#256 (no pick of a team whose game
has started), no survival pick can be made or moved after the facts are
known.

**R-11. A survival team is used once per run; the list resets after all 20**
(B10, 2026-09-29). Picking a team already used in the current run is
refused. Once a player has used every team, the used list resets and all
teams are available again, so a run can last the whole regular season.

**R-12. A survival pick on a postponed game waits for that game** (B11,
2026-09-29). If the picked team's game is moved out of its round, the pick
stays and is decided whenever the game is played. The player keeps picking
for later rounds meanwhile (R-6); if the postponed game is then lost, the run
ends at that point.

**R-33. Skipping a survival round is harmless** (catalogue Q2,
2026-09-29). A round with no pick neither ends nor breaks the run; the next
winning pick continues the running total (Zalgiris home 10 in round 3, no pick
in round 4, Olympiacos away in round 5 stores 22). Skipping is a deliberate
strategy: on a long run it can be better to wait for a safer pick than to
risk ending it.

**R-34. A survival run is counted in round order, even with a postponed
pick** (catalogue Q3, 2026-09-29). When a picked game is postponed (R-12),
the run is still read in round order. Example: Baskonia away picked in round
8 and moved to December; Monaco home (round 9) and Fenerbahce away (round 10)
won meanwhile. A December Baskonia win makes rounds 8-10 read 12, 22, 34 and
shifts the later totals up; a December loss ends the run at round 8, so
rounds 9 onwards form a new run from round 9, which simply continues. Totals
of rounds after a pending pick are therefore provisional until it is decided,
and are recomputed then.

**R-41. A postponed game is its own state; a round's survival pick closes at
the round's first tip-off** (review, 2026-09-29). sportbet marks a postponed
game by entering -1 as its result so the round can close; the rebuild has an
explicit postponed state instead and never needs a fake result. The round
moves on by itself (R-6) and a pick on the postponed game waits for it
(R-12). Negative scores are refused, like level ones (R-38). Production held
no -1 results on 2026-09-29.

*Changed 2026-10-02 (owner, sportbet#297), followed by sportbet_new on
2026-10-06 (#17):* the round no longer closes at its first tip-off. A survival
team stays open until its own game starts (R-4 locks the pick once its team's
game has started), in both rule sets.




## Results entry

**R-5. Correcting a result replays the game as if the mistake never
happened** (B4, 2026-09-29). Everything a wrong result caused is undone:
survival knock-outs are restored, and filled-in predictions that were
generated only because of the mistaken entry are removed. This requires
survival picks to be kept as history rather than wiped when a run ends - a
pick is never deleted to record a loss.

**R-38. A level result is refused for a Euroleague game** (catalogue Q7,
2026-09-29). Basketball cannot end level, so the admin cannot save a tied
score for a Euroleague game; a typo like 81-81 cannot break every serija or
leave survival picks undecided. The owner confirmed (2026-09-29, catalogue
MS-10) that the old app must refuse it too (tomyka/sportbet#274); production
held no level Euroleague result, so once that lands the sportbet rule set
refuses it as well.


## Rounds

**R-6. The current round is the one whose next game starts soonest** (B5,
2026-09-29). Among rounds with unplayed games, the current round is the one
whose next game tips off soonest - what players need to do next. A postponed
or late-entered game does not hold the site on its old round; it stays
reachable in its own round. This applies everywhere "current round" is used:
the predictions page, reminder badges, survival picks and the admin's results
page.

**R-13. A moved game reopens only if it had not yet locked** (B12,
2026-09-29). When a game's date moves later, predictions reopen only if its
original tip-off had not passed. A game that had already locked stays locked
with the predictions made, so nobody can change a prediction after seeing
the league's.

**R-40. With no game left to come, the current round is the last round
played** (plan review, 2026-09-29). After the final, or between round 38 and
the post-season being added, the site stays on the most recent round so its
results and summary stay on screen until new games exist.


## Players

**R-7. A player is switched off after 20 missed games in a season** (B6,
2026-09-29). A missed game is one the site had to fill in for them. The count
is per tournament, starting from zero in each. A switched-off player is
hidden from league tables (their points are never changed). Saving a real
prediction switches them back on and resets that tournament's count to zero,
so they are switched off again only after another 20 misses.

**R-8. Euroleague registration stays open until round 5** (B7, 2026-09-29).
Registration for a Euroleague season closes at the standings deadline, when
round 5 starts - which is what that deadline exists for. What a late joiner
gets for games already played is R-9.

**R-9. A late joiner gets filled-in predictions for games already played**
(B8, 2026-09-29). When a player joins after games have been played, each of
those games gets a filled-in prediction scored under R-1 (base points, no
odds multiplier). These fill-ins do not count toward being switched off
(R-7) and are not crowd votes (R-2), so no other player's points change.

**R-19. An admin hide is separate from being switched off** (B18,
2026-09-29). A player an admin hides stays hidden until an admin undoes it;
saving a prediction does not bring them back. The automatic switch-off for
missed games (R-7) is a separate state with its own rule.

**R-32. A switched-off player gets no filled-in predictions** (catalogue
Q1, 2026-09-29). While a player is switched off (R-7), the site does not fill
in their missed games; those games earn nothing, and their total stays frozen
until they come back.

**R-39. An admin-hidden player still gets filled-in predictions** (plan
review, 2026-09-29). Hiding (R-19) only removes a player from tables; their
game goes on as usual, fill-ins included, so nothing is lost if they are
un-hidden. Only a switched-off player (R-32) gets none.



## Post-season

**R-10. Every Euroleague post-season game is predicted, at rising rates**
(B9, 2026-09-29). The play-in, every play-off game and the Final Four are
predicted like regular-season games. A game is added only once its teams and
date are confirmed, so a series' game 4 or 5 exists only if the series needs
it (an unplayed game must never hold the site on a round or keep the
tournament from finishing). Rates: play-in 1, play-offs 2, Final Four (both
semi-finals and the third-place game) 3, final 3. Survival is regular season
only: it ends after round 38.

## Standings

**R-14. Euroleague standings are scored once, after round 38** (B13,
2026-09-29). The final regular-season table is entered once, after round 38;
play-off and Final Four ticks are entered as each stage is decided. Points
are paid once and never taken back (190 for the exact place, 10 fewer per
place off; no crowd bonus on positions, see R-35).

**R-43. The standings table is final only when the admin marks it final**
(Phase 2.2 plan, 2026-09-30). After round 38 the admin enters the final
regular-season places and confirms that the table is final; only then are
table positions scored (R-14). A half-entered table is never scored, and a
loaded production copy counts as not final until the admin marks it.

**R-44. A sign-in lasts 90 days, and every visit extends it** (slice 4b
brainstorm, 2026-10-05). sportbet remembers every sign-in with Laravel's
default, about 400 days. The new app keeps a player signed in for 90 days
from their last visit: a player who comes back within 90 days never signs in
again; one away longer signs in again with a code. Not a scoring rule, so it
is not a `RuleSet` field.

**R-45. A sign-in is recorded without the IP address** (slice 4b review,
2026-10-05). sportbet stores the IP address with every sign-in and every
mailed code, and its admin audit page shows it. The new app records who
signed in, how and when, and no IP address, so it keeps less personal data;
the admin audit page (slices 13-14) shows sign-ins without one.

**R-46. With no usable last-used tournament, a player opens the newest one**
(slice 4b plan, 2026-10-05). A player in several tournaments whose last-used
one is unset or no longer theirs opens the tournament they are in with the
highest id (the newest). sportbet takes whichever active membership MySQL
returns first, with no order, in practice the one joined first; that is not
a rule, so this is not a `RuleSet` field.

**R-47. Signing out ends this device only** (slice 4b plan, 2026-10-05).
"Atsijungti" ends the session in this browser; the player stays signed in on
their other devices. sportbet's sign-out also rotates the remember token, so
other devices drop out within about two hours.

**R-48. Among open tournaments, a sign-up joins the one with a next game,
then the newest** (slice 4c plan, 2026-10-05). R-27 picks the open tournament
whose next game is soonest. A tournament with a next game beats one without;
with no next game anywhere, or two at the same moment, the newest (highest
id) wins. sportbet joins the newest active tournament by creation date, with
no look at games.

**R-49. Sign-up follows sportbet's window exactly** (slice 4c plan,
2026-10-05). On a site with no tournaments and no games, a visitor may sign
up and the account joins no tournament. Once tournaments exist, sign-up is
open only while one of them is open for registration (R-8); otherwise the
"Registruotis" tab is hidden and `/register` goes home. This is sportbet's
`ChecksRegistrationDeadline`, kept as it is.

**R-50. A non-public tournament is shown only to its members and admins**
(slice 5 brainstorm, 2026-10-06). sportbet's hub lists every tournament and
never reads `is_public`. The new app leaves a non-public tournament off the
front page for everyone but its players and admins, and its page answers
"not found" to anyone else. Sign-up never joins one either, neither by R-27
nor through a `?tournament=` link (owner, plan review, 2026-10-06). A
`RuleSet` field: `sportbetRules` lists and joins every tournament, as
sportbet does.

**R-51. Game times are shown in Vilnius time, in Lithuanian** (slice 5
brainstorm, 2026-10-06). sportbet's hub shows upcoming games in UTC with
English months ("Oct 06, 18:00"). The new app shows Europe/Vilnius time,
written in Lithuanian ("spalio 6 d., 21:00").

**R-52. The front page speaks of basketball** (slice 5 brainstorm,
2026-10-06). sportbet's charity card says "futbolo prognozių žaidimas" and
"Kaip tai veikia?" speaks of "įvarčių skirtumą". The new app says
"krepšinio prognozių žaidimas" and "taškų skirtumą"; every other text, and
the 7 500€, is sportbet's.

**R-53. A member opening a tournament's registration form is taken into
it** (slice 5 brainstorm, 2026-10-06). sportbet means to do this but
redirects to a POST-only route, which answers 405. The new app takes them
into the tournament, as "Žaisti →" does, before and after registration
closes.

**R-54. The registration form shows when registration closes** (slice 5
brainstorm, 2026-10-06). sportbet's form says "Registracija galima tik iki
pirmųjų turnyro rungtynių pradžios.", which R-8 makes wrong. The new app
says "Registracija galima iki {date, time}." with the closing moment under
the rule set, in Vilnius time (R-51).

**R-55. The hub's "Pasibaigę" group follows R-21** (slice 5 brainstorm,
2026-10-06). sportbet's hub groups a tournament as finished when an admin
marks it finished, when every game entered so far is scored, or when its end
date has passed. The new app groups it as finished only when R-21 does; the
admin's status and start date still decide between "Artėjantys" and
"Vykstantys", as sportbet does. A `RuleSet` field: `sportbetRules` keeps
sportbet's grouping.

**R-56. The sport is named in Lithuanian** (slice 5 plan review,
2026-10-06). sportbet shows a tournament's sport as typed, in English
("Basketball"). The new app shows "Krepšinis" for basketball and "Futbolas"
for football, and any other value as typed.


**R-35. Euroleague table positions get no crowd bonus; stage ticks do**
(catalogue Q4, 2026-09-29). A standings position earns flat points - 190 for
the exact place, 10 fewer per place off - with no crowd bonus, not even for an
exact place: with 20 teams, whether players said 16th or 17th is close to
noise, and rewarding the crowd on it is unfair. The stage ticks (play-offs,
Final Four, champion) keep their crowd bonus, counted against every standings
player (R-3). sportbet today multiplies an exact place by the bonus; the
sportbet rule set keeps that for parity.

**R-36. "Every standings player" means everyone who saved anything on the
standings page** (catalogue Q5, 2026-09-29). For the stage-tick crowd bonus
(R-3, R-35), the count is every player in the tournament who saved anything on
the standings page, complete table or not. Players who never opened it do not
count. Example: 28 of 30 saved something, 6 ticked Zalgiris for the Final Four
and Zalgiris got there: each correct tick pays 386.7.

**R-37. Correcting a standings fact recalculates the points** (catalogue Q6,
2026-09-29). When an admin corrects a wrongly entered place or tick, every
player's standings points follow the corrected facts, as a corrected match
result does (R-5). "Never taken back" in R-14 means only that a correctly
paid tick is not removed as the post-season goes on.




**R-16. Standings points recalculate automatically** (B15, 2026-09-29).
Saving team places or play-off ticks updates every player's standings points
at once, and "recalculate all" includes them. There is no separate button to
remember.

**R-31. Standings points keep four decimals** (B30, 2026-09-29). Standings
points are stored with four decimals, shown with one, and ranked to the cent -
exactly what sportbet stores today, so the parity checker can match it. Match
points need no rounding in Euroleague (always whole or half points).


## Predictions

**R-15. A half-typed prediction is refused** (B14, 2026-09-29; the owner
first chose "treat as missing" and corrected it the same day). A prediction
with only one score entered is not saved; the page tells the player to enter
both scores. Nothing half-filled is ever stored, so a game the player left
half-typed is simply missed at tip-off: both scores are filled in under R-1,
and it counts toward R-7.

## Tables and charts

**R-17. The rank history counts points from when they were earned** (B16,
2026-09-29). Standings and survival points appear on the rank history chart
at the game where they were earned, never spread back over earlier games, so
past history does not change after the fact.

**R-18. Every page ranks players by one total** (B17, 2026-09-29). The
league table, Lyderiai, the hub's top 5 and the welcome panel all rank by
the same total: match + serija + standings + survival points.

**R-30. Tied players are listed in Lithuanian alphabetical order** (B29,
2026-09-29). When players tie on points, every page lists them in Lithuanian
alphabetical order ("Š" after "S"), so a tie looks the same everywhere.

## Leagues

**R-20. League invites go only to players already in the tournament** (B19,
2026-09-29). A private league's invite can be sent only to a player who is
registered for that league's tournament. Nobody can end up a league member of
a tournament they have not joined.

**R-23. A league owner can hand the league to another member** (B22,
2026-09-29). The owner can make any member of the league its owner; after
handing over, the former owner may leave like anyone else.

**R-29. "You cannot leave your only league" is per tournament** (B28,
2026-09-29). A player always keeps at least one league - their public league -
in each tournament they play; they cannot leave a tournament's last league
because they are in a league elsewhere.

## Tournaments

**R-21. A tournament is finished when its end date has passed and every game
is scored** (B20, 2026-09-29). Scoring every game entered so far is not
enough, so the gap between round 38 and the post-season (R-10) does not end
the season early. A tournament with no end date is not finished: a
Euroleague season's end depends on its playoffs, so it stays open, and is
recalculated, until an admin sets the date (owner, 2026-10-01). sportbet also
finishes one when every game entered so far is scored or an admin marks it
finished; neither finishes it here.

**R-22. Finished tournaments are frozen** (B21, 2026-09-29). A recalculation
only touches tournaments that are not finished (R-21). A finished season's
points and final table never change, even when a scoring rule changes later.

## Accounts

**R-24. An email change is confirmed by a code sent to the new address**
(B23, 2026-09-29). The new address takes effect only once the code sent to
it is entered, and the old address receives a notice of the change. A typo or
someone else's browser can no longer lock the owner out.

**R-25. Deleting an account erases its trail and hands its leagues on**
(B24, 2026-09-29). The account's audit trail (prediction changes, sign-in
records) is erased with it. Each league it owned passes to that league's
longest-standing member, so every league keeps an owner. The player's own
points go with the account.

**R-27. A front-page sign-up joins the soonest open tournament** (B26,
2026-09-29). A player who signs up without choosing a tournament (and without
one in their sign-in link) joins the tournament still open for registration
(R-8) whose next game is soonest. If none is open, they join none and choose
on the hub.

**R-28. After sign-in a player sees the tournament they used last** (B27,
2026-09-29). A player in more than one tournament opens the one they were in
last time, and can switch on the hub. "Last used" is stored with the player,
not in the session (decision 5: the session holds only who the player is).

## Administration

**R-26. Three admin tiers, no self-promotion** (B25, 2026-09-29).
- **Editor:** enters results only.
- **Admin:** also manages games, rounds and teams.
- **Top admin:** also manages users and runs recalculations.

Nobody can raise their own tier. Only a top admin may edit a game that has
already started, so an admin who also plays cannot reopen their own
prediction.
