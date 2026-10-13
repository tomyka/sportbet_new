import { roundNo, team } from '@sportbet/domain/testing';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  card,
  leg,
  openPage,
  pageData,
} from '../../../tests/support/survival-views';
import { SurvivalView } from './survival-view';

const radio = (name: string) => screen.getByRole('radio', { name });

const slot = (name: string) => {
  const input = radio(name);
  const label = input.closest('label');
  if (label === null) throw new Error(`no label for ${name}`);
  return label;
};

const stake = () => screen.getByTestId('survival-stake').textContent;

/** fetch answering one post with `status` and `body`. */
const answer = (status: number, body: unknown) => {
  const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
    () => Promise.resolve(Response.json(body, { status })),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(radio(name));
    await Promise.resolve();
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the pick grid (survival.blade.php .sv-grid)', () => {
  it('a radio group named "Rinkis komandą", one radio per team, by id', () => {
    render(<SurvivalView data={pageData()} />);
    const group = screen.getByRole('radiogroup', { name: 'Rinkis komandą' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((input) => input.getAttribute('value')),
    ).toEqual(['1', '2', '3', '4']);
  });

  it('an open card: crest, name, "vs. <opponent>" and its ground, "Namie" or "Išvykoje"', () => {
    render(<SurvivalView data={pageData()} />);
    const home = slot('Olympiacos');
    expect(within(home).getByRole('img', { name: 'Olympiacos' })).toBeDefined();
    expect(home.textContent).toContain('vs. Zalgiris');
    expect(home.textContent).toContain('Namie');
    expect(slot('Zalgiris').textContent).toContain('vs. Olympiacos');
    expect(slot('Zalgiris').textContent).toContain('Išvykoje');
  });

  it('a used card: "Panaudota · N turas" (or "Panaudota" without a round) and a check', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            cards: [
              card(1, 2, {
                state: { kind: 'used', round: roundNo(2) },
                selectable: false,
              }),
              card(2, 1, {
                state: { kind: 'used', round: null },
                selectable: false,
              }),
            ],
          }),
        )}
      />,
    );
    expect(slot('Olympiacos').textContent).toContain('Panaudota · 2 turas');
    expect(
      slot('Olympiacos').querySelector('[data-icon="check-lg"]'),
    ).not.toBeNull();
    expect(slot('Zalgiris').textContent).toContain('Panaudota');
    expect(slot('Zalgiris').textContent).not.toContain('turas');
  });

  it('a started card: "Rungtynės prasidėjo" and a lock', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            cards: [
              card(1, 2, { state: { kind: 'started' }, selectable: false }),
            ],
          }),
        )}
      />,
    );
    expect(slot('Olympiacos').textContent).toContain('Rungtynės prasidėjo');
    expect(
      slot('Olympiacos').querySelector('[data-icon="lock-fill"]'),
    ).not.toBeNull();
    expect(slot('Olympiacos').textContent).not.toContain('Namie');
  });

  it('an open card the save would refuse: its opponent, and a lock for its ground', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({ cards: [card(1, 2, { selectable: false })] }),
        )}
      />,
    );
    expect(slot('Olympiacos').textContent).toContain('vs. Zalgiris');
    expect(
      slot('Olympiacos').querySelector('[data-icon="lock-fill"]'),
    ).not.toBeNull();
  });

  it('a card the save would refuse is disabled: a click posts nothing', async () => {
    const fetch = answer(200, { success: true });
    render(
      <SurvivalView
        data={pageData(
          openPage({
            cards: [
              card(1, 2, { state: { kind: 'started' }, selectable: false }),
              card(3, 4),
            ],
          }),
        )}
      />,
    );
    expect(radio('Olympiacos')).toHaveProperty('disabled', true);
    expect(radio('Real Madrid')).toHaveProperty('disabled', false);
    await click('Olympiacos');
    expect(fetch).not.toHaveBeenCalled();
    expect(radio('Olympiacos')).toHaveProperty('checked', false);
  });

  it('the held pick is checked', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            picked: team('3'),
            cards: [card(1, 2), card(3, 4, { picked: true })],
          }),
        )}
      />,
    );
    expect(radio('Real Madrid')).toHaveProperty('checked', true);
    expect(radio('Olympiacos')).toHaveProperty('checked', false);
  });

  it('a click posts teamID and the shown round at once; on 200 the radio stays and the stake follows it', async () => {
    const fetch = answer(200, { success: true });
    render(<SurvivalView data={pageData()} />);
    expect(stake()).toBe('+10/12');
    await click('Zalgiris');
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/prediction/predictionSurvival/save');
    expect(
      init?.body instanceof URLSearchParams ? init.body.toString() : null,
    ).toBe('teamID=2&round=3');
    expect(radio('Zalgiris')).toHaveProperty('checked', true);
    expect(stake()).toBe('+12');
    answer(200, { success: true });
    await click('Olympiacos');
    expect(stake()).toBe('+10');
  });

  it('the stake of a held pick is its ground, from the last running total', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            picked: team('2'),
            cards: [card(1, 2), card(2, 1, { ground: 'away', picked: true })],
            stake: { home: 32, away: 34 },
          }),
        )}
      />,
    );
    expect(stake()).toBe('+34');
  });

  it('a 422: its message in the alert, and the radio back on the held pick', async () => {
    answer(422, {
      success: false,
      message: 'Šios komandos rungtynės jau prasidėjo.',
    });
    render(
      <SurvivalView
        data={pageData(
          openPage({
            picked: team('3'),
            cards: [card(1, 2), card(3, 4, { picked: true })],
          }),
        )}
      />,
    );
    await click('Olympiacos');
    expect(screen.getByRole('alert').textContent).toBe(
      'Šios komandos rungtynės jau prasidėjo.',
    );
    expect(radio('Real Madrid')).toHaveProperty('checked', true);
    expect(radio('Olympiacos')).toHaveProperty('checked', false);
    expect(stake()).toBe('+10');
  });

  it('with nothing held, a refusal leaves no radio checked', async () => {
    answer(422, { success: false, message: 'Šis turas jau užskaitytas.' });
    render(<SurvivalView data={pageData()} />);
    await click('Olympiacos');
    expect(
      screen
        .getAllByRole('radio')
        .some((input) => 'checked' in input && input.checked),
    ).toBe(false);
    expect(stake()).toBe('+10/12');
  });

  it('a 503 (or anything but a 422): "Pasirinkimas neišsaugotas. Bandykite dar kartą."', async () => {
    answer(503, {
      success: false,
      message: 'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
    });
    render(<SurvivalView data={pageData()} />);
    await click('Olympiacos');
    expect(screen.getByRole('alert').textContent).toBe(
      'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
    );
  });

  it('a save after a refusal clears the alert', async () => {
    answer(422, { success: false, message: 'Šis turas jau užskaitytas.' });
    render(<SurvivalView data={pageData()} />);
    await click('Olympiacos');
    answer(200, { success: true });
    await click('Zalgiris');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a scored round: the stake is what it paid, and the verdict', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            verdict: { state: 'survived', points: 22 },
            choosing: false,
            cards: [card(1, 2, { picked: true, selectable: false })],
            picked: team('1'),
            run: [leg(2, 3, 'survived', 10)],
            streak: 1,
            runPoints: 10,
          }),
        )}
      />,
    );
    expect(stake()).toBe('+22');
  });

  it('a lost round: +0', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            verdict: { state: 'lost' },
            choosing: false,
            cards: [card(1, 2, { picked: true, selectable: false })],
            picked: team('1'),
          }),
        )}
      />,
    );
    expect(stake()).toBe('+0');
  });
});
