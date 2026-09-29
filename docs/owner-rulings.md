# Owner rulings

Product rules the owner decided where sportbet's docs and code disagreed or
were silent (the 2026-09-28 audit, `docs/old-app-audit-2026-09-28.md`, and
its basketball re-evaluation). They are the specification for the matching
Phase 2 slices, and override sportbet's CONTEXT.md where the two differ.
Euroleague only for now (decision 11).

**Which apply to the live sportbet app too** (owner, 2026-09-29): the
fairness and safety rulings R-4, R-11, R-13, R-15, R-20, R-24 and R-26 are
also fixed in sportbet now, through its epic tomyka/sportbet#285. Every other
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
leave survival picks undecided.


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
the season early.

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
