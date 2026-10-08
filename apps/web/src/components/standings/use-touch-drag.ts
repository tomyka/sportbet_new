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
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let finger: { x: number; y: number } | null = null;
    let dragged: string | null = null;
    let target: string | null = null;
    let frame: number | null = null;
    let touchedAt = Number.NEGATIVE_INFINITY;

    const teamAt = (x: number, y: number): string | null => {
      const found = document.elementFromPoint(x, y)?.closest(ROW);
      return found !== null && found !== undefined && element.contains(found)
        ? found.getAttribute('data-team')
        : null;
    };
    const track = () => {
      if (finger === null) return;
      const team = teamAt(finger.x, finger.y);
      target = team === dragged ? null : team;
      setOver(target);
    };
    const edgeScroll = () => {
      frame = null;
      if (dragged === null || finger === null) return;
      const dy =
        finger.y < EDGE_PX
          ? -EDGE_SPEED_PX
          : finger.y > window.innerHeight - EDGE_PX
            ? EDGE_SPEED_PX
            : 0;
      if (dy === 0) return;
      window.scrollBy(0, dy);
      track();
      frame = requestAnimationFrame(edgeScroll);
    };
    const reset = () => {
      if (pressTimer !== null) clearTimeout(pressTimer);
      pressTimer = null;
      start = null;
      finger = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      dragged = null;
      target = null;
      // Some phones start a native drag on a long press after touchcancel.
      touchedAt = Date.now();
      setCarried(null);
      setOver(null);
    };
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch === undefined) {
        reset();
        return;
      }
      const origin = event.target instanceof Element ? event.target : null;
      const row = origin?.closest(ROW);
      if (
        origin === null ||
        row === null ||
        row === undefined ||
        origin.closest('input, button, label') !== null
      ) {
        return;
      }
      touchedAt = Date.now();
      start = { x: touch.clientX, y: touch.clientY };
      const team = row.getAttribute('data-team');
      pressTimer = setTimeout(() => {
        pressTimer = null;
        dragged = team;
        setCarried(team);
        // Not every browser can vibrate (Safari has no vibrate).
        if ('vibrate' in navigator) navigator.vibrate(10);
      }, LONG_PRESS_MS);
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (start === null || touch === undefined) return;
      if (dragged === null) {
        if (
          Math.abs(touch.clientX - start.x) > SCROLL_SLOP_PX ||
          Math.abs(touch.clientY - start.y) > SCROLL_SLOP_PX
        ) {
          reset();
        }
        return;
      }
      event.preventDefault();
      finger = { x: touch.clientX, y: touch.clientY };
      track();
      frame ??= requestAnimationFrame(edgeScroll);
    };
    const onEnd = (event: TouchEvent) => {
      const from = dragged;
      const to = target;
      // No synthetic click after a drag.
      if (from !== null) event.preventDefault();
      reset();
      if (from !== null) drop.current(from, to);
    };
    const onMenu = (event: Event) => {
      if (dragged !== null || pressTimer !== null) event.preventDefault();
    };
    const onNativeDrag = (event: Event) => {
      if (Date.now() - touchedAt < TOUCH_DRAG_GUARD_MS) event.preventDefault();
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', reset);
    element.addEventListener('contextmenu', onMenu);
    element.addEventListener('dragstart', onNativeDrag);
    return () => {
      if (pressTimer !== null) clearTimeout(pressTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', reset);
      element.removeEventListener('contextmenu', onMenu);
      element.removeEventListener('dragstart', onNativeDrag);
    };
  }, [card, locked]);

  return { carried, over };
}
