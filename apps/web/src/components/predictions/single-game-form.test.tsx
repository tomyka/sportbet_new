import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerSpies } from '../../../tests/support/router';
import { SingleGameForm } from './single-game-form';
import { SAVE_DELAY_MS } from './score-autosave';

// R-62: the single game saves as the list does - its plain score boxes and
// its autosave, the same marks and messages, and the player stays here.

const FORM = {
  game: 9001,
  homeTeam: 'Zalgiris Kaunas',
  awayTeam: 'Real Madrid',
  home: '',
  away: '',
};

const answer = (status: number, body: unknown) =>
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () =>
    Promise.resolve(Response.json(body, { status })),
  );

const SAVED = {
  success: true,
  home_odds: 0,
  draw_odds: 1,
  away_odds: 1,
  panel: { home: '50.0', away: '100.0', draw: '100.0' },
};

const homeBox = () => screen.getByLabelText('Zalgiris Kaunas');
const awayBox = () => screen.getByLabelText('Real Madrid');

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

describe("SingleGameForm (R-62: the list's boxes and autosave)", () => {
  it("the list's plain score boxes, and no button", () => {
    render(<SingleGameForm form={FORM} />);
    for (const box of [homeBox(), awayBox()]) {
      expect(box.getAttribute('type')).toBe('text');
      expect(box.getAttribute('inputmode')).toBe('numeric');
      expect(box.getAttribute('maxlength')).toBe('3');
      expect(box.className).toContain('w-[42px]');
    }
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a half-typed pair is not posted', async () => {
    const fetch = answer(200, SAVED);
    vi.stubGlobal('fetch', fetch);
    render(<SingleGameForm form={FORM} />);
    await type(homeBox(), '88');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('both boxes filled: saved as typed, the boxes green, the shell refreshed, and the player stays', async () => {
    const refresh = vi.fn();
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh, push }));
    const fetch = answer(200, SAVED);
    vi.stubGlobal('fetch', fetch);
    render(<SingleGameForm form={FORM} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(homeBox().className).toContain('border-ok');
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('both boxes emptied: posted, the boxes back to grey', async () => {
    vi.stubGlobal('fetch', answer(200, SAVED));
    render(<SingleGameForm form={{ ...FORM, home: '88', away: '79' }} />);
    await type(homeBox(), '');
    await type(awayBox(), '');
    expect(homeBox().className).toContain('border-border');
  });

  it('R-59: a refusal shows its own reason under the boxes, the boxes red; the 429 its text', async () => {
    for (const message of [
      'Šio mačo prognozuoti nebegalima.',
      'Per daug bandymų. Pabandykite dar kartą po 1 min.',
    ]) {
      vi.stubGlobal(
        'fetch',
        answer(message.startsWith('Per') ? 429 : 422, {
          success: false,
          message,
        }),
      );
      const { unmount } = render(<SingleGameForm form={FORM} />);
      await type(homeBox(), '88');
      await type(awayBox(), '79');
      expect(screen.getByRole('alert').textContent).toBe(message);
      expect(homeBox().className).toContain('border-bad');
      unmount();
    }
  });
});
