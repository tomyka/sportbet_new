import { team } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { readFactsForm } from './teams';

/** The facts form as the page posts it: a row per team, in the posted arrays, the ticks naming their rows. */
function form(
  rows: readonly { id: string; place: string; finalPlace: string }[],
  extra: readonly (readonly [string, string])[] = [],
): FormData {
  const data = new FormData();
  for (const row of rows) {
    data.append('teamID', row.id);
    data.append('place', row.place);
    data.append('finalPlace', row.finalPlace);
  }
  for (const [name, value] of extra) data.append(name, value);
  return data;
}

describe('the standings facts form (TeamController::updateTeams)', () => {
  it('reads every row, the ticks by the row they name, and the final mark', () => {
    const read = readFactsForm(
      form(
        [
          { id: '1', place: '1', finalPlace: '1' },
          { id: '2', place: '2', finalPlace: '' },
          { id: '3', place: '', finalPlace: '' },
        ],
        [
          ['playOffs', '0'],
          ['playOffs', '1'],
          ['finalFour', '0'],
          ['final', '1'],
        ],
      ),
    );
    expect(read).toEqual({
      ok: true,
      value: {
        final: true,
        rows: [
          {
            team: team('1'),
            place: 1,
            playOffs: true,
            finalFour: true,
            finalPlace: 1,
          },
          {
            team: team('2'),
            place: 2,
            playOffs: true,
            finalFour: false,
            finalPlace: null,
          },
          {
            team: team('3'),
            place: null,
            playOffs: false,
            finalFour: false,
            finalPlace: null,
          },
        ],
      },
    });
  });

  it('ignores a tick that names no row index', () => {
    const read = readFactsForm(
      form(
        [{ id: '1', place: '', finalPlace: '' }],
        [
          ['playOffs', 'x'],
          ['playOffs', '-1'],
          ['playOffs', '1.5'],
        ],
      ),
    );
    expect(read).toMatchObject({
      ok: true,
      value: { final: false, rows: [{ playOffs: false }] },
    });
  });

  it('lists every refused field of every row', () => {
    const read = readFactsForm(
      form([
        { id: 'x', place: '0', finalPlace: '3' },
        { id: '2', place: 'a', finalPlace: '' },
      ]),
    );
    expect(read).toEqual({
      ok: false,
      errors: [
        { row: 0, field: 'team', problem: 'not-an-id' },
        { row: 0, field: 'place', problem: 'bad-place' },
        { row: 0, field: 'finalPlace', problem: 'bad-final-place' },
        { row: 1, field: 'place', problem: 'bad-place' },
      ],
    });
  });
});
