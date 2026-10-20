import { describe, expect, it } from 'vitest';
import { survivalPoints } from '../recalculation/survival-points';
import { Game } from '../round/game';
import { Season } from '../round/season';
import {
  at,
  gameNo,
  makeRound,
  player,
  roundNo,
  score,
  team,
  unwrap,
} from '../testing';
import { foldSurvival, type SurvivalPick } from './survival-fold';
import { survivalLedger } from './survival-ledger';
import { SurvivalRun } from './survival-run';

/**
 * The ledger reads the stored rows, the fold writes them (the rows are not
 * re-derivable where production's own are the live ones, so the ledger keeps
 * reading them). Nothing else ties the two together, so this does: at every
 * state of every round, the ledger over the rows recalculation stores says
 * what the fold says.
 */

const ME = player('7');
const ROUNDS = [1, 2, 3, 4] as const;

/** What one round holds: the player's pick, and how its game stands. */
const ROUND_STATES = [
  'no-pick',
  'no-game',
  'unplayed',
  'postponed',
  'level',
  'home-wins-pick-home',
  'home-wins-pick-away',
  'away-wins-pick-away',
  'away-wins-pick-home',
] as const;
type RoundState = (typeof ROUND_STATES)[number];

const RESULTS: Partial<Record<RoundState, readonly [number, number]>> = {
  level: [80, 80],
  'home-wins-pick-home': [90, 80],
  'home-wins-pick-away': [90, 80],
  'away-wins-pick-away': [80, 90],
  'away-wins-pick-home': [80, 90],
};

const picked = (state: RoundState): 'ZAL' | 'OLY' | null => {
  if (state === 'no-pick') return null;
  return state.endsWith('pick-home')
    ? 'ZAL'
    : state.endsWith('pick-away')
      ? 'OLY'
      : 'ZAL';
};

function gameOf(round: number, state: RoundState): Game | null {
  if (state === 'no-game') return null;
  const result = RESULTS[state];
  return unwrap(
    Game.stored({
      id: gameNo(round),
      round: roundNo(round),
      home: team('ZAL'),
      away: team('OLY'),
      tipOff: at(`2026-10-0${String(round)}T18:00:00Z`),
      result: result === undefined ? null : score(...result),
      recordedWinner: null,
      lockedSince: null,
      postponed: state === 'postponed',
    }),
  );
}

/** Every assignment of a state to each of the rounds. */
function everyCombination(): readonly (readonly RoundState[])[] {
  return ROUNDS.reduce<readonly (readonly RoundState[])[]>(
    (so_far) => so_far.flatMap((head) => ROUND_STATES.map((s) => [...head, s])),
    [[]],
  );
}

function worldOf(states: readonly RoundState[]) {
  const picks: SurvivalPick[] = [];
  const games: Game[] = [];
  states.forEach((state, index) => {
    const round = ROUNDS[index] ?? 1;
    const game = gameOf(round, state);
    if (game !== null) games.push(game);
    const chosen = picked(state);
    if (chosen !== null)
      picks.push({ round: roundNo(round), team: team(chosen) });
  });
  const season = unwrap(
    Season.create({
      rounds: ROUNDS.map((number) => makeRound({ number })),
      games,
      endsAt: at('2027-05-31T00:00:00Z'),
    }),
  );
  return { picks, games, season, run: unwrap(SurvivalRun.stored(picks)) };
}

const shown = (
  lines: readonly {
    round: number;
    team: string;
    state: string;
    points: { toString(): string } | null;
    provisional: boolean;
  }[],
) =>
  lines.map(
    (line) =>
      `${String(line.round)}:${line.team}:${line.state}:${line.points?.toString() ?? '-'}:${String(line.provisional)}`,
  );

describe('survival: the ledger agrees with the fold', () => {
  it('at every pick, result and postponement state of four rounds', () => {
    const disagreements: string[] = [];
    for (const states of everyCombination()) {
      const { picks, games, season, run } = worldOf(states);
      const stored = unwrap(survivalPoints(new Map([[ME, run]]), season));
      const ledger = survivalLedger(run, stored);
      const folded = foldSurvival(
        picks,
        [...games].sort((a, b) => a.tipOff - b.tipOff || a.id - b.id),
      );
      if (shown(ledger).join() !== shown(folded).join()) {
        disagreements.push(states.join(' | '));
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('after a pick is switched while pending: the stale row naming the old team is never read', () => {
    const old = worldOf(['unplayed', 'home-wins-pick-home']);
    const stale = unwrap(survivalPoints(new Map([[ME, old.run]]), old.season));
    const switched = unwrap(
      SurvivalRun.stored([
        { round: roundNo(1), team: team('OLY') },
        { round: roundNo(2), team: team('ZAL') },
      ]),
    );
    const ledger = survivalLedger(switched, stale);
    expect(shown(ledger)).toEqual([
      '1:OLY:pending:-:false',
      '2:ZAL:survived:20.00:true',
    ]);
  });
});
