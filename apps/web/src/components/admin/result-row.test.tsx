import type { ResultsPageGame } from '@sportbet/db';
import { at, gameNo, roundNo } from '@sportbet/domain/testing';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boxesOf, ResultRow } from './result-row';

const GAME: ResultsPageGame = {
  game: gameNo(7),
  round: roundNo(1),
  tipOff: at('2026-10-02T18:00:00Z'),
  home: 'Zalgiris',
  away: 'Olympiacos',
  result: null,
  postponed: false,
  open: true,
};

const homeBox = () =>
  screen.getByLabelText('Zalgiris - Olympiacos: namų komanda');
const awayBox = () =>
  screen.getByLabelText('Zalgiris - Olympiacos: svečių komanda');

const answer = (status: number, body: unknown) =>
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () =>
    Promise.resolve(Response.json(body, { status })),
  );

/** Types a value into a box, keystroke by keystroke, without leaving it. */
function typeInto(box: HTMLElement, value: string): void {
  for (let length = 1; length <= value.length; length += 1) {
    fireEvent.change(box, { target: { value: value.slice(0, length) } });
  }
}

/** Leaves a box (sportbet's `change` event) and lets the save settle. */
async function leave(box: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.blur(box);
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResultRow (.admin-result-row and saveResult)', () => {
  it("boxes: a result's sides, a postponed game's -1 : -1 (R-63), else empty", () => {
    expect(boxesOf({ ...GAME, result: { home: 88, away: 79 } })).toEqual({
      home: '88',
      away: '79',
    });
    expect(boxesOf({ ...GAME, postponed: true })).toEqual({
      home: '-1',
      away: '-1',
    });
    expect(boxesOf(GAME)).toEqual({ home: '', away: '' });
  });

  it('the teams with their crests, the Vilnius day and time over the boxes', () => {
    render(<ResultRow game={GAME} />);
    expect(screen.getByAltText('Zalgiris')).toBeTruthy();
    expect(screen.getByAltText('Olympiacos')).toBeTruthy();
    expect(screen.getByText('Spalio 2 · 21:00')).toBeTruthy();
  });

  it('saves on change, never per keystroke: typing "88" posts nothing until the box is left, then once', async () => {
    const fetch = answer(200, { success: true });
    vi.stubGlobal('fetch', fetch);
    render(<ResultRow game={GAME} />);
    typeInto(homeBox(), '88');
    await leave(homeBox());
    typeInto(awayBox(), '79');
    expect(fetch).not.toHaveBeenCalled();
    await leave(awayBox());
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/admin/updateResult');
    const body = init?.body;
    expect(body instanceof URLSearchParams ? body.toString() : '').toBe(
      'gameID=7&homeTeamScore=88&awayTeamScore=79',
    );
    expect(homeBox().className).toContain('border-ok');
  });

  it('Enter saves too, and leaving the box after it does not post the same pair again', async () => {
    const fetch = answer(200, { success: true });
    vi.stubGlobal('fetch', fetch);
    render(<ResultRow game={{ ...GAME, result: { home: 88, away: 79 } }} />);
    typeInto(awayBox(), '80');
    await act(async () => {
      fireEvent.keyDown(awayBox(), { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await leave(awayBox());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('a box left alone, or left unchanged, posts nothing; one box filled is yellow (partial)', async () => {
    const fetch = answer(200, { success: true });
    vi.stubGlobal('fetch', fetch);
    render(<ResultRow game={GAME} />);
    await leave(homeBox());
    typeInto(homeBox(), '85');
    await leave(homeBox());
    expect(fetch).not.toHaveBeenCalled();
    expect(homeBox().className).toContain('border-warn');
  });

  it("a refusal (422) shows the server's message, the boxes red", async () => {
    vi.stubGlobal(
      'fetch',
      answer(422, {
        message: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
        errors: {
          homeTeamScore: [
            'Lygiosios negalimos - komandų rezultatai turi skirtis.',
          ],
        },
      }),
    );
    render(<ResultRow game={GAME} />);
    typeInto(homeBox(), '80');
    typeInto(awayBox(), '80');
    await leave(awayBox());
    expect(screen.getByRole('alert').textContent).toBe(
      'Lygiosios negalimos - komandų rezultatai turi skirtis.',
    );
    expect(homeBox().className).toContain('border-bad');
  });

  it('a lost connection is "Neišsaugota"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () =>
        Promise.reject(new TypeError('offline')),
      ),
    );
    render(<ResultRow game={GAME} />);
    typeInto(homeBox(), '85');
    typeInto(awayBox(), '80');
    await leave(awayBox());
    expect(screen.getByRole('alert').textContent).toBe('Neišsaugota');
  });

  it('-1 : -1 saved shows "Atidėta" (R-63)', async () => {
    vi.stubGlobal('fetch', answer(200, { success: true }));
    render(<ResultRow game={GAME} />);
    expect(screen.queryByText('Atidėta')).toBeNull();
    typeInto(homeBox(), '-1');
    typeInto(awayBox(), '-1');
    await leave(awayBox());
    expect(screen.getByText('Atidėta')).toBeTruthy();
  });

  it("a future game's boxes are disabled", () => {
    render(<ResultRow game={{ ...GAME, open: false }} />);
    expect(homeBox().hasAttribute('disabled')).toBe(true);
    expect(awayBox().hasAttribute('disabled')).toBe(true);
  });

  it("an older save's answer arriving last is ignored, and a save clears an earlier refusal's message", async () => {
    const answers: ((response: Response) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
        async () =>
          new Promise<Response>((resolve) => {
            answers.push(resolve);
          }),
      ),
    );
    const answerCall = async (call: number, status: number, body: unknown) => {
      await act(async () => {
        answers[call]?.(Response.json(body, { status }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    const OUT_OF_RANGE = {
      message: 'Rezultatas turi būti nuo 50 iki 120.',
      errors: { awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'] },
    };
    render(<ResultRow game={GAME} />);
    typeInto(homeBox(), '90');
    typeInto(awayBox(), '8');
    await leave(awayBox());
    typeInto(awayBox(), '85');
    await leave(awayBox());
    await answerCall(1, 200, { success: true });
    await answerCall(0, 422, OUT_OF_RANGE);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(awayBox().className).toContain('border-ok');
    // A refusal, then a save of the corrected pair: no message left.
    typeInto(awayBox(), '8');
    await leave(awayBox());
    await answerCall(2, 422, OUT_OF_RANGE);
    expect(screen.getByRole('alert').textContent).toBe(
      'Rezultatas turi būti nuo 50 iki 120.',
    );
    typeInto(awayBox(), '86');
    await leave(awayBox());
    await answerCall(3, 200, { success: true });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
