import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { player, team, teamPick, unwrap } from '../testing';
import {
  StandingsPrediction,
  type StoredTeamPick,
} from './standings-prediction';

const TEAMS = Array.from({ length: 20 }, (_, index) => `T${String(index + 1)}`);

/** A complete, legal prediction: T1..T20 in order, the top 8 in the play-offs, the top 4 in the Final Four, T1 champion and T2 runner-up. */
const complete = () =>
  TEAMS.map((name, index) =>
    teamPick(name, {
      place: index + 1,
      playOffs: index < 8,
      finalFour: index < 4,
      ...(index === 0 ? { finalPlace: 1 as const } : {}),
      ...(index === 1 ? { finalPlace: 2 as const } : {}),
    }),
  );
const problemsOf = (picks: ReturnType<typeof complete>) =>
  unwrap(StandingsPrediction.of(player('ada'), picks)).problems(
    TEAMS.map(team),
  );

describe('ST-1', () => {
  it('standings: a complete prediction has no problems', () => {
    expect(problemsOf(complete())).toEqual([]);
  });

  it('standings: every place is used once', () => {
    const twice = complete().map((pick, index) =>
      index === 1 ? { ...pick, place: 1 } : pick,
    );
    expect(problemsOf(twice)).toEqual(['duplicate-place']);
    const unplaced = complete().map((pick, index) =>
      index === 19 ? { ...pick, place: null } : pick,
    );
    expect(problemsOf(unplaced)).toEqual(['unplaced-team']);
  });

  it('standings: 8 play-off and 4 Final Four ticks are required', () => {
    const sevenAndFive = complete().map((pick, index) =>
      index === 7 ? { ...pick, playOffs: false, finalFour: true } : pick,
    );
    expect(problemsOf(sevenAndFive)).toEqual([
      'play-off-ticks',
      'final-four-ticks',
    ]);
  });

  it('standings: the champion and runner-up are named once each', () => {
    const twoChampions = complete().map((pick, index) =>
      index === 1 ? { ...pick, finalPlace: 1 as const } : pick,
    );
    expect(problemsOf(twoChampions)).toEqual(['duplicate-final-place']);
    const noRunnerUp = complete().map((pick, index) =>
      index === 1 ? { ...pick, finalPlace: null } : pick,
    );
    expect(problemsOf(noRunnerUp)).toEqual(['final-places']);
  });

  it('standings: a player with no rows is not playing, not incomplete', () => {
    expect(problemsOf([])).toEqual([]);
  });

  it('standings: a row per team and positive places', () => {
    expect(
      StandingsPrediction.of(player('ada'), [teamPick('T1'), teamPick('T1')]),
    ).toEqual(refuse('duplicate-team'));
    expect(
      StandingsPrediction.of(player('ada'), [teamPick('T1', { place: 0 })]),
    ).toEqual(refuse('place-not-positive'));
  });

  it('standings (R-36): any saved column counts as saving something', () => {
    const saved = (picks: Parameters<typeof StandingsPrediction.of>[1]) =>
      unwrap(StandingsPrediction.of(player('ada'), picks)).savedAnything();
    expect(saved([teamPick('T1')])).toBe(false);
    expect(saved([teamPick('T1', { playOffs: false })])).toBe(true);
    expect(saved([teamPick('T1', { place: 3 })])).toBe(true);
  });
});

describe('StandingsPrediction.stored: stored rows read back', () => {
  const stored = (columns: Partial<StoredTeamPick>): StoredTeamPick => ({
    team: team('T1'),
    place: null,
    playOffs: null,
    finalFour: null,
    finalPlace: null,
    ...columns,
  });

  it('standings: a stored final place 0 is no final place', () => {
    const prediction = unwrap(
      StandingsPrediction.stored(player('ada'), [stored({ finalPlace: 0 })]),
    );
    expect(prediction.pick(team('T1'))?.finalPlace).toBeNull();
  });

  it('standings: stored final places 1 to 4 are kept', () => {
    const prediction = unwrap(
      StandingsPrediction.stored(
        player('ada'),
        [1, 2, 3, 4].map((finalPlace, index) => ({
          ...stored({ finalPlace }),
          team: team(`T${String(index + 1)}`),
        })),
      ),
    );
    expect(prediction.picks.map((pick) => pick.finalPlace)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('standings: a stored place is kept as stored, 0 included', () => {
    // sportbet scores a stored place 0 as a place (190 - 10 x the actual
    // place) and counts it among the players who placed the team.
    const prediction = unwrap(
      StandingsPrediction.stored(player('ada'), [stored({ place: 0 })]),
    );
    expect(prediction.pick(team('T1'))?.place).toBe(0);
  });

  it.each([
    ['a negative place', { place: -1 }, 'bad-place'],
    ['a fractional place', { place: 1.5 }, 'bad-place'],
    ['a final place of 5', { finalPlace: 5 }, 'bad-final-place'],
  ] as const)('standings: refuses %s', (_, columns, refusal) => {
    expect(
      StandingsPrediction.stored(player('ada'), [stored(columns)]),
    ).toEqual(refuse(refusal));
  });

  it('standings: refuses the same team twice', () => {
    expect(
      StandingsPrediction.stored(player('ada'), [stored({}), stored({})]),
    ).toEqual(refuse('duplicate-team'));
  });

  it('standings: an entry naming a third place is refused', () => {
    expect(
      StandingsPrediction.of(player('ada'), [
        teamPick('T1', { finalPlace: 3 }),
      ]),
    ).toEqual(refuse('final-place-out-of-range'));
  });
});
