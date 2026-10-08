import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  fixtureRow,
  standingsView,
} from '../../../tests/support/standings-views';
import {
  LadderRowView,
  type ArrowFocus,
  type DragHandlers,
  type RowProps,
} from './ladder-row';
import type { LadderSession } from './ladder-session';

// One row of the ladder as drawn: rank, grip, name, arrows, boxes and a
// refused save's message - open, and once closed.

const session = (): LadderSession => ({
  state: vi.fn(),
  move: vi.fn(),
  drop: vi.fn(),
  saveShownOrder: vi.fn(),
  tick: vi.fn(),
  finalPlace: vi.fn(),
  dispose: vi.fn(),
});

const focus: ArrowFocus = {
  arrowRef: () => () => undefined,
  focusAfter: vi.fn(),
};

const drag: DragHandlers = {
  draggable: true,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
  onDragEnd: vi.fn(),
};

/** Olympiacos ticked for both stages, as an open or a closed page shows it. */
function rowOf(closes: 'open' | 'closed' = 'open') {
  const [row] = standingsView({
    rows: [
      fixtureRow(1, 'Olympiacos', { playOffs: true, finalFour: true }),
      fixtureRow(2, 'Zalgiris'),
    ],
    closes,
  }).rows;
  if (row === undefined) throw new Error('no row');
  return row;
}

const props = (over: Partial<RowProps> = {}): RowProps => ({
  row: rowOf(),
  rank: '1',
  ends: { first: true, last: false },
  reorderable: true,
  message: null,
  marked: { dragged: false, over: false },
  drag,
  focus,
  onNudge: vi.fn(),
  session: session(),
  ...over,
});

describe('LadderRowView, open', () => {
  it('the rank, the grip, the name, and the row draggable', () => {
    render(<LadderRowView {...props()} />);
    const row = screen.getByTestId('ladder-row');
    expect(screen.getByTestId('ladder-rank').textContent).toBe('1');
    expect(screen.getByTestId('ladder-grip')).toBeDefined();
    expect(row.getAttribute('data-name')).toBe('Olympiacos');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it("the arrows: named for the club, aria-disabled at the row's end, never disabled; a press nudges", () => {
    const onNudge = vi.fn();
    render(<LadderRowView {...props({ onNudge })} />);
    const up = screen.getByRole('button', { name: 'Pakelti: Olympiacos' });
    const down = screen.getByRole('button', { name: 'Nuleisti: Olympiacos' });
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(down.getAttribute('aria-disabled')).toBe('false');
    expect(up.hasAttribute('disabled')).toBe(false);
    fireEvent.click(down);
    expect(onNudge).toHaveBeenCalledWith('down');
  });

  it('the boxes: named for the club, ticked as the row is, open as the view says; a change goes to the session', () => {
    const rowSession = session();
    render(<LadderRowView {...props({ session: rowSession })} />);
    const playOffs = screen.getByRole('checkbox', { name: '1/4: Olympiacos' });
    const finalFour = screen.getByRole('checkbox', { name: '1/2: Olympiacos' });
    const final = screen.getByRole('spinbutton', { name: 'F: Olympiacos' });
    expect(playOffs instanceof HTMLInputElement && playOffs.checked).toBe(true);
    expect(finalFour instanceof HTMLInputElement && finalFour.checked).toBe(
      true,
    );
    // A Final Four team may name a final place (R-78).
    expect(final.hasAttribute('disabled')).toBe(false);
    fireEvent.click(finalFour);
    expect(rowSession.tick).toHaveBeenCalledWith(
      rowOf().team,
      'finalFour',
      false,
    );
  });

  it("a refused save's message under the row; none, nothing shown", () => {
    const { unmount } = render(
      <LadderRowView {...props({ message: 'Prognozių laikas baigėsi.' })} />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Prognozių laikas baigėsi.',
    );
    unmount();
    render(<LadderRowView {...props()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('carried by a drag, faded; the row a drag is over, tinted', () => {
    const { unmount } = render(
      <LadderRowView {...props({ marked: { dragged: true, over: false } })} />,
    );
    expect(screen.getByTestId('ladder-row').className).toContain('opacity-40');
    unmount();
    render(
      <LadderRowView {...props({ marked: { dragged: false, over: true } })} />,
    );
    expect(screen.getByTestId('ladder-row').className).toContain(
      'bg-accent-tint',
    );
  });
});

describe('LadderRowView, closed', () => {
  it('every control disabled, no grip, nothing draggable', () => {
    render(
      <LadderRowView
        {...props({ row: rowOf('closed'), reorderable: false, drag: null })}
      />,
    );
    const row = screen.getByTestId('ladder-row');
    expect(row.getAttribute('draggable')).toBeNull();
    expect(screen.queryByTestId('ladder-grip')).toBeNull();
    for (const control of row.querySelectorAll('input, button')) {
      expect(control.hasAttribute('disabled')).toBe(true);
    }
  });
});
