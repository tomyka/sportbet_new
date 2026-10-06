import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardActionButton } from './card-action';

describe("CardActionButton: hub.blade.php's buttons", () => {
  it.each([
    ['play', 'Žaisti →'],
    ['join', 'Prisijungti →'],
    ['view', 'Peržiūrėti →'],
  ] as const)(
    "card: %s posts to the tournament's enter: %s",
    (action, label) => {
      render(<CardActionButton action={action} slug="euroleague-2026-27" />);
      const form = screen.getByRole('button', { name: label }).closest('form');
      expect(form?.getAttribute('method')).toBe('post');
      expect(form?.getAttribute('action')).toBe(
        '/tournament/euroleague-2026-27/enter',
      );
    },
  );

  it('card: register is a plain link to the form (never prefetched)', () => {
    render(<CardActionButton action="register" slug="euroleague-2027-28" />);
    const link = screen.getByRole('link', {
      name: 'Registruotis į turnyrą →',
    });
    expect(link.getAttribute('href')).toBe(
      '/tournament/euroleague-2027-28/register',
    );
  });

  it("card: view-results links to the tournament's page", () => {
    render(
      <CardActionButton action="view-results" slug="euroleague-2025-26" />,
    );
    expect(
      screen
        .getByRole('link', { name: 'Peržiūrėti rezultatus →' })
        .getAttribute('href'),
    ).toBe('/tournament/euroleague-2025-26');
  });
});
