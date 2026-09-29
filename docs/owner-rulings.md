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
