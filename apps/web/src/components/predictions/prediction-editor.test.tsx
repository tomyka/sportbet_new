import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { routerSpies } from '../../../tests/support/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PredictionEditor } from './prediction-editor';
import { SAVE_DELAY_MS } from './score-autosave';

const ROW = {
  game: 10,
  time: '21:00',
  home: 'Olympiacos',
  away: 'Zalgiris',
  predictedHome: '',
  predictedAway: '',
  locked: false,
  panel: { home: '50.0', away: '150.0' },
};

const answer = (status: number, body: unknown) =>
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () =>
    Promise.resolve(Response.json(body, { status })),
  );

const homeBox = () => screen.getByLabelText('Olympiacos');
const awayBox = () => screen.getByLabelText('Zalgiris');

/** Types into a box, pauses past the autosave's wait, and lets the save's promise settle. */
async function type(box: HTMLElement, value: string): Promise<void> {
  act(() => {
    fireEvent.change(box, { target: { value } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PredictionEditor (checkPrediction)', () => {
  it('a half-typed pair is not posted, and shows nothing', async () => {
    const fetch = answer(200, {});
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
  });

  it("both boxes filled: posted as sportbet's fields; saved, the boxes go green and the panel is the answer's", async () => {
    const refresh = vi.fn();
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh }));
    const fetch = answer(200, {
      success: true,
      home_odds: 1,
      draw_odds: 2.32,
      away_odds: 0,
      panel: { home: '100.0', away: '50.0', draw: '166.0' },
    });
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/prediction/results/save');
    const body = init?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body instanceof URLSearchParams ? body.toString() : '').toBe(
      'gameID=10&prediction_gameID=10&homeTeamScore=88&awayTeamScore=79',
    );
    expect(homeBox().className).toContain('border-ok');
    expect(refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Koeficientai' }));
    expect(screen.getByTestId('odds-panel').textContent).toContain('+100.0 pt');
    expect(screen.getByTestId('odds-panel').textContent).toContain('+50.0 pt');
  });

  it('both boxes emptied: posted, the boxes back to grey and the odds toggle gone', async () => {
    vi.stubGlobal(
      'fetch',
      answer(200, {
        success: true,
        home_odds: 0,
        draw_odds: 0,
        away_odds: 0,
        panel: { home: '50.0', away: '50.0', draw: '50.0' },
      }),
    );
    render(
      <PredictionEditor
        row={{ ...ROW, predictedHome: '88', predictedAway: '79' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Koeficientai' })).toBeDefined();
    await type(homeBox(), '');
    await type(awayBox(), '');
    expect(homeBox().className).toContain('border-border');
    expect(screen.queryByRole('button', { name: 'Koeficientai' })).toBeNull();
  });

  it("a field error shows the server's message under the row, the boxes red", async () => {
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
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '80');
    await type(awayBox(), '80');
    expect(screen.getByRole('alert').textContent).toBe(
      'Lygiosios negalimos - komandų rezultatai turi skirtis.',
    );
    expect(homeBox().className).toContain('border-bad');
  });

  it('R-59: a refused save shows its reason', async () => {
    vi.stubGlobal(
      'fetch',
      answer(422, {
        success: false,
        message: 'Šio mačo prognozuoti nebegalima.',
      }),
    );
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(screen.getByRole('alert').textContent).toBe(
      'Šio mačo prognozuoti nebegalima.',
    );
  });

  it('a lost connection shows "Spėjimas neišsaugotas. Bandykite dar kartą."', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () =>
        Promise.reject(new TypeError('offline')),
      ),
    );
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(screen.getByRole('alert').textContent).toBe(
      'Spėjimas neišsaugotas. Bandykite dar kartą.',
    );
  });

  it('a locked row: disabled boxes, dimmed, and nothing to type into', () => {
    render(
      <PredictionEditor
        row={{ ...ROW, locked: true, predictedHome: '88', predictedAway: '79' }}
      />,
    );
    expect(homeBox()).toHaveProperty('disabled', true);
    expect(awayBox()).toHaveProperty('disabled', true);
    expect(
      screen.getByTestId('prediction-row').firstElementChild?.className,
    ).toContain('opacity-50');
  });
});

describe('PredictionEditor: the autosave waits, and only the latest answer counts', () => {
  const SAVED = {
    success: true,
    home_odds: 1,
    draw_odds: 2,
    away_odds: 0,
    panel: { home: '100.0', away: '50.0', draw: '166.0' },
  };
  const OUT_OF_RANGE = {
    message: 'Rezultatas turi būti nuo 50 iki 120.',
    errors: { awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'] },
  };

  /** A fetch whose answers are given by hand, in any order. */
  function heldFetch() {
    const answers: ((response: Response) => void)[] = [];
    const fetch = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Promise<Response>((resolve) => {
          answers.push(resolve);
        }),
    );
    const answerCall = async (call: number, status: number, body: unknown) => {
      await act(async () => {
        answers[call]?.(Response.json(body, { status }));
        await vi.advanceTimersByTimeAsync(0);
      });
    };
    return { fetch, answerCall };
  }

  const bodyOf = (fetch: ReturnType<typeof answer>, call: number) => {
    const body = fetch.mock.calls[call]?.[1]?.body;
    return body instanceof URLSearchParams ? body.toString() : '';
  };

  it('typing "8" then "5" within the wait posts once, the whole number (c)', async () => {
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh: vi.fn() }));
    const fetch = answer(200, SAVED);
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={{ ...ROW, predictedHome: '90' }} />);
    act(() => {
      fireEvent.change(awayBox(), { target: { value: '8' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 100);
    });
    act(() => {
      fireEvent.change(awayBox(), { target: { value: '85' } });
    });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetch, 0)).toContain('homeTeamScore=90&awayTeamScore=85');
  });

  it('leaving the box, or Enter, posts at once, and only once (c)', async () => {
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh: vi.fn() }));
    const fetch = answer(200, SAVED);
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={{ ...ROW, predictedHome: '90' }} />);
    act(() => {
      fireEvent.change(awayBox(), { target: { value: '85' } });
    });
    await act(async () => {
      fireEvent.blur(awayBox());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.change(awayBox(), { target: { value: '86' } });
    });
    await act(async () => {
      fireEvent.keyDown(awayBox(), { key: 'Enter' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetch, 1)).toContain('awayTeamScore=86');
  });

  it("an older post's answer arriving last is ignored: 90:85 saved stays green, with no message (a)", async () => {
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh: vi.fn() }));
    const { fetch, answerCall } = heldFetch();
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={{ ...ROW, predictedHome: '90' }} />);
    await type(awayBox(), '8');
    await type(awayBox(), '85');
    expect(fetch).toHaveBeenCalledTimes(2);
    await answerCall(1, 200, SAVED);
    await answerCall(0, 422, OUT_OF_RANGE);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(awayBox().className).toContain('border-ok');
  });

  it('a refusal followed by a save leaves no message (b)', async () => {
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh: vi.fn() }));
    const { fetch, answerCall } = heldFetch();
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={{ ...ROW, predictedHome: '90' }} />);
    await type(awayBox(), '8');
    await answerCall(0, 422, OUT_OF_RANGE);
    expect(screen.getByRole('alert').textContent).toBe(
      'Rezultatas turi būti nuo 50 iki 120.',
    );
    await type(awayBox(), '85');
    await answerCall(1, 200, SAVED);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(awayBox().className).toContain('border-ok');
  });
});
