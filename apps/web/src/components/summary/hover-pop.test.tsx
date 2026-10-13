import { act, fireEvent, render, screen } from '@testing-library/react';
import { must } from '../../../tests/support/found';
import { describe, expect, it, vi } from 'vitest';
import { HoverPop } from './hover-pop';

const open = () =>
  render(
    <HoverPop content={<b>Nugalėtojas 1.0</b>}>
      <span>trigger</span>
    </HoverPop>,
  );

const trigger = () => must(screen.getByText('trigger').parentElement);

describe("HoverPop (bootstrap's hover and focus popover)", () => {
  it('shows nothing until the trigger is hovered', () => {
    open();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hover shows the content in a tooltip the trigger describes, and leaving hides it', () => {
    open();
    fireEvent.mouseEnter(trigger());
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Nugalėtojas 1.0');
    expect(trigger().getAttribute('aria-describedby')).toBe(tip.id);
    fireEvent.mouseLeave(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger().hasAttribute('aria-describedby')).toBe(false);
  });

  it('keyboard focus shows it and blur hides it: the trigger takes focus', () => {
    open();
    expect(trigger().getAttribute('tabindex')).toBe('0');
    fireEvent.focus(trigger());
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.blur(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it("a scroll hides it, since the tooltip is placed at the trigger's spot", () => {
    open();
    fireEvent.mouseEnter(trigger());
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('is fixed at the trigger, centred above it, kept inside the screen', () => {
    open();
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 300,
      left: 0,
      top: 300,
      width: 20,
      height: 10,
      right: 20,
      bottom: 310,
      toJSON: () => ({}),
    });
    fireEvent.mouseEnter(trigger());
    const tip = screen.getByRole('tooltip');
    expect(tip.style.position).toBe('fixed');
    expect(tip.style.top).toBe('300px');
    // Centre 10px is too near the edge for a 160px tooltip: pushed in.
    expect(tip.style.left).toBe('100px');
  });
});
