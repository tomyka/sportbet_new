import { describe, expect, it } from 'vitest';
import { PlayerStatus } from '../player/player-status';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  player,
  tournamentKey,
  unwrap,
} from '../testing';
import { MatchPrediction } from './match-prediction';
import { predictMatch, statusAfterSave } from './predict-match';

const JONAS = player('1');
const EUROLEAGUE = tournamentKey('41');
const OTHER = tournamentKey('42');
const NOW = at('2026-10-15T12:00:00Z');

const OPEN = makeGame({
  id: 10,
  round: 1,
  home: '11',
  away: '12',
  tipOff: '2026-10-20T18:00:00Z',
});
const STARTED = makeGame({
  id: 9,
  round: 1,
  home: '13',
  away: '14',
  tipOff: '2026-10-10T17:30:00Z',
});

const row = (
  game: number,
  home: number | null = null,
  away: number | null = null,
) =>
  unwrap(
    MatchPrediction.stored({
      player: JONAS,
      game: gameNo(game),
      home,
      away,
      origin: 'real',
      filledInAt: null,
    }),
  );

describe('predictMatch: issue 254, the posted gameID must name the row game', () => {
  it.each([sportbetRules, ruledRules])(
    'save ($name, issue 254): a posted gameID other than the row game is "not yours", even an open game paired with a closed row',
    (rules) => {
      expect(
        predictMatch({
          target: { prediction: row(9), game: STARTED },
          postedGame: OPEN.id,
          entry: { home: 88, away: 79 },
          now: NOW,
          rules,
        }),
      ).toEqual({ ok: false, refusal: 'not-yours' });
    },
  );

  it.each([sportbetRules, ruledRules])(
    'save ($name, issue 254): a posted gameID naming the row game is the save',
    (rules) => {
      expect(
        predictMatch({
          target: { prediction: row(10), game: OPEN },
          postedGame: OPEN.id,
          entry: { home: 88, away: 79 },
          now: NOW,
          rules,
        }).ok,
      ).toBe(true);
    },
  );
});

describe('predictMatch (updatePredictionResultUser)', () => {
  it("save: the player's own row of an open game takes the pair, as a real prediction", () => {
    const saved = unwrap(
      predictMatch({
        target: { prediction: row(10), game: OPEN },
        postedGame: OPEN.id,
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    );
    expect(saved.prediction).toMatchObject({
      home: 88,
      away: 79,
      origin: 'real',
    });
  });

  it('save (issue 254): no row of the player\'s, or a row of another game, is "not yours"', () => {
    expect(
      predictMatch({
        target: null,
        postedGame: OPEN.id,
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'not-yours' });
    expect(
      predictMatch({
        target: { prediction: row(9), game: OPEN },
        postedGame: OPEN.id,
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'not-yours' });
  });

  it('save (LR-1): a game past its tip-off is closed, whatever the pair', () => {
    for (const entry of [
      { home: 88, away: 79 },
      { home: null, away: null },
    ]) {
      expect(
        predictMatch({
          target: { prediction: row(9), game: STARTED },
          postedGame: STARTED.id,
          entry,
          now: NOW,
          rules: ruledRules,
        }),
      ).toEqual({ ok: false, refusal: 'closed' });
    }
  });

  it("save: MatchPrediction.enter's refusals stand behind the form check", () => {
    expect(
      predictMatch({
        target: { prediction: row(10), game: OPEN },
        postedGame: OPEN.id,
        entry: { home: 80, away: 80 },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'level' });
  });

  it('save: a saved score is audited with the row as it was; a clear is not (AuditPredictionGameController)', () => {
    const saved = unwrap(
      predictMatch({
        target: { prediction: row(10, 85, 80), game: OPEN },
        postedGame: OPEN.id,
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    );
    expect(saved.audit).toEqual({
      old: { home: 85, away: 80 },
      new: { home: 88, away: 79 },
    });
    const cleared = unwrap(
      predictMatch({
        target: { prediction: row(10, 85, 80), game: OPEN },
        postedGame: OPEN.id,
        entry: { home: null, away: null },
        now: NOW,
        rules: ruledRules,
      }),
    );
    expect(cleared.audit).toBeNull();
  });

  it('save (sportbet, PL-1): any accepted save switches the player back on, a clear included', () => {
    for (const entry of [
      { home: 88, away: 79 },
      { home: null, away: null },
    ]) {
      expect(
        unwrap(
          predictMatch({
            target: { prediction: row(10), game: OPEN },
            postedGame: OPEN.id,
            entry,
            now: NOW,
            rules: sportbetRules,
          }),
        ).switchesBackOn,
      ).toBe(true);
    }
  });

  it('save (ruled, R-57): only a saved score switches the player back on', () => {
    const switches = (home: number | null, away: number | null) =>
      unwrap(
        predictMatch({
          target: { prediction: row(10), game: OPEN },
          postedGame: OPEN.id,
          entry: { home, away },
          now: NOW,
          rules: ruledRules,
        }),
      ).switchesBackOn;
    expect(switches(88, 79)).toBe(true);
    expect(switches(null, null)).toBe(false);
  });
});

describe('statusAfterSave (PL-1)', () => {
  const rows = [
    {
      tournament: EUROLEAGUE,
      switchedOff: true,
      adminHidden: false,
      fillIns: 20,
    },
    { tournament: OTHER, switchedOff: true, adminHidden: false, fillIns: 20 },
  ];

  it('save (ruled, R-7): back on in its own tournament only, that count reset; the other stays off', () => {
    expect(statusAfterSave(rows, EUROLEAGUE, ruledRules)).toEqual([
      {
        tournament: EUROLEAGUE,
        switchedOff: false,
        adminHidden: false,
        fillIns: 0,
      },
      { tournament: OTHER, switchedOff: true, adminHidden: false, fillIns: 20 },
    ]);
  });

  it('save (ruled, R-19): an admin hide stays', () => {
    expect(
      statusAfterSave(
        [
          {
            tournament: EUROLEAGUE,
            switchedOff: true,
            adminHidden: true,
            fillIns: 20,
          },
        ],
        EUROLEAGUE,
        ruledRules,
      ),
    ).toEqual([
      {
        tournament: EUROLEAGUE,
        switchedOff: false,
        adminHidden: true,
        fillIns: 0,
      },
    ]);
  });

  it('save (sportbet): one switch, on everywhere, every count kept (user_settings.active)', () => {
    expect(statusAfterSave(rows, EUROLEAGUE, sportbetRules)).toEqual([
      {
        tournament: EUROLEAGUE,
        switchedOff: false,
        adminHidden: false,
        fillIns: 20,
      },
      {
        tournament: OTHER,
        switchedOff: false,
        adminHidden: false,
        fillIns: 20,
      },
    ]);
  });

  it('save: agrees with PlayerStatus.afterRealPrediction under both sets', () => {
    for (const rules of [sportbetRules, ruledRules]) {
      const after = statusAfterSave(rows, EUROLEAGUE, rules);
      const status = unwrap(
        PlayerStatus.stored(
          {
            switchedOffIn: new Set(
              after
                .filter((each) => each.switchedOff)
                .map((each) => each.tournament),
            ),
            adminHidden: false,
            fillIns: new Map(
              after.map((each) => [each.tournament, each.fillIns]),
            ),
          },
          rules,
        ),
      );
      const expected = unwrap(
        PlayerStatus.stored(
          {
            switchedOffIn: new Set([EUROLEAGUE, OTHER]),
            adminHidden: false,
            fillIns: new Map([
              [EUROLEAGUE, 20],
              [OTHER, 20],
            ]),
          },
          rules,
        ),
      ).afterRealPrediction(EUROLEAGUE, rules);
      for (const tournament of [EUROLEAGUE, OTHER]) {
        expect(status.isSwitchedOffIn(tournament, rules)).toBe(
          expected.isSwitchedOffIn(tournament, rules),
        );
        expect(status.fillInCount(tournament, rules)).toBe(
          expected.fillInCount(tournament, rules),
        );
      }
    }
  });
});
