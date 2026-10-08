import { useEffect, useRef, useState, type RefObject } from 'react';

/** psTouchDrag (issue 141): a long press starts a drag; moving first is a scroll. */
export const LONG_PRESS_MS = 350;
const SCROLL_SLOP_PX = 8;

/** A finger this near the screen's top or bottom scrolls the page under a live drag. */
const EDGE_PX = 60;
const EDGE_SPEED_PX = 12;

/** A native drag this soon after a touch is a phone's long press, which the touch drag owns. */
export const TOUCH_DRAG_GUARD_MS = 1500;

/** A draggable row: the element carrying its team's id. */
const ROW = '[data-team]';

interface Point {
  readonly x: number;
  readonly y: number;
}

/** What the gesture tells the hook: the row carried and the row under the finger. */
interface Shown {
  readonly carried: (team: string | null) => void;
  readonly over: (team: string | null) => void;
}

/** One card's touch gesture: a press becoming a drag, the finger tracked, the drop. */
class TouchGesture {
  readonly #card: HTMLElement;
  readonly #shown: Shown;
  readonly #drop: () => (team: string, target: string | null) => void;
  #pressTimer: ReturnType<typeof setTimeout> | null = null;
  #start: Point | null = null;
  #finger: Point | null = null;
  #dragged: string | null = null;
  #target: string | null = null;
  #frame: number | null = null;
  #touchedAt = Number.NEGATIVE_INFINITY;

  constructor(
    card: HTMLElement,
    shown: Shown,
    drop: () => (team: string, target: string | null) => void,
  ) {
    this.#card = card;
    this.#shown = shown;
    this.#drop = drop;
  }

  readonly start = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch === undefined) {
      this.reset();
      return;
    }
    const team = this.#pressedRow(event.target);
    if (team === undefined) return;
    this.#touchedAt = Date.now();
    this.#start = { x: touch.clientX, y: touch.clientY };
    this.#pressTimer = setTimeout(() => {
      this.#pressTimer = null;
      this.#dragged = team;
      this.#shown.carried(team);
      // Not every browser can vibrate (Safari has no vibrate).
      if ('vibrate' in navigator) navigator.vibrate(10);
    }, LONG_PRESS_MS);
  };

  readonly move = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (this.#start === null || touch === undefined) return;
    if (this.#dragged === null) {
      if (beyondSlop(this.#start, touch)) this.reset();
      return;
    }
    event.preventDefault();
    this.#finger = { x: touch.clientX, y: touch.clientY };
    this.#track();
    this.#frame ??= requestAnimationFrame(this.#edgeScroll);
  };

  readonly end = (event: TouchEvent): void => {
    const from = this.#dragged;
    const to = this.#target;
    // No synthetic click after a drag.
    if (from !== null) event.preventDefault();
    this.reset();
    if (from !== null) this.#drop()(from, to);
  };

  readonly menu = (event: Event): void => {
    if (this.#dragged !== null || this.#pressTimer !== null) {
      event.preventDefault();
    }
  };

  readonly nativeDrag = (event: Event): void => {
    if (Date.now() - this.#touchedAt < TOUCH_DRAG_GUARD_MS) {
      event.preventDefault();
    }
  };

  readonly reset = (): void => {
    this.stop();
    this.#start = null;
    this.#finger = null;
    this.#dragged = null;
    this.#target = null;
    // Some phones start a native drag on a long press after touchcancel.
    this.#touchedAt = Date.now();
    this.#shown.carried(null);
    this.#shown.over(null);
  };

  /** The waiting press and the edge scroll cancelled. */
  stop(): void {
    if (this.#pressTimer !== null) clearTimeout(this.#pressTimer);
    this.#pressTimer = null;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  /** The team of the row a press starts on; none on an input, a button or a label. */
  #pressedRow(target: EventTarget | null): string | null | undefined {
    const origin = target instanceof Element ? target : null;
    const row = origin?.closest(ROW);
    if (
      origin === null ||
      row === null ||
      row === undefined ||
      origin.closest('input, button, label') !== null
    ) {
      return undefined;
    }
    return row.getAttribute('data-team');
  }

  #track(): void {
    if (this.#finger === null) return;
    const team = this.#teamAt(this.#finger);
    this.#target = team === this.#dragged ? null : team;
    this.#shown.over(this.#target);
  }

  #teamAt({ x, y }: Point): string | null {
    const found = document.elementFromPoint(x, y)?.closest(ROW);
    return found !== null && found !== undefined && this.#card.contains(found)
      ? found.getAttribute('data-team')
      : null;
  }

  readonly #edgeScroll = (): void => {
    this.#frame = null;
    if (this.#dragged === null || this.#finger === null) return;
    const dy = edgeSpeed(this.#finger.y);
    if (dy === 0) return;
    window.scrollBy(0, dy);
    this.#track();
    this.#frame = requestAnimationFrame(this.#edgeScroll);
  };
}

/** A finger moved further than the slop from where it pressed: a scroll. */
const beyondSlop = (start: Point, touch: Touch): boolean =>
  Math.abs(touch.clientX - start.x) > SCROLL_SLOP_PX ||
  Math.abs(touch.clientY - start.y) > SCROLL_SLOP_PX;

/** The page's scroll a frame for a finger near the screen's top or bottom edge. */
function edgeSpeed(y: number): number {
  if (y < EDGE_PX) return -EDGE_SPEED_PX;
  return y > window.innerHeight - EDGE_PX ? EDGE_SPEED_PX : 0;
}

/** The gesture's listeners on the card: touchmove the DOM's own and not passive, so a live drag holds the page still. */
function listen(card: HTMLElement, gesture: TouchGesture): () => void {
  card.addEventListener('touchstart', gesture.start, { passive: true });
  card.addEventListener('touchmove', gesture.move, { passive: false });
  card.addEventListener('touchend', gesture.end);
  card.addEventListener('touchcancel', gesture.reset);
  card.addEventListener('contextmenu', gesture.menu);
  card.addEventListener('dragstart', gesture.nativeDrag);
  return () => {
    gesture.stop();
    card.removeEventListener('touchstart', gesture.start);
    card.removeEventListener('touchmove', gesture.move);
    card.removeEventListener('touchend', gesture.end);
    card.removeEventListener('touchcancel', gesture.reset);
    card.removeEventListener('contextmenu', gesture.menu);
    card.removeEventListener('dragstart', gesture.nativeDrag);
  };
}

/**
 * standings.blade.php's psTouchDrag, on the rows (`data-team`) inside
 * `card`. Browsers fire no HTML5 drag for touch, so a long press (350 ms)
 * starts one; a finger that moves more than 8 px first is a scroll and is
 * left alone, and a press on an input, a button or a label is never a
 * drag. While a drag is live the page holds still (touchmove is cancelled,
 * so its listener is the DOM's own, not passive), the row under the finger
 * is `over`, and a finger near the top or bottom edge scrolls the page;
 * lifting it drops (`onDrop`). The browser's own menu is suppressed while
 * pressing or dragging, and a native dragstart within 1500 ms of a touch
 * is cancelled, as some phones start one on a long press. Closed
 * (`locked`): nothing.
 */
export function useTouchDrag(
  card: RefObject<HTMLElement | null>,
  {
    locked,
    onDrop,
  }: {
    readonly locked: boolean;
    readonly onDrop: (team: string, target: string | null) => void;
  },
): { readonly carried: string | null; readonly over: string | null } {
  const [carried, setCarried] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;

  useEffect(() => {
    const element = card.current;
    if (element === null || locked) return;
    const gesture = new TouchGesture(
      element,
      { carried: setCarried, over: setOver },
      () => drop.current,
    );
    return listen(element, gesture);
  }, [card, locked]);

  return { carried, over };
}
