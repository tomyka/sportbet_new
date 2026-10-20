import { leagueNo } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextSwitch } from './context-switch';
import type { ShellLeagues, ShellTournament } from './shell-view';

// The rail's and the phone menu's one control: the tournament over the
// league (sportbet's partials/rail-tournament and partials/league-switcher
// in one), opening a panel with both.

const TOURNAMENT: ShellTournament = {
  name: 'Eurolyga 2026-27 su labai ilgu pavadinimu',
  slug: 'euroleague-2026-27',
};

const LEAGUES: ShellLeagues = {
  items: [
    { id: leagueNo(7), name: 'Draugai', active: false },
    { id: leagueNo(3), name: 'Vieša', active: true },
    { id: leagueNo(9), name: 'Darbas', active: false },
  ],
};

const NONE_ACTIVE: ShellLeagues = {
  items: LEAGUES.items.map((league) => ({ ...league, active: false })),
};

const EXIT = '/tournaments/exit';

function renderSwitch(
  props: Partial<Parameters<typeof ContextSwitch>[0]> = {},
) {
  return render(
    <ContextSwitch
      tournament={TOURNAMENT}
      leagues={LEAGUES}
      exitHref={EXIT}
      invites={0}
      {...props}
    />,
  );
}

const control = () => screen.getByRole('button', { name: /Eurolyga/u });
const open = () => {
  fireEvent.click(control());
};
const panel = () => {
  const id = control().getAttribute('aria-controls');
  const found = id === null ? null : document.getElementById(id);
  if (found === null) throw new Error('no panel');
  return found;
};

describe('ContextSwitch, closed', () => {
  it('says the tournament over the active league, with a trophy and a chevron', () => {
    renderSwitch();
    const button = control();
    expect(button.textContent).toBe(`${TOURNAMENT.name} Vieša`);
    expect(button.querySelector('[data-icon="trophy"]')).not.toBeNull();
    expect(button.querySelector('[data-icon="chevron-expand"]')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('hidden')).toBe(true);
  });

  it('truncates both lines in the control', () => {
    renderSwitch();
    const face = within(control());
    expect(face.getByText(TOURNAMENT.name).className).toContain('truncate');
    expect(face.getByText('Vieša').className).toContain('truncate');
  });

  it('says "Lyga" when no league is active', () => {
    renderSwitch({ leagues: NONE_ACTIVE });
    expect(control().textContent).toBe(`${TOURNAMENT.name} Lyga`);
  });

  it('counts the pending invites on the control', () => {
    renderSwitch({ invites: 2 });
    const badge = control().querySelector('[data-invites]');
    expect(badge?.textContent).toBe('2');
  });

  it("names the invites in words for a screen reader, in sportbet's sentence", () => {
    renderSwitch({ invites: 2 });
    expect(
      screen.getByRole('button', {
        name: `${TOURNAMENT.name} Vieša Nepatvirtinti kvietimai į lygas: 2`,
      }),
    ).toBeDefined();
  });

  it('shows no count without pending invites', () => {
    const { container } = renderSwitch({ invites: 0 });
    expect(container.querySelector('[data-invites]')).toBeNull();
  });
});

describe('ContextSwitch, open', () => {
  it('opens on a click, naming the control as expanded over its panel', () => {
    renderSwitch();
    open();
    expect(control().getAttribute('aria-expanded')).toBe('true');
    expect(panel().hasAttribute('hidden')).toBe(false);
  });

  it('has a Turnyras section with the full name and the way out as a plain link', () => {
    renderSwitch();
    open();
    const section = within(panel());
    expect(section.getByText('Turnyras')).toBeDefined();
    expect(section.getByText(TOURNAMENT.name)).toBeDefined();
    const link = section.getByRole('link', { name: 'Keisti turnyrą' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(EXIT);
  });

  it('has a Lyga section listing every league in order, the active one ticked where it falls', () => {
    renderSwitch();
    open();
    const section = within(panel());
    expect(section.getByText('Lyga')).toBeDefined();
    expect(
      section.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Draugai', 'Vieša', 'Darbas']);
    const active = section.getByText('Vieša', {
      selector: '[aria-current="true"]',
    });
    expect(active.querySelector('[data-icon="check2"]')).not.toBeNull();
    expect(panel().querySelectorAll('[data-icon="check2"]')).toHaveLength(1);
  });

  it("switches by posting the league's id to /leagues/switch", () => {
    renderSwitch();
    open();
    const button = within(panel()).getByRole('button', { name: 'Draugai' });
    expect(button.getAttribute('type')).toBe('submit');
    const form = button.closest('form');
    expect(form?.getAttribute('action')).toBe('/leagues/switch');
    expect(form?.getAttribute('method')).toBe('post');
    expect(
      form?.querySelector('input[name="leagueID"]')?.getAttribute('value'),
    ).toBe('7');
  });

  it('lists every league with none ticked when none is active', () => {
    renderSwitch({ leagues: NONE_ACTIVE });
    open();
    expect(panel().querySelector('[aria-current]')).toBeNull();
    expect(panel().querySelector('[data-icon="check2"]')).toBeNull();
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(3);
  });

  it('closes on Escape, returning the focus to the control', () => {
    renderSwitch();
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(control().getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(control());
  });

  it('closes when focus leaves it for an element outside, and not when it moves inside', () => {
    render(
      <>
        <ContextSwitch
          tournament={TOURNAMENT}
          leagues={LEAGUES}
          exitHref={EXIT}
          invites={0}
        />
        <button type="button">Kita</button>
      </>,
    );
    open();
    const inside = within(panel()).getByRole('link', {
      name: 'Keisti turnyrą',
    });
    fireEvent.focusOut(control(), { relatedTarget: inside });
    expect(control().getAttribute('aria-expanded')).toBe('true');
    fireEvent.focusOut(inside, { relatedTarget: null });
    expect(control().getAttribute('aria-expanded')).toBe('true');
    fireEvent.focusOut(inside, {
      relatedTarget: screen.getByRole('button', { name: 'Kita' }),
    });
    expect(control().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a click outside it, and not on a click inside', () => {
    renderSwitch();
    open();
    fireEvent.click(panel());
    expect(control().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(document.body);
    expect(control().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('ContextSwitch with a section missing', () => {
  it('has only the league section without a tournament', () => {
    renderSwitch({ tournament: null });
    const button = screen.getByRole('button', { name: 'Vieša' });
    expect(button.textContent).toBe('Vieša');
    fireEvent.click(button);
    expect(screen.queryByText('Turnyras')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Keisti turnyrą' })).toBeNull();
    expect(screen.getByText('Lyga')).toBeDefined();
  });

  it('says "Lyga" for a player in no league and no tournament', () => {
    renderSwitch({ tournament: null, leagues: { items: [] } });
    expect(screen.getByRole('button', { name: 'Lyga' })).toBeDefined();
  });

  it('has only the tournament section without leagues', () => {
    renderSwitch({ leagues: null });
    expect(control().textContent).toBe(TOURNAMENT.name);
    open();
    expect(screen.queryByText('Lyga')).toBeNull();
    expect(
      within(panel()).getByRole('link', { name: 'Keisti turnyrą' }),
    ).toBeDefined();
  });

  it('is a plain card for a tournament with neither leagues nor a way out', () => {
    renderSwitch({ leagues: null, exitHref: null });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(TOURNAMENT.name)).toBeDefined();
    expect(document.querySelector('[data-icon="chevron-expand"]')).toBeNull();
  });

  it('leaves out the way out when there is none, keeping the leagues', () => {
    renderSwitch({ exitHref: null });
    open();
    expect(screen.queryByRole('link', { name: 'Keisti turnyrą' })).toBeNull();
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(3);
  });
});
