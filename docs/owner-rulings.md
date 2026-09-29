# Owner rulings

Product rules the owner decided where sportbet's docs and code disagreed or
were silent (the 2026-09-28 audit, `docs/old-app-audit-2026-09-28.md`, and
its basketball re-evaluation). They are the specification for the matching
Phase 2 slices, and override sportbet's CONTEXT.md where the two differ.
Euroleague only for now (decision 11).

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

## Results entry

**R-5. Correcting a result replays the game as if the mistake never
happened** (B4, 2026-09-29). Everything a wrong result caused is undone:
survival knock-outs are restored, and filled-in predictions that were
generated only because of the mistaken entry are removed. This requires
survival picks to be kept as history rather than wiped when a run ends - a
pick is never deleted to record a loss.

## Rounds

**R-6. The current round is the one whose next game starts soonest** (B5,
2026-09-29). Among rounds with unplayed games, the current round is the one
whose next game tips off soonest - what players need to do next. A postponed
or late-entered game does not hold the site on its old round; it stays
reachable in its own round. This applies everywhere "current round" is used:
the predictions page, reminder badges, survival picks and the admin's results
page.

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

## Post-season

**R-10. Every Euroleague post-season game is predicted, at rising rates**
(B9, 2026-09-29). The play-in, every play-off game and the Final Four are
predicted like regular-season games. A game is added only once its teams and
date are confirmed, so a series' game 4 or 5 exists only if the series needs
it (an unplayed game must never hold the site on a round or keep the
tournament from finishing). Rates: play-in 1, play-offs 2, Final Four (both
semi-finals and the third-place game) 3, final 3. Survival is regular season
only: it ends after round 38.

**R-11. A survival team is used once per run; the list resets after all 20**
(B10, 2026-09-29). Picking a team already used in the current run is
refused. Once a player has used every team, the used list resets and all
teams are available again, so a run can last the whole regular season.

**R-12. A survival pick on a postponed game waits for that game** (B11,
2026-09-29). If the picked team's game is moved out of its round, the pick
stays and is decided whenever the game is played. The player keeps picking
for later rounds meanwhile (R-6); if the postponed game is then lost, the run
ends at that point.

**R-13. A moved game reopens only if it had not yet locked** (B12,
2026-09-29). When a game's date moves later, predictions reopen only if its
original tip-off had not passed. A game that had already locked stays locked
with the predictions made, so nobody can change a prediction after seeing
the league's.

## Standings

**R-14. Euroleague standings are scored once, after round 38** (B13,
2026-09-29). The final regular-season table is entered once, after round 38;
play-off and Final Four ticks are entered as each stage is decided. Points
are paid once and never taken back (190 for the exact place, 10 fewer per
place off, times the crowd bonus of R-3).

**R-16. Standings points recalculate automatically** (B15, 2026-09-29).
Saving team places or play-off ticks updates every player's standings points
at once, and "recalculate all" includes them. There is no separate button to
remember.

**R-19. An admin hide is separate from being switched off** (B18,
2026-09-29). A player an admin hides stays hidden until an admin undoes it;
saving a prediction does not bring them back. The automatic switch-off for
missed games (R-7) is a separate state with its own rule.

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

## Leagues

**R-20. League invites go only to players already in the tournament** (B19,
2026-09-29). A private league's invite can be sent only to a player who is
registered for that league's tournament. Nobody can end up a league member of
a tournament they have not joined.

**R-23. A league owner can hand the league to another member** (B22,
2026-09-29). The owner can make any member of the league its owner; after
handing over, the former owner may leave like anyone else.

## Tournaments

**R-21. A tournament is finished when its end date has passed and every game
is scored** (B20, 2026-09-29). Scoring every game entered so far is not
enough, so the gap between round 38 and the post-season (R-10) does not end
the season early.

**R-22. Finished tournaments are frozen** (B21, 2026-09-29). A recalculation
only touches tournaments that are not finished (R-21). A finished season's
points and final table never change, even when a scoring rule changes later.
