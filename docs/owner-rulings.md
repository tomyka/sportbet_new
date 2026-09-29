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
