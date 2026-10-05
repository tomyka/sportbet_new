import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { playerView } from '../../../tests/support/shell-views';
import {
  NAV_ENTRIES,
  entriesFor,
  privacyHref,
  sectionsFor,
  type NavEntry,
  type NavSection,
} from './nav-entries';
import { guestView } from './shell-view';

// What later slices will list, to test the filtering 4a's one entry
// cannot show. Paths are illustrative.
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
const SUMMARY: NavEntry = {
  label: 'Prognozės',
  href: '/summary/results',
  icon: 'globe2',
  audience: 'player',
  group: 'summary',
  surfaces: ['rail', 'menu'],
  shownWhen: (view) => view.nav.summary,
};
const SURVIVAL_SUMMARY: NavEntry = {
  label: 'Išlikimas',
  href: '/summary/survivals',
  icon: 'globe2',
  audience: 'player',
  group: 'summary',
  surfaces: ['rail', 'menu'],
  shownWhen: (view) => view.nav.summary && view.nav.survivalSummary,
};
const PRIVACY: NavEntry = {
  label: 'Privatumas',
  href: '/privacy',
  icon: 'globe2',
  audience: 'guest',
  group: 'info',
  surfaces: ['rail'],
};
const FIXTURE: readonly NavEntry[] = [
  ...NAV_ENTRIES,
  SURVIVAL,
  SUMMARY,
  SURVIVAL_SUMMARY,
  PRIVACY,
];

const hrefsOf = (entries: readonly NavEntry[]) =>
  entries.map(({ href }) => href);

/** src/app, where each page's page.tsx lives at its path. */
const APP = join(import.meta.dirname, '..', '..', 'app');

describe('NAV_ENTRIES', () => {
  it('lists only Turnyrai in 4a, for a guest, on the rail', () => {
    expect(NAV_ENTRIES).toEqual([
      {
        label: 'Turnyrai',
        href: '/',
        icon: 'globe2',
        audience: 'guest',
        group: 'main',
        surfaces: ['rail'],
      },
    ]);
  });

  it('links only to pages that exist, so the shell never leads to a 404', () => {
    const missing = NAV_ENTRIES.filter(
      ({ href }) => !existsSync(join(APP, ...href.split('/'), 'page.tsx')),
    );
    expect(missing).toEqual([]);
  });
});

describe('entriesFor', () => {
  it("gives a guest the guest entries and a player the player's", () => {
    expect(hrefsOf(entriesFor(guestView(), 'rail', FIXTURE))).toEqual([
      '/',
      '/privacy',
    ]);
    expect(
      hrefsOf(
        entriesFor(
          playerView({
            nav: { survival: true, summary: false, survivalSummary: false },
          }),
          'rail',
          FIXTURE,
        ),
      ),
    ).toEqual(['/predictionSurvival']);
  });

  it('draws an entry only on its surfaces', () => {
    const view = playerView({
      nav: { survival: true, summary: true, survivalSummary: true },
    });
    expect(hrefsOf(entriesFor(view, 'tabs', FIXTURE))).toEqual([
      '/predictionSurvival',
    ]);
    expect(entriesFor(guestView(), 'pills', FIXTURE)).toEqual([]);
  });

  it('shows survival only in a tournament with a survival game', () => {
    const off = playerView();
    const on = playerView({
      nav: { survival: true, summary: false, survivalSummary: false },
    });
    expect(entriesFor(off, 'menu', FIXTURE)).toEqual([]);
    expect(entriesFor(on, 'menu', FIXTURE)).toEqual([SURVIVAL]);
  });

  it('shows the summary once there is one, and its survival line only with both flags', () => {
    const summaryOnly = playerView({
      nav: { survival: false, summary: true, survivalSummary: false },
    });
    const both = playerView({
      nav: { survival: false, summary: true, survivalSummary: true },
    });
    const survivalSummaryAlone = playerView({
      nav: { survival: false, summary: false, survivalSummary: true },
    });
    expect(entriesFor(summaryOnly, 'rail', FIXTURE)).toEqual([SUMMARY]);
    expect(entriesFor(both, 'rail', FIXTURE)).toEqual([
      SUMMARY,
      SURVIVAL_SUMMARY,
    ]);
    expect(entriesFor(survivalSummaryAlone, 'rail', FIXTURE)).toEqual([]);
  });

  it('defaults to NAV_ENTRIES', () => {
    expect(entriesFor(guestView(), 'rail')).toEqual(NAV_ENTRIES);
  });
});

describe('sectionsFor', () => {
  // A player's entry in every block, listed out of sportbet's block order
  // on purpose: the sections put them back in it.
  const player = (
    label: string,
    group: NavEntry['group'],
    surfaces: NavEntry['surfaces'] = ['rail', 'menu', 'tabs'],
  ): NavEntry => ({
    label,
    href: `/${label}`,
    icon: 'trophy',
    audience: 'player',
    group,
    surfaces,
  });
  const TAISYKLES = player('Taisyklės', 'info');
  const LYGOS = player('Lygos', 'league');
  const PROGNOZES = player('Prognozės', 'summary');
  const SPEJIMAI = player('Spėjimai', 'main');
  const EIGA = player('Eiga', 'main');
  const ALL = [TAISYKLES, LYGOS, PROGNOZES, SPEJIMAI, EIGA];

  const shape = (sections: readonly NavSection[]) =>
    sections.map(({ label, entries }) => [
      label,
      entries.map((entry) => entry.label),
    ]);

  it("gives the rail sportbet's blocks: the main one, Suvestinė, then the league and information entries", () => {
    expect(shape(sectionsFor(playerView(), 'rail', ALL))).toEqual([
      [null, ['Spėjimai', 'Eiga']],
      ['Suvestinė', ['Prognozės']],
      [null, ['Taisyklės', 'Lygos']],
    ]);
  });

  it('gives the phone menu its own labels and order: Spėjimai, Suvestinė, Informacija, Lyga', () => {
    expect(shape(sectionsFor(playerView(), 'menu', ALL))).toEqual([
      ['Spėjimai', ['Spėjimai', 'Eiga']],
      ['Suvestinė', ['Prognozės']],
      ['Informacija', ['Taisyklės']],
      ['Lyga', ['Lygos']],
    ]);
  });

  it('gives the bottom tabs one unlabelled row, in the order listed', () => {
    expect(shape(sectionsFor(playerView(), 'tabs', ALL))).toEqual([
      [null, ['Taisyklės', 'Lygos', 'Prognozės', 'Spėjimai', 'Eiga']],
    ]);
  });

  it('drops a block with nothing in it', () => {
    expect(shape(sectionsFor(playerView(), 'menu', [LYGOS, SPEJIMAI]))).toEqual(
      [
        ['Spėjimai', ['Spėjimai']],
        ['Lyga', ['Lygos']],
      ],
    );
    expect(sectionsFor(playerView(), 'tabs', [])).toEqual([]);
  });

  it("filters first, as entriesFor does: the view's audience, the surface, the flags", () => {
    expect(shape(sectionsFor(guestView(), 'rail', FIXTURE))).toEqual([
      [null, ['Turnyrai']],
      [null, ['Privatumas']],
    ]);
    expect(sectionsFor(playerView(), 'menu', FIXTURE)).toEqual([]);
    expect(sectionsFor(guestView(), 'pills', FIXTURE)).toEqual([]);
  });

  it('defaults to NAV_ENTRIES', () => {
    expect(sectionsFor(guestView(), 'rail')).toEqual([
      { label: null, entries: NAV_ENTRIES },
    ]);
  });
});

describe('privacyHref', () => {
  it('is the privacy page once it is listed, and nothing before', () => {
    expect(privacyHref()).toBeNull();
    expect(privacyHref(FIXTURE)).toBe('/privacy');
  });
});
