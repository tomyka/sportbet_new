import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { routerSpies } from '../../../tests/support/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PredictionEditor } from './prediction-editor';

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

/** Types into a box and lets the save's promise settle. */
async function type(box: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(box, { target: { value } });
    await Promise.resolve();
  });
}

afterEach(() => {
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
