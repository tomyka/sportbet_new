import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { roundNo } from '@sportbet/domain/testing';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { comparisonFromJson } from './comparison-from-json';

const compared = comparison(
  side(JONAS, 'jonas', { totalCents: 1000 }),
  side(ZUKAUSKAS, 'zuk', { totalCents: 500 }),
  {
    record: { wins: 1, draws: 0, losses: 0 },
    rounds: [
      { round: roundNo(1), name: '1 turas', meCents: 1000, themCents: 500 },
    ],
  },
);

/** What the card route sends: the comparison through JSON. */
const sent = (): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(JSON.stringify(compared)));

describe('comparisonFromJson', () => {
  it('reads what the card route sent back into the comparison', () => {
    expect(comparisonFromJson(sent())).toEqual(compared);
  });

  it('reads a comparison with no round', () => {
    const empty = { ...sent(), record: null, rounds: [] };
    expect(comparisonFromJson(empty)).toEqual({
      ...compared,
      record: null,
      rounds: [],
    });
  });

  it.each([null, 'x', {}, { status: 'guest' }])(
    'is null for %j, which is no comparison',
    (body) => {
      expect(comparisonFromJson(body)).toBeNull();
    },
  );

  it('is null for a player id that is empty', () => {
    expect(
      comparisonFromJson({ ...sent(), me: { ...compared.me, player: '' } }),
    ).toBeNull();
  });

  it('is null for a round that is no round number', () => {
    expect(
      comparisonFromJson({
        ...sent(),
        rounds: [{ round: 0, name: 'x', meCents: 0, themCents: 0 }],
      }),
    ).toBeNull();
  });
});
