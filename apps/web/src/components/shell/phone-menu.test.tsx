import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PhoneMenu } from './phone-menu';

function renderMenu() {
  render(
    <PhoneMenu bar="" brand={<span>SportBet</span>}>
      <a
        href="/elsewhere"
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        Kitur
      </a>
    </PhoneMenu>,
  );
  const button = screen.getByRole('button', { name: 'Atidaryti meniu' });
  const panel = document.getElementById('sbNavMobile');
  return { button, panel };
}

it('starts closed, its toggle naming the panel it opens', () => {
  const { button, panel } = renderMenu();
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(button.getAttribute('aria-controls')).toBe('sbNavMobile');
  expect(panel?.hidden).toBe(true);
});

it('opens and closes on its toggle', () => {
  const { button, panel } = renderMenu();
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(panel?.hidden).toBe(false);
  fireEvent.click(button);
  expect(panel?.hidden).toBe(true);
});

it('closes when a link in it is followed', () => {
  const { button, panel } = renderMenu();
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('link', { name: 'Kitur' }));
  expect(panel?.hidden).toBe(true);
});
