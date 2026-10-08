import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LONG_PRESS_MS,
  TOUCH_DRAG_GUARD_MS,
  useTouchDrag,
} from './use-touch-drag';

/** Two rows in a card, the hook's state printed as "carried/over". */
function Harness({
  locked = false,
  onDrop,
}: {
  locked?: boolean;
  onDrop: (team: string, target: string | null) => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const { carried, over } = useTouchDrag(card, { locked, onDrop });
  return (
    <div ref={card}>
      <div data-team="1" data-testid="first">
        Olympiacos <button type="button">▲</button>
      </div>
      <div data-team="2" data-testid="second">
        Zalgiris
      </div>
      <output data-testid="state">{`${carried ?? '-'}/${over ?? '-'}`}</output>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;
const at = (x: number, y: number) => ({
  touches: [{ clientX: x, clientY: y }],
});

const press = (element: Element, x = 10, y = 100) => {
  act(() => {
    fireEvent.touchStart(element, at(x, y));
  });
};

const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTouchDrag (psTouchDrag, issue 141)', () => {
  it('a long press starts the drag, not a shorter one', () => {
    render(<Harness onDrop={vi.fn()} />);
    press(screen.getByTestId('first'));
    wait(LONG_PRESS_MS - 1);
    expect(state()).toBe('-/-');
    wait(1);
    expect(state()).toBe('1/-');
  });

  it('a finger that moves more than 8 px first is a scroll: no drag', () => {
    render(<Harness onDrop={vi.fn()} />);
    press(screen.getByTestId('first'));
    act(() => {
      fireEvent.touchMove(screen.getByTestId('first'), at(10, 109));
    });
    wait(LONG_PRESS_MS);
    expect(state()).toBe('-/-');
  });

  it('within 8 px the press still becomes a drag', () => {
    render(<Harness onDrop={vi.fn()} />);
    press(screen.getByTestId('first'));
    act(() => {
      fireEvent.touchMove(screen.getByTestId('first'), at(18, 108));
    });
    wait(LONG_PRESS_MS);
    expect(state()).toBe('1/-');
  });

  it('a press on a button is never a drag', () => {
    render(<Harness onDrop={vi.fn()} />);
    press(screen.getByRole('button'));
    wait(LONG_PRESS_MS);
    expect(state()).toBe('-/-');
  });

  it('a live drag holds the page still, marks the row under the finger, and drops there', () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const second = screen.getByTestId('second');
    document.elementFromPoint = vi.fn(() => second);
    press(screen.getByTestId('first'));
    wait(LONG_PRESS_MS);
    let scrolled = true;
    act(() => {
      scrolled = fireEvent.touchMove(screen.getByTestId('first'), at(10, 200));
    });
    expect(scrolled).toBe(false);
    expect(state()).toBe('1/2');
    act(() => {
      fireEvent.touchEnd(screen.getByTestId('first'), { touches: [] });
    });
    expect(onDrop).toHaveBeenCalledWith('1', '2');
    expect(state()).toBe('-/-');
  });

  it('a press that never became a drag drops nothing', () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    press(screen.getByTestId('first'));
    act(() => {
      fireEvent.touchEnd(screen.getByTestId('first'), { touches: [] });
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("the browser's own menu is suppressed while pressing or dragging, not after", () => {
    render(<Harness onDrop={vi.fn()} />);
    const first = screen.getByTestId('first');
    press(first);
    expect(fireEvent.contextMenu(first)).toBe(false);
    wait(LONG_PRESS_MS);
    expect(fireEvent.contextMenu(first)).toBe(false);
    act(() => {
      fireEvent.touchEnd(first, { touches: [] });
    });
    expect(fireEvent.contextMenu(first)).toBe(true);
  });

  it("a native dragstart within 1500 ms of a touch is the phone's long press: ignored", () => {
    render(<Harness onDrop={vi.fn()} />);
    const first = screen.getByTestId('first');
    press(first);
    act(() => {
      fireEvent.touchEnd(first, { touches: [] });
    });
    expect(fireEvent.dragStart(first)).toBe(false);
    wait(TOUCH_DRAG_GUARD_MS);
    expect(fireEvent.dragStart(first)).toBe(true);
  });

  it('closed: no drag at all', () => {
    render(<Harness locked onDrop={vi.fn()} />);
    press(screen.getByTestId('first'));
    wait(LONG_PRESS_MS);
    expect(state()).toBe('-/-');
  });
});
