import type { LadderRow, StandingsPage } from '@sportbet/domain';
import { at, team } from '@sportbet/domain/testing';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ladder, REORDER_DELAY_MS } from './ladder';

const row = (
  id: number,
  name: string,
  over: Partial<LadderRow> = {},
): LadderRow => ({
  team: team(String(id)),
  name,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

const ROWS = [row(1, 'Olympiacos'), row(2, 'Zalgiris'), row(3, 'Real Madrid')];

const page = (over: Partial<StandingsPage> = {}): StandingsPage => ({
  rows: ROWS,
  placesSaved: false,
  counts: { places: 0, playOffs: 0, finalFour: 0, finalPlaces: 0 },
  totals: { places: 3, playOffs: 8, finalFour: 4, finalPlaces: 2 },
  closes: { state: 'open', at: at('2026-11-06T18:00:00Z') },
  ...over,
});

/** Every row's places saved, in ROWS' order. */
const saved = (rows: readonly LadderRow[] = ROWS): Partial<StandingsPage> => ({
  rows: rows.map((each, index) => ({ ...each, place: index + 1 })),
  placesSaved: true,
  counts: { places: rows.length, playOffs: 0, finalFour: 0, finalPlaces: 0 },
});

type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

/** A fetch that answers each post in turn (the last answer repeats). */
function answering(...answers: readonly [number, unknown][]) {
  let call = 0;
  const fetch = vi.fn<Fetch>(() => {
    const [status, body] = answers[Math.min(call, answers.length - 1)] ?? [
      200,
      { success: true },
    ];
    call += 1;
    return Promise.resolve(Response.json(body, { status }));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const OK: [number, unknown] = [200, { success: true }];

const posted = (fetch: ReturnType<typeof answering>) =>
  fetch.mock.calls.map(([path, init]) => [
    path,
    init?.body instanceof URLSearchParams ? init.body.toString() : '',
  ]);

const names = () =>
  screen
    .getAllByTestId('ladder-row')
    .map((each) => each.getAttribute('data-name'));

const ladderRow = (name: string) => {
  const found = screen
    .getAllByTestId('ladder-row')
    .find((each) => each.getAttribute('data-name') === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return within(found);
};

/** Lets the timers run `ms` and every answer settle. */
async function wait(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const press = async (label: string) => {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
  await wait();
};

/** Whether the box named `name` is ticked. */
const isChecked = (name: string) => {
  const box = screen.getByRole('checkbox', { name });
  return box instanceof HTMLInputElement && box.checked;
};

/** What the number box named `name` holds. */
const boxValue = (name: string) => {
  const box = screen.getByRole('spinbutton', { name });
  return box instanceof HTMLInputElement ? box.value : null;
};

const live = () => screen.getByRole('status').textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the arrows (issue 142)', () => {
  it('▲ on the first row and ▼ on the last are aria-disabled, never disabled while open', () => {
    answering(OK);
    render(<Ladder page={page()} />);
    const up = screen.getByRole('button', { name: 'Pakelti: Olympiacos' });
    const down = screen.getByRole('button', { name: 'Nuleisti: Real Madrid' });
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(down.getAttribute('aria-disabled')).toBe('true');
    expect(up.hasAttribute('disabled')).toBe(false);
    expect(
      screen
        .getByRole('button', { name: 'Nuleisti: Olympiacos' })
        .getAttribute('aria-disabled'),
    ).toBe('false');
  });

  it('a press at an end does nothing and posts nothing', async () => {
    const fetch = answering(OK);
    render(<Ladder page={page()} />);
    await press('Pakelti: Olympiacos');
    await wait(REORDER_DELAY_MS);
    expect(names()).toEqual(['Olympiacos', 'Zalgiris', 'Real Madrid']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('▼ moves the team and announces "Olympiacos - 2 vieta iš 3"; focus stays on its ▼', async () => {
    answering(OK);
    render(<Ladder page={page()} />);
    const down = screen.getByRole('button', { name: 'Nuleisti: Olympiacos' });
    down.focus();
    await press('Nuleisti: Olympiacos');
    expect(names()).toEqual(['Zalgiris', 'Olympiacos', 'Real Madrid']);
    await wait(50);
    expect(live()).toBe('Olympiacos - 2 vieta iš 3');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Nuleisti: Olympiacos',
    );
  });

  it('the order posts once, after the presses pause, as order[] top first', async () => {
    const fetch = answering(OK);
    render(<Ladder page={page()} />);
    await press('Nuleisti: Olympiacos');
    await press('Nuleisti: Olympiacos');
    await wait(REORDER_DELAY_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await wait(1);
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/reorder',
        'order%5B%5D=2&order%5B%5D=3&order%5B%5D=1',
      ],
    ]);
  });

  it('a refused order puts the last saved order back and says so', async () => {
    answering([422, { success: false, message: 'Prognozių laikas baigėsi.' }]);
    render(<Ladder page={page(saved())} />);
    await press('Pakelti: Real Madrid');
    expect(names()).toEqual(['Olympiacos', 'Real Madrid', 'Zalgiris']);
    await wait(REORDER_DELAY_MS);
    expect(names()).toEqual(['Olympiacos', 'Zalgiris', 'Real Madrid']);
    await wait(50);
    expect(live()).toBe('Tvarkos išsaugoti nepavyko, grąžinta ankstesnė.');
  });
});

describe('the rank column', () => {
  it('"-" while no place is saved; the row\'s number once they are', () => {
    answering(OK);
    const { unmount } = render(<Ladder page={page()} />);
    expect(ladderRow('Olympiacos').getByTestId('ladder-rank').textContent).toBe(
      '-',
    );
    unmount();
    render(<Ladder page={page(saved())} />);
    expect(ladderRow('Zalgiris').getByTestId('ladder-rank').textContent).toBe(
      '2',
    );
  });
});

describe('R-79: an unsaved ladder can be saved as shown', () => {
  it('says the table is not saved and offers "Išsaugoti šią tvarką"; the button posts the shown order and goes', async () => {
    const fetch = answering(OK);
    render(<Ladder page={page()} />);
    expect(
      screen.getByText(
        'Lentelė dar neišsaugota. Perkelkite komandą arba išsaugokite tvarką, kokią matote.',
      ),
    ).toBeDefined();
    await press('Išsaugoti šią tvarką');
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/reorder',
        'order%5B%5D=1&order%5B%5D=2&order%5B%5D=3',
      ],
    ]);
    expect(
      screen.queryByRole('button', { name: 'Išsaugoti šią tvarką' }),
    ).toBeNull();
    expect(screen.queryByText(/Lentelė dar neišsaugota/u)).toBeNull();
    expect(
      ladderRow('Real Madrid').getByTestId('ladder-rank').textContent,
    ).toBe('3');
    expect(screen.getByTestId('ladder-counters').textContent).toContain(
      'Vieta: 3 / 3',
    );
  });

  it('not offered once places are saved', () => {
    answering(OK);
    render(<Ladder page={page(saved())} />);
    expect(
      screen.queryByRole('button', { name: 'Išsaugoti šią tvarką' }),
    ).toBeNull();
  });
});

describe('the boxes (R-78)', () => {
  it('ticking 1/2 ticks 1/4 too, and posts both', async () => {
    const fetch = answering(OK);
    render(<Ladder page={page(saved())} />);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '1/2: Zalgiris' }));
    });
    await wait();
    expect(isChecked('1/4: Zalgiris')).toBe(true);
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/save',
        'teamID=2&groupPosition=2&quarterfinal=1&semifinal=1&final=',
      ],
    ]);
  });

  it('unticking 1/4 clears 1/2 and the final place', async () => {
    const fetch = answering(OK);
    render(
      <Ladder
        page={page({
          rows: [
            row(1, 'Olympiacos', {
              playOffs: true,
              finalFour: true,
              finalPlace: 1,
            }),
            ...ROWS.slice(1),
          ],
        })}
      />,
    );
    act(() => {
      fireEvent.click(
        screen.getByRole('checkbox', { name: '1/4: Olympiacos' }),
      );
    });
    await wait();
    expect(isChecked('1/2: Olympiacos')).toBe(false);
    expect(boxValue('F: Olympiacos')).toBe('');
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/save',
        'teamID=1&groupPosition=&quarterfinal=0&semifinal=0&final=',
      ],
    ]);
  });

  it('the final place is open only on a Final Four team, and posts the row', async () => {
    const fetch = answering(OK);
    render(
      <Ladder
        page={page({
          rows: [
            row(1, 'Olympiacos', { playOffs: true, finalFour: true }),
            ...ROWS.slice(1),
          ],
        })}
      />,
    );
    expect(
      screen
        .getByRole('spinbutton', { name: 'F: Zalgiris' })
        .hasAttribute('disabled'),
    ).toBe(true);
    act(() => {
      fireEvent.change(
        screen.getByRole('spinbutton', { name: 'F: Olympiacos' }),
        {
          target: { value: '1' },
        },
      );
    });
    await wait();
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/save',
        'teamID=1&groupPosition=&quarterfinal=1&semifinal=1&final=1',
      ],
    ]);
  });

  it('a final place an entry may not name (only 1 or 2) is not posted', async () => {
    const fetch = answering(OK);
    render(
      <Ladder
        page={page({
          rows: [
            row(1, 'Olympiacos', { playOffs: true, finalFour: true }),
            ...ROWS.slice(1),
          ],
        })}
      />,
    );
    const box = screen.getByRole('spinbutton', { name: 'F: Olympiacos' });
    expect([box.getAttribute('min'), box.getAttribute('max')]).toEqual([
      '1',
      '2',
    ]);
    act(() => {
      fireEvent.change(box, { target: { value: '3' } });
    });
    await wait();
    expect(fetch).not.toHaveBeenCalled();
    expect(boxValue('F: Olympiacos')).toBe('');
  });

  it('a refusal shows its message in the row and puts the row back; a save clears it', async () => {
    answering(
      [
        422,
        {
          message: 'Ši finalo vieta jau užimta kitos komandos.',
          errors: { teamID: ['Ši finalo vieta jau užimta kitos komandos.'] },
        },
      ],
      OK,
    );
    render(<Ladder page={page()} />);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '1/4: Zalgiris' }));
    });
    await wait();
    expect(ladderRow('Zalgiris').getByRole('alert').textContent).toBe(
      'Ši finalo vieta jau užimta kitos komandos.',
    );
    expect(isChecked('1/4: Zalgiris')).toBe(false);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '1/4: Zalgiris' }));
    });
    await wait();
    expect(ladderRow('Zalgiris').queryByRole('alert')).toBeNull();
  });
});

describe('a stored row that breaks the chain (R-78, keptChain)', () => {
  it('is posted kept to the chain: a final place without a Final Four tick is cleared', async () => {
    const fetch = answering(OK);
    render(
      <Ladder
        page={page({
          rows: [
            row(1, 'Olympiacos', {
              playOffs: false,
              finalFour: false,
              finalPlace: 1,
            }),
            ...ROWS.slice(1),
          ],
        })}
      />,
    );
    act(() => {
      fireEvent.click(
        screen.getByRole('checkbox', { name: '1/4: Olympiacos' }),
      );
    });
    await wait();
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/save',
        'teamID=1&groupPosition=&quarterfinal=1&semifinal=0&final=',
      ],
    ]);
    expect(boxValue('F: Olympiacos')).toBe('');
  });
});

describe('one queue (decision 5)', () => {
  it('a tick sends a waiting order first, then the row with its place as just saved', async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetch = vi.fn<Fetch>((path) =>
      path === '/prediction/standings/reorder'
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : Promise.resolve(Response.json({ success: true })),
    );
    vi.stubGlobal('fetch', fetch);
    render(<Ladder page={page(saved())} />);
    await press('Pakelti: Real Madrid');
    act(() => {
      fireEvent.click(
        screen.getByRole('checkbox', { name: '1/4: Real Madrid' }),
      );
    });
    await wait();
    // The order went at once; the row waits for its answer.
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/prediction/standings/reorder',
    ]);
    answer(Response.json({ success: true }));
    await wait();
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/reorder',
        'order%5B%5D=1&order%5B%5D=3&order%5B%5D=2',
      ],
      [
        '/prediction/standings/save',
        'teamID=3&groupPosition=2&quarterfinal=1&semifinal=0&final=',
      ],
    ]);
    await wait(REORDER_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('the counters', () => {
  it('"Vieta: x / N", "1/4: x / 8", "1/2: x / 4", "F: x / 2", following the boxes', async () => {
    answering(OK);
    render(<Ladder page={page(saved())} />);
    const counters = () => screen.getByTestId('ladder-counters').textContent;
    expect(counters()).toContain('Vieta: 3 / 3');
    expect(counters()).toContain('1/4: 0 / 8');
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '1/2: Zalgiris' }));
    });
    await wait();
    expect(counters()).toContain('1/4: 1 / 8');
    expect(counters()).toContain('1/2: 1 / 4');
    expect(counters()).toContain('F: 0 / 2');
  });
});

describe('closed', () => {
  it('every control disabled, nothing draggable, no grip, no R-79 button', () => {
    answering(OK);
    render(<Ladder page={page({ closes: { state: 'closed' } })} />);
    for (const each of screen.getAllByTestId('ladder-row')) {
      expect(each.getAttribute('draggable')).not.toBe('true');
      for (const control of each.querySelectorAll('input, button')) {
        expect(control.hasAttribute('disabled')).toBe(true);
      }
    }
    expect(screen.queryByTestId('ladder-grip')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Išsaugoti šią tvarką' }),
    ).toBeNull();
  });

  it('open rows are draggable, with a grip', () => {
    answering(OK);
    render(<Ladder page={page()} />);
    for (const each of screen.getAllByTestId('ladder-row')) {
      expect(each.getAttribute('draggable')).toBe('true');
    }
    expect(screen.getAllByTestId('ladder-grip')).toHaveLength(3);
  });
});

describe('a mouse drag', () => {
  it('drops a row where another is, and posts the order at once', async () => {
    const fetch = answering(OK);
    render(<Ladder page={page()} />);
    const rows = screen.getAllByTestId('ladder-row');
    const [first, , last] = rows;
    if (first === undefined || last === undefined) throw new Error('rows');
    // jsdom's drag events carry no DataTransfer: a stand-in.
    const dataTransfer = { effectAllowed: 'none', setData: () => undefined };
    act(() => {
      fireEvent.dragStart(last, { dataTransfer });
    });
    act(() => {
      fireEvent.dragOver(first, { dataTransfer });
    });
    act(() => {
      fireEvent.drop(first, { dataTransfer });
    });
    await wait();
    expect(names()).toEqual(['Real Madrid', 'Olympiacos', 'Zalgiris']);
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/reorder',
        'order%5B%5D=3&order%5B%5D=1&order%5B%5D=2',
      ],
    ]);
  });
});

describe('more of a row save (QA)', () => {
  // L5: the row is mended on load, as sportbet's enforceAllLimits unticks
  // a later stage without the earlier one: its Final Four tick is gone
  // before the player touches it, so ticking 1/4 posts 1/4 alone.
  it('a stored Final Four tick without a play-off tick is unticked on load; ticking 1/4 then posts 1/4 alone', async () => {
    const fetch = answering(OK);
    render(
      <Ladder
        page={page({
          rows: [
            row(1, 'Olympiacos', { playOffs: null, finalFour: true }),
            ...ROWS.slice(1),
          ],
        })}
      />,
    );
    expect(isChecked('1/2: Olympiacos')).toBe(false);
    act(() => {
      fireEvent.click(
        screen.getByRole('checkbox', { name: '1/4: Olympiacos' }),
      );
    });
    await wait();
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/save',
        'teamID=1&groupPosition=&quarterfinal=1&semifinal=0&final=',
      ],
    ]);
    expect(isChecked('1/2: Olympiacos')).toBe(false);
  });

  it("a refusal {success: false, message} shows sportbet's text in the row, and the row goes back", async () => {
    answering([422, { success: false, message: 'Prognozių laikas baigėsi.' }]);
    render(<Ladder page={page()} />);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '1/2: Zalgiris' }));
    });
    await wait();
    expect(ladderRow('Zalgiris').getByRole('alert').textContent).toBe(
      'Prognozių laikas baigėsi.',
    );
    expect(isChecked('1/2: Zalgiris')).toBe(false);
    expect(isChecked('1/4: Zalgiris')).toBe(false);
    expect(ladderRow('Olympiacos').queryByRole('alert')).toBeNull();
  });

  it('a lost connection shows "Spėjimas neišsaugotas. Bandykite dar kartą." in the row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<Fetch>(() => Promise.reject(new TypeError('offline'))),
    );
    render(<Ladder page={page()} />);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '1/4: Zalgiris' }));
    });
    await wait();
    expect(ladderRow('Zalgiris').getByRole('alert').textContent).toBe(
      'Spėjimas neišsaugotas. Bandykite dar kartą.',
    );
  });

  it('after a refused order, a row posts the place last saved, not the one shown before the refusal', async () => {
    const fetch = vi.fn<Fetch>((path) =>
      Promise.resolve(
        path === '/prediction/standings/reorder'
          ? Response.json(
              { success: false, message: 'Prognozių laikas baigėsi.' },
              { status: 422 },
            )
          : Response.json({ success: true }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    render(<Ladder page={page(saved())} />);
    await press('Pakelti: Real Madrid');
    act(() => {
      fireEvent.click(
        screen.getByRole('checkbox', { name: '1/4: Real Madrid' }),
      );
    });
    await wait();
    expect(posted(fetch)).toEqual([
      [
        '/prediction/standings/reorder',
        'order%5B%5D=1&order%5B%5D=3&order%5B%5D=2',
      ],
      [
        '/prediction/standings/save',
        'teamID=3&groupPosition=3&quarterfinal=1&semifinal=0&final=',
      ],
    ]);
    expect(names()).toEqual(['Olympiacos', 'Zalgiris', 'Real Madrid']);
  });
});

describe('the ladder with its touch drag (QA)', () => {
  it("a mouse dragstart within 1500 ms of a touch is the phone's long press: no drag, no order posted", async () => {
    const fetch = answering(OK);
    render(<Ladder page={page()} />);
    const [first, , last] = screen.getAllByTestId('ladder-row');
    if (first === undefined || last === undefined) throw new Error('rows');
    const dataTransfer = { effectAllowed: 'none', setData: () => undefined };
    act(() => {
      fireEvent.touchStart(last, {
        touches: [{ clientX: 10, clientY: 10 }],
      });
    });
    act(() => {
      fireEvent.touchEnd(last, { touches: [] });
    });
    act(() => {
      fireEvent.dragStart(last, { dataTransfer });
    });
    act(() => {
      fireEvent.dragOver(first, { dataTransfer });
    });
    act(() => {
      fireEvent.drop(first, { dataTransfer });
    });
    await wait();
    expect(names()).toEqual(['Olympiacos', 'Zalgiris', 'Real Madrid']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('the counters on load count the rows as mended (enforceAllLimits, then updateProgressCounters)', () => {
    answering(OK);
    render(
      <Ladder
        page={page({
          rows: [
            row(1, 'Olympiacos', {
              playOffs: false,
              finalFour: true,
              finalPlace: 1,
            }),
            ...ROWS.slice(1),
          ],
        })}
      />,
    );
    const counters = screen.getByTestId('ladder-counters').textContent;
    expect(counters).toContain('1/2: 0 / 4');
    expect(counters).toContain('F: 0 / 2');
    expect(boxValue('F: Olympiacos')).toBe('');
  });
});
