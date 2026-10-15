import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/euroleague-e2026-games.json';
import { at } from '../testing';
import { parseEuroleagueFeed } from './euroleague-feed';

type Json = Record<string, unknown>;

function feed(): { data: Json[] } {
  return structuredClone(fixture);
}

function firstGame(payload: { data: Json[] }): Json {
  const first = payload.data[0];
  if (first === undefined) throw new Error('fixture is empty');
  return first;
}

function firstGameWith(change: (game: Json) => void): unknown {
  const payload = feed();
  change(firstGame(payload));
  return payload;
}

function refusalOf(payload: unknown) {
  const result = parseEuroleagueFeed(payload);
  if (result.ok) throw new Error('expected a refusal');
  return result.refusal;
}

function tipOffOf(utcDate: string) {
  const result = parseEuroleagueFeed(
    firstGameWith((game) => (game['utcDate'] = utcDate)),
  );
  return result.ok ? (result.value.fixtures[0]?.tipOff ?? null) : null;
}

describe('parseEuroleagueFeed', () => {
  it("reads sportbet's fixture: 20 games of rounds 1 and 2", () => {
    const result = parseEuroleagueFeed(feed());
    if (!result.ok) throw new Error('refused');
    const { fixtures, postSeasonLeftOut } = result.value;
    expect(fixtures).toHaveLength(20);
    expect(postSeasonLeftOut).toBe(0);
    expect(new Set(fixtures.map((each) => each.round))).toEqual(
      new Set([1, 2]),
    );
    expect(fixtures[0]).toEqual({
      round: 1,
      tipOff: at('2026-09-24T16:00:00Z'),
      home: 'Hapoel IBI Tel Aviv',
      away: 'FC Bayern Munich',
    });
  });

  it.each([
    ['no data', {}],
    ['data not an array', { data: 'x' }],
    ['data empty', { data: [] }],
    ['a payload that is not an object', 'x'],
    ['a null payload', null],
  ])('refuses %s as no games', (_label, payload) => {
    expect(refusalOf(payload)).toEqual({ kind: 'no-games' });
  });

  it.each([
    ['round', (game: Json) => delete game['round']],
    ['round', (game: Json) => (game['round'] = '7a')],
    ['round', (game: Json) => (game['round'] = 0)],
    ['round', (game: Json) => (game['round'] = 1.5)],
    ['round', (game: Json) => (game['round'] = '')],
    ['utcDate', (game: Json) => delete game['utcDate']],
    ['utcDate', (game: Json) => (game['utcDate'] = 'tomorrow')],
    ['utcDate', (game: Json) => (game['utcDate'] = '2026-02-30T10:00:00Z')],
    ['utcDate', (game: Json) => (game['utcDate'] = '2026-02-28T24:00:00Z')],
    ['utcDate', (game: Json) => (game['utcDate'] = 5)],
    ['local.club.name', (game: Json) => (game['local'] = null)],
    [
      'local.club.name',
      (game: Json) => (game['local'] = { club: { name: ' \t ' } }),
    ],
    ['road.club.name', (game: Json) => (game['road'] = { club: {} })],
    ['phaseType.code', (game: Json) => delete game['phaseType']],
    ['phaseType.code', (game: Json) => (game['phaseType'] = { code: 3 })],
  ])('refuses a first game with a bad %s', (field, change) => {
    expect(refusalOf(firstGameWith(change))).toEqual({
      kind: 'malformed',
      number: 1,
      field,
    });
  });

  it('numbers the game by its place in the list', () => {
    const payload = feed();
    const third = payload.data[2];
    if (third === undefined) throw new Error('fixture is short');
    delete third['utcDate'];
    expect(refusalOf(payload)).toEqual({
      kind: 'malformed',
      number: 3,
      field: 'utcDate',
    });
  });

  it("names the first bad field in sportbet's order", () => {
    const payload = firstGameWith((game) => {
      delete game['utcDate'];
      delete game['phaseType'];
      game['road'] = null;
    });
    expect(refusalOf(payload)).toMatchObject({ field: 'utcDate' });
  });

  it('reads a game that is not an object as missing its round', () => {
    expect(refusalOf({ data: [7] })).toEqual({
      kind: 'malformed',
      number: 1,
      field: 'round',
    });
  });

  it('reads a digit string as its round', () => {
    const result = parseEuroleagueFeed(
      firstGameWith((game) => (game['round'] = '7')),
    );
    expect(result.ok && result.value.fixtures[0]?.round).toBe(7);
  });

  it('collapses whitespace in a name', () => {
    const result = parseEuroleagueFeed(
      firstGameWith((game) => {
        game['local'] = { club: { name: '  Hapoel\tIBI \n Tel   Aviv ' } };
      }),
    );
    expect(result.ok && result.value.fixtures[0]?.home).toBe(
      'Hapoel IBI Tel Aviv',
    );
  });

  it('refuses a team playing itself, by its key, at road.club.name', () => {
    const payload = firstGameWith((game) => {
      game['road'] = { club: { name: 'hapoel  ibi tel aviv' } };
    });
    expect(refusalOf(payload)).toEqual({
      kind: 'malformed',
      number: 1,
      field: 'road.club.name',
    });
  });

  it('moves an offset to UTC, drops fractions, and reads no zone as UTC', () => {
    const sixteen = at('2026-09-24T16:00:00Z');
    expect(tipOffOf('2026-09-24T18:00:00+02:00')).toBe(sixteen);
    expect(tipOffOf('2026-09-24T18:00:00+0200')).toBe(sixteen);
    expect(tipOffOf('2026-09-24T16:00:00.750Z')).toBe(sixteen);
    expect(tipOffOf('2026-09-24 16:00:00')).toBe(sixteen);
    expect(tipOffOf('2026-09-24T16:00')).toBe(sixteen);
  });

  it('leaves out and counts a game of another phase (R-94)', () => {
    const payload = feed();
    payload.data.push({ ...firstGame(payload), phaseType: { code: 'PO' } });
    const result = parseEuroleagueFeed(payload);
    if (!result.ok) throw new Error('refused');
    expect(result.value.fixtures).toHaveLength(20);
    expect(result.value.postSeasonLeftOut).toBe(1);
  });

  it('plans no fixture for a game of another phase, even the only one', () => {
    const result = parseEuroleagueFeed({
      data: [{ ...firstGame(feed()), phaseType: { code: 'PO' } }],
    });
    if (!result.ok) throw new Error('refused');
    expect(result.value).toEqual({ fixtures: [], postSeasonLeftOut: 1 });
  });
});
