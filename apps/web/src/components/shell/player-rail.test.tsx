import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { playerView } from '../../../tests/support/shell-views';
import type { NavEntry } from './nav-entries';
import { PlayerRail } from './player-rail';
import { SPORTBET_LINKS, type ShellLinks } from './shell-paths';
import { guestView, type PlayerShellView } from './shell-view';

// sportbet's RailNavigationTest and NavPredictionBadgeTest, for a player.
// The entries are what later slices will list; the filtering by flag is
// entriesFor's (nav-entries.test.ts).

const entry = (
  label: string,
  href: string,
  group: NavEntry['group'],
  badge?: NavEntry['badge'],
): NavEntry => ({
  label,
  href,
  icon: 'trophy',
  audience: 'player',
  group,
  surfaces: ['rail'],
  ...(badge === undefined ? {} : { badge }),
});

const ENTRIES: readonly NavEntry[] = [
  entry('Spėjimai', '/results', 'main', 'results'),
  entry('Prognozės', '/summary/results', 'summary'),
  entry('Lygos', '/leagues', 'league', 'invites'),
  entry('Taisyklės', '/rules', 'info'),
];

function renderRail(
  view: PlayerShellView = playerView(),
  entries: readonly NavEntry[] = ENTRIES,
  links: ShellLinks = SPORTBET_LINKS,
) {
  return render(<PlayerRail view={view} entries={entries} links={links} />);
}

const follows = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

describe('PlayerRail', () => {
  it("leads the brand to the game page (rail.blade.php: route('main'))", () => {
    renderRail();
    expect(
      screen.getByRole('link', { name: 'SportBet' }).getAttribute('href'),
    ).toBe('/main');
  });

  it('names the tournament above the navigation, with the way out (#69)', () => {
    renderRail();
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByText('Eurolyga 2026-27')).toBeDefined();
    expect(
      within(card)
        .getByRole('link', { name: 'Keisti turnyrą' })
        .getAttribute('href'),
    ).toBe('/tournaments/exit');
    expect(follows(card, screen.getByRole('link', { name: 'Spėjimai' }))).toBe(
      true,
    );
  });

  it("offers the player's leagues in the same card", () => {
    renderRail();
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByText('Lyga')).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Vieša' })).toBeDefined();
  });

  it("counts the player's pending invites on the league in the card", () => {
    renderRail(playerView({ badges: { ...guestView().badges, invites: 3 } }));
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByRole('button', { name: 'Vieša 3' })).toBeDefined();
  });

  // sportbet's partials/rail: a player in no league still gets the league
  // row, saying "Lyga".
  it('keeps the league row, saying Lyga, for a player in no league', () => {
    renderRail(playerView({ tournament: null, leagues: { items: [] } }));
    const card = screen.getByTestId('rail-context');
    expect(within(card).queryByText('Turnyras')).toBeNull();
    expect(within(card).getByText('Lyga', { selector: 'span' })).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Lyga' })).toBeDefined();
  });

  // Until slice 12 the app knows no leagues: nothing links to a page that
  // does not exist.
  it('draws no league row while leagues are not known, and no card with nothing in it', () => {
    renderRail(playerView({ leagues: null }));
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByText('Eurolyga 2026-27')).toBeDefined();
    expect(within(card).queryByText('Lyga')).toBeNull();
    cleanup();
    renderRail(playerView({ tournament: null, leagues: null }));
    expect(screen.queryByTestId('rail-context')).toBeNull();
  });

  it("lists its entries in sportbet's blocks, the summary under its label", () => {
    renderRail();
    const label = screen.getByText('Suvestinė');
    const link = (name: string) => screen.getByRole('link', { name });
    expect(follows(link('Spėjimai'), label)).toBe(true);
    expect(follows(label, link('Prognozės'))).toBe(true);
    expect(follows(link('Prognozės'), link('Lygos'))).toBe(true);
    expect(follows(link('Lygos'), link('Taisyklės'))).toBe(true);
  });

  it('has no summary label when there is no summary to show', () => {
    renderRail(
      playerView(),
      ENTRIES.filter(({ group }) => group !== 'summary'),
    );
    expect(screen.queryByText('Suvestinė')).toBeNull();
  });

  it('badges only the entry with something to do', () => {
    const { container } = renderRail(
      playerView({ badges: { ...guestView().badges, results: 2 } }),
    );
    expect(
      container
        .querySelector('[data-missing="results"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(
      container
        .querySelector('[data-missing="invites"]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
  });
});
