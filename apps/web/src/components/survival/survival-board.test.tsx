import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  nextFrame,
  stubbedSize,
  stubScrolling,
} from '../../../tests/support/scroll';
import type { BoardRow } from './board-view';
import { SurvivalBoard } from './survival-board';

// survivalRuns(): every run shares one scrollLeft, starts anchored at the
// right, and has arrows only while the runs overflow. jsdom lays nothing
// out, so each run's sizes are stubbed.

const row = (player: string, me = false): BoardRow => ({
  player,
  rank: 1,
  top: false,
  username: player,
  initials: player.slice(0, 1).toUpperCase(),
  me,
  tiles: [{ state: 'none', crest: null, title: '1 turas · nepasirinkta' }],
  streak: 0,
  total: '0',
});

beforeEach(() => {
  stubScrolling();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const runs = () => screen.getAllByTestId('survival-run');
const prev = () => screen.queryByRole('button', { name: 'Ankstesni turai' });
const next = () => screen.queryByRole('button', { name: 'Vėlesni turai' });

describe('SurvivalBoard (survivalRuns)', () => {
  it('runs that fit: no arrows', () => {
    Object.assign(stubbedSize, { scrollWidth: 300, clientWidth: 300 });
    render(<SurvivalBoard rows={[row('jonas'), row('petras')]} />);
    expect(prev()).toBeNull();
    expect(next()).toBeNull();
  });

  it('runs that overflow start at the right: "Ankstesni turai" only', () => {
    Object.assign(stubbedSize, { scrollWidth: 1000, clientWidth: 300 });
    render(<SurvivalBoard rows={[row('jonas'), row('petras')]} />);
    expect(runs().map((run) => run.scrollLeft)).toEqual([700, 700]);
    expect(prev()).not.toBeNull();
    expect(next()).toBeNull();
  });

  it('scrolling one run moves every run, and the arrows follow', async () => {
    Object.assign(stubbedSize, { scrollWidth: 1000, clientWidth: 300 });
    render(<SurvivalBoard rows={[row('jonas'), row('petras')]} />);
    // The board's own first move holds the mirror for one frame.
    await act(nextFrame);
    const [first, second] = runs();
    if (first === undefined || second === undefined) throw new Error('runs');
    act(() => {
      first.scrollLeft = 0;
      fireEvent.scroll(first);
    });
    expect(second.scrollLeft).toBe(0);
    expect(prev()).toBeNull();
    expect(next()).not.toBeNull();
  });

  it('an arrow moves every run by most of a screenful', () => {
    Object.assign(stubbedSize, { scrollWidth: 1000, clientWidth: 300 });
    render(<SurvivalBoard rows={[row('jonas'), row('petras')]} />);
    const button = prev();
    if (button === null) throw new Error('no arrow');
    act(() => {
      fireEvent.click(button);
    });
    // max(300 * 0.8, 112) = 240 to the left of 700.
    expect(runs().map((run) => run.scrollLeft)).toEqual([460, 460]);
    expect(next()).not.toBeNull();
  });
});
