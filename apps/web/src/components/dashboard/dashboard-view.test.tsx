import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DASHBOARD, NO_LEAGUE } from '../../../tests/support/dashboard';
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
    render(
      <DashboardView dashboard={DASHBOARD} league={NO_LEAGUE} flash={null} />,
    );
    expect(drawn()).toEqual([...PANELS]);
    expect(screen.getByText('3 turas')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();
    expect(screen.getByText('Taškų lentelė')).toBeDefined();
    expect(screen.getByText('Finalų dalyvių prognozės')).toBeDefined();
    expect(screen.getByText('Aktyvumas')).toBeDefined();
  });

  it("game page: the player's own row is the one highlighted", () => {
    render(
      <DashboardView dashboard={DASHBOARD} league={NO_LEAGUE} flash={null} />,
    );
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
        league={NO_LEAGUE}
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
        league={NO_LEAGUE}
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
      <DashboardView
        dashboard={{ ...DASHBOARD, medals: [] }}
        league={NO_LEAGUE}
        flash={null}
      />,
    );
    expect(drawn()).not.toContain('medals');
  });
});

describe('DashboardView: the league card (partials/fee and messages, R-122)', () => {
  const PANEL = {
    money: {
      state: 'due',
      feeText: '20,00',
      counts: { players: 3, expected: '60.00', collected: '0.00' },
      popup: { amount: '20,00', payment: null },
    },
    reward: null,
  } as const;

  it('draws the fee panel and the messages in one card above the progress line, with the flash before it', () => {
    render(
      <DashboardView
        dashboard={DASHBOARD}
        league={{ panel: PANEL, messages: ['Sveiki atvykę'] }}
        flash={{ kind: 'league-switched' }}
      />,
    );
    expect(drawn()).toEqual(['league', ...PANELS]);
    const card = document.querySelector('[data-panel="league"]');
    expect(card?.textContent).toContain(
      'Dalyvio mokestis 20,00 € dar nesumokėtas.',
    );
    expect(card?.textContent).toContain('Sveiki atvykę');
    const follows = (first: Element | null, second: Element | null) =>
      Boolean(
        first &&
        second &&
        first.compareDocumentPosition(second) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    expect(follows(screen.getByText('Lyga pakeista'), card)).toBe(true);
    expect(
      follows(card, document.querySelector('[data-panel="progress"]')),
    ).toBe(true);
  });

  it('a league with messages but no fee still shows its messages (R-122)', () => {
    render(
      <DashboardView
        dashboard={DASHBOARD}
        league={{ panel: null, messages: ['Be mokesčio'] }}
        flash={null}
      />,
    );
    expect(screen.getByText('Be mokesčio')).toBeDefined();
    expect(screen.queryByText(/mokestis/u)).toBeNull();
  });

  it('draws no card for a viewer with neither a panel nor a message', () => {
    render(
      <DashboardView dashboard={DASHBOARD} league={NO_LEAGUE} flash={null} />,
    );
    expect(drawn()).not.toContain('league');
  });

  it('a guest member under R-124 has only the reward and the messages', () => {
    render(
      <DashboardView
        dashboard={DASHBOARD}
        league={{
          panel: { money: null, reward: 'Prizas 100 €' },
          messages: ['Žinutė'],
        }}
        flash={null}
      />,
    );
    const card = document.querySelector('[data-panel="league"]');
    expect(card?.textContent).toBe('Prizas 100 €Žinutė');
  });
});
