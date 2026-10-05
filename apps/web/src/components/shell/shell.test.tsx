import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JONAS, playerView } from '../../../tests/support/shell-views';
import { NAV_ENTRIES, type NavEntry } from './nav-entries';
import { Shell } from './shell';
import { guestView } from './shell-view';

// sportbet's ShellNoRailLayoutTest and RailNavigationTest, for the frame:
// a guest gets the guest rail and the plain phone bar; a player the
// player rail, the menu and the bottom tabs.

const SURVIVAL: NavEntry = {
  label: 'Išlikimas',
  href: '/predictionSurvival',
  icon: 'trophy',
  audience: 'player',
  group: 'main',
  surfaces: ['rail', 'menu', 'tabs'],
  badge: 'survival',
  shownWhen: (view) => view.nav.survival,
};

afterEach(() => {
  localStorage.clear();
});

describe('Shell', () => {
  it("frames a guest's page: the guest rail, the plain phone bar, no tabs", () => {
    render(
      <Shell view={guestView()} adsenseClient={null}>
        <h1>Turinys</h1>
      </Shell>,
    );
    expect(
      within(screen.getByTestId('rail'))
        .getByRole('link', { name: 'Turnyrai' })
        .getAttribute('href'),
    ).toBe('/');
    expect(
      within(screen.getByTestId('rail')).queryByText('Paskyra'),
    ).toBeNull();
    expect(screen.getByTestId('phone-header')).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Atidaryti meniu' }),
    ).toBeNull();
    expect(screen.queryByTestId('bottom-tabs')).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        name: 'Turinys',
      }),
    ).toBeDefined();
  });

  it('asks a guest about cookies, without a privacy link while there is no privacy page', () => {
    render(
      <Shell view={guestView()} adsenseClient={null}>
        <p />
      </Shell>,
    );
    expect(
      screen.getByTestId('cookie-consent').getAttribute('data-state'),
    ).toBe('asking');
    expect(
      screen.queryByRole('link', { name: 'privatumo politika' }),
    ).toBeNull();
  });

  it("frames a player's page: the player rail, the menu, the tabs", () => {
    render(
      <Shell view={playerView()} adsenseClient={null}>
        <p />
      </Shell>,
    );
    const rail = screen.getByTestId('rail');
    expect(within(rail).queryByRole('link', { name: 'Turnyrai' })).toBeNull();
    expect(within(rail).getByText('Paskyra')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Atidaryti meniu' }),
    ).toBeDefined();
    expect(screen.getByTestId('bottom-tabs')).toBeDefined();
  });

  it('draws a flagged entry on every surface once its flag is on, and nowhere before', () => {
    const entries = [...NAV_ENTRIES, SURVIVAL];
    const { unmount } = render(
      <Shell view={playerView()} adsenseClient={null} entries={entries}>
        <p />
      </Shell>,
    );
    expect(
      screen.queryAllByRole('link', { name: 'Išlikimas', hidden: true }),
    ).toHaveLength(0);
    unmount();

    render(
      <Shell
        view={playerView({
          nav: { survival: true, summary: false, survivalSummary: false },
        })}
        adsenseClient={null}
        entries={entries}
      >
        <p />
      </Shell>,
    );
    expect(
      screen.getAllByRole('link', { name: 'Išlikimas', hidden: true }),
    ).toHaveLength(3);
  });

  it('offers administration to an admin only, in the rail and the menu', () => {
    const { unmount } = render(
      <Shell view={playerView()} adsenseClient={null}>
        <p />
      </Shell>,
    );
    expect(
      screen.queryByRole('link', { name: 'Administravimas', hidden: true }),
    ).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Admin', hidden: true }),
    ).toBeNull();
    unmount();

    render(
      <Shell
        view={playerView({ player: { ...JONAS, isAdmin: true } })}
        adsenseClient={null}
      >
        <p />
      </Shell>,
    );
    expect(
      screen.getByRole('link', { name: 'Administravimas', hidden: true }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Admin', hidden: true }),
    ).toBeDefined();
  });
});
