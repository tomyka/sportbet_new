import type { AdminRoundRow } from '@sportbet/db';
import { Rate } from '@sportbet/domain';
import { roundNo, unwrap } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FINISHED } from './tournament-fixtures';
import { RoundsView } from './rounds-view';

afterEach(() => {
  vi.restoreAllMocks();
});

const ROUND_39: AdminRoundRow = {
  id: 41,
  number: roundNo(39),
  name: '39 turas',
  stage: 'regular',
  rate: unwrap(Rate.of(1)),
  survival: true,
  knockout: false,
  games: 0,
};

const PLAY_OFFS: AdminRoundRow = {
  id: 42,
  number: roundNo(40),
  name: 'Play-off 1',
  stage: 'play-offs',
  rate: unwrap(Rate.of(2)),
  survival: false,
  knockout: true,
  games: 4,
};

const TOURNAMENT = FINISHED.tournament;

const view = (rounds: readonly AdminRoundRow[] = [ROUND_39, PLAY_OFFS]) =>
  render(<RoundsView tournament={TOURNAMENT} rounds={rounds} flash={null} />);

describe('RoundsView (admin/events.blade.php)', () => {
  it('rounds: the title with the count, and the tournament they belong to', () => {
    view();
    expect(screen.getByRole('heading', { name: /Turai/ })).toBeTruthy();
    expect(screen.getByTestId('round-count').textContent).toBe('2');
    expect(screen.getByRole('note').textContent).toBe(
      'Turnyras: Euroleague 2025/26',
    );
  });

  it('rounds: with no tournament chosen, the warning and no rows to write into', () => {
    render(<RoundsView tournament={null} rounds={[]} flash={null} />);
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras',
    );
    expect(screen.queryByTestId('new-round-row')).toBeNull();
  });

  it("rounds: each row posts the round's id and its boxes, filled, to the save route", () => {
    view();
    const [first, second] = screen.getAllByTestId('round-row');
    const row = within(first ?? document.body);
    expect(first?.getAttribute('action')).toBe('/admin/events/save');
    expect(first?.getAttribute('method')).toBe('post');
    expect(first?.querySelector('input[name="eventID"]')).toHaveProperty(
      'value',
      '41',
    );
    expect(row.getByLabelText('Turo pavadinimas')).toHaveProperty(
      'value',
      '39 turas',
    );
    expect(row.getByLabelText('Turo diena')).toHaveProperty('value', '39');
    expect(row.getByLabelText('Išlikimo turas')).toHaveProperty(
      'checked',
      true,
    );
    expect(
      row.getByLabelText('Play-off turas (baudinių serija)'),
    ).toHaveProperty('checked', false);
    expect(row.getByLabelText('Turo etapas')).toHaveProperty(
      'value',
      'regular',
    );
    expect(row.getByLabelText('Koeficientas')).toHaveProperty('value', '1');
    const other = within(second ?? document.body);
    expect(other.getByLabelText('Turo etapas')).toHaveProperty(
      'value',
      'play-offs',
    );
    expect(other.getByLabelText('Koeficientas')).toHaveProperty('value', '2');
    expect(
      other.getByLabelText('Play-off turas (baudinių serija)'),
    ).toHaveProperty('checked', true);
  });

  it('rounds: the stage select offers the Euroleague stages in words', () => {
    view([ROUND_39]);
    const options = [
      ...screen.getByLabelText('Turo etapas').querySelectorAll('option'),
    ].map((option) => [option.value, option.textContent]);
    expect(options).toEqual([
      ['regular', 'Reguliarusis sezonas'],
      ['play-in', 'Play-in'],
      ['play-offs', 'Play-off'],
      ['final-four', 'Final Four'],
      ['final', 'Finalas'],
    ]);
  });

  it('rounds: "Ištrinti turą" only for a round with no game, and it asks first', () => {
    view();
    const [first, second] = screen.getAllByTestId('round-row');
    expect(
      within(second ?? document.body).queryByTitle('Ištrinti turą'),
    ).toBeNull();
    const button = within(first ?? document.body).getByTitle('Ištrinti turą');
    expect(button.getAttribute('name')).toBe('delete');
    expect(button.getAttribute('value')).toBe('1');
    // jsdom cannot submit a form: the click's own submission is held off.
    document.addEventListener('submit', (event) => {
      event.preventDefault();
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(fireEvent.click(button)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Ištrinti turą „39 turas“?');
    confirm.mockReturnValue(true);
    expect(fireEvent.click(button)).toBe(true);
  });

  it("rounds: a tick posts the row at once, as sportbet's onchange does", () => {
    view([ROUND_39]);
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined);
    fireEvent.click(screen.getByLabelText('Išlikimo turas'));
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Turo etapas'), {
      target: { value: 'final' },
    });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('rounds: a typed box posts the row when focus leaves it, once, and not before or when nothing was typed', () => {
    view([ROUND_39]);
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined);
    const rate = screen.getByLabelText('Koeficientas');
    const day = screen.getByLabelText('Turo diena');
    fireEvent.blur(rate);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(rate, { target: { value: '3' } });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.blur(rate, { relatedTarget: day });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.blur(day, { relatedTarget: document.body });
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.blur(day);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('rounds: the insert row posts to eventInsert with its rate prefilled from the stage (R-10), still editable', () => {
    view([]);
    const row = within(screen.getByTestId('new-round-row'));
    const form = screen.getByTestId('new-round-row');
    expect(form.getAttribute('action')).toBe('/admin/eventInsert');
    const stage = row.getByLabelText('Naujo turo etapas');
    const rate = row.getByLabelText('Naujo turo koeficientas');
    expect(rate).toHaveProperty('value', '1');
    for (const [chosen, expected] of [
      ['play-offs', '2'],
      ['final-four', '3'],
      ['final', '3'],
      ['play-in', '1'],
      ['regular', '1'],
    ] as const) {
      fireEvent.change(stage, { target: { value: chosen } });
      expect(rate).toHaveProperty('value', expected);
    }
    fireEvent.change(rate, { target: { value: '5' } });
    expect(rate).toHaveProperty('value', '5');
    expect(
      row.getByRole('button', { name: 'Pridėti turą' }).getAttribute('type'),
    ).toBe('submit');
  });

  it('rounds: the insert row posts the names the controller reads', () => {
    view([]);
    const names = [
      ...screen.getByTestId('new-round-row').querySelectorAll('input, select'),
    ].map((box) => box.getAttribute('name'));
    expect(names).toEqual([
      'event',
      'eventDay',
      'eventSurvival',
      'isKnockout',
      'stage',
      'rate',
    ]);
  });

  it('rounds: the one-time message is shown above the rows', () => {
    render(
      <RoundsView
        tournament={TOURNAMENT}
        rounds={[]}
        flash={{ kind: 'admin', message: 'round-added' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Turas pridėtas.');
  });
});
