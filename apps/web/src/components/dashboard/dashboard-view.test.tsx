import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DASHBOARD } from '../../../tests/support/dashboard';
import { DashboardView } from './dashboard-view';

const PANELS = [
  'progress',
  'tiles',
  'fixture-deck',
  'league-table',
  'medals',
  'activity-feed',
  'games-list',
] as const;

const drawn = () =>
  [...document.querySelectorAll('[data-panel]')].map((panel) =>
    panel.getAttribute('data-panel'),
  );

describe("DashboardView: main.blade.php's game page", () => {
  it('game page: the progress line, the tiles, "Artimiausios rungtynės", "Taškų lentelė", the medals, "Aktyvumas" and "Visos rungtynės", in sportbet\'s order', () => {
    render(<DashboardView dashboard={DASHBOARD} flash={null} />);
    expect(drawn()).toEqual([...PANELS]);
    expect(screen.getByText('3 turas')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();
    expect(screen.getByText('Taškų lentelė')).toBeDefined();
    expect(screen.getByText('Finalų dalyvių prognozės')).toBeDefined();
    expect(screen.getByText('Aktyvumas')).toBeDefined();
  });

  it("game page: the player's own row is the one highlighted", () => {
    render(<DashboardView dashboard={DASHBOARD} flash={null} />);
    expect(
      screen
        .getByText('jonas')
        .closest('[data-testid="lb-row"]')
        ?.getAttribute('data-me'),
    ).toBe('true');
  });

  it('game page: the one-time message first', () => {
    render(
      <DashboardView
        dashboard={DASHBOARD}
        flash={{ kind: 'registered', tournament: 'Euroleague 2026/27' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Užsiregistravote į turnyrą: Euroleague 2026/27',
    );
    expect(
      screen
        .getByRole('status')
        .compareDocumentPosition(screen.getByText('3 turas')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('game page: no progress line without a current round, no medals before the first tip-off, no tiles for a player not listed, no games without a current round', () => {
    render(
      <DashboardView
        dashboard={{
          ...DASHBOARD,
          progress: null,
          medals: null,
          me: null,
          games: null,
        }}
        flash={null}
      />,
    );
    expect(drawn()).toEqual(['league-table', 'activity-feed']);
    expect(
      document.querySelector('[data-testid="lb-row"][data-me="true"]'),
    ).toBeNull();
  });

  it('game page: no medals panel while nobody has picked a final place', () => {
    render(
      <DashboardView dashboard={{ ...DASHBOARD, medals: [] }} flash={null} />,
    );
    expect(drawn()).not.toContain('medals');
  });
});
