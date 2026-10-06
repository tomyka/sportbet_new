import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SingleGameForm } from './single-game-form';

const FORM = {
  game: 9001,
  homeTeam: 'Zalgiris Kaunas',
  awayTeam: 'Real Madrid',
  home: '',
  away: '',
  min: 50,
  max: 120,
};

const answer = (status: number, body: unknown) =>
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () =>
    Promise.resolve(Response.json(body, { status })),
  );

async function submit(home: string, away: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Zalgiris Kaunas'), {
    target: { value: home },
  });
  fireEvent.change(screen.getByLabelText('Real Madrid'), {
    target: { value: away },
  });
  await act(async () => {
    fireEvent.submit(screen.getByTestId('single-game-form'));
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SingleGameForm (game-single.blade.php's form)", () => {
  it("saved: goes to the player's home", async () => {
    vi.stubGlobal(
      'fetch',
      answer(200, {
        success: true,
        home_odds: 0,
        draw_odds: 1,
        away_odds: 1,
        panel: { home: '50.0', away: '100.0', draw: '100.0' },
      }),
    );
    const go = vi.fn();
    render(<SingleGameForm form={FORM} go={go} />);
    await submit('88', '79');
    expect(go).toHaveBeenCalledWith('/');
  });

  it("refused: the server's message under the boxes, the button usable again", async () => {
    vi.stubGlobal(
      'fetch',
      answer(422, {
        message: 'Įveskite abu rezultatus.',
        errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
      }),
    );
    const go = vi.fn();
    render(<SingleGameForm form={FORM} go={go} />);
    await submit('88', '');
    expect(screen.getByRole('alert').textContent).toBe(
      'Įveskite abu rezultatus.',
    );
    expect(go).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Išsaugoti spėjimą' }),
    ).toHaveProperty('disabled', false);
  });
});
