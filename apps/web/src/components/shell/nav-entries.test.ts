import { existsSync, readFileSync } from 'node:fs';
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

// What later slices will list, to test the filtering the live entries
// cannot show. Paths are illustrative.
/** The live entries, as FIXTURE lists them first. */
function live(label: string): NavEntry {
  const entry = NAV_ENTRIES.find((each) => each.label === label);
  if (entry === undefined) throw new Error(`no entry ${label}`);
  return entry;
}
const TURNYRAI = live('Turnyrai');
const SPEJIMAI = live('Spėjimai');
const PRADZIA = live('Pradžia');
const LYDERIAI = live('Lyderiai');
const EIGA = live('Eiga');
const LYGOS_ENTRY = live('Lygos');
const TVARKYTI_ENTRY = live('Tvarkyti lygą');
/** The information entries (slice 18), by label, audience and surface: a guest's pill is not its rail entry. */
function info(
  label: string,
  audience: NavEntry['audience'],
  surface: NavEntry['surfaces'][number],
): NavEntry {
  const entry = NAV_ENTRIES.find(
    (each) =>
      each.label === label &&
      each.audience === audience &&
      each.surfaces.includes(surface),
  );
  if (entry === undefined) throw new Error('no entry ' + label);
  return entry;
}
const RULES_GUEST = info('Taisyklės', 'guest', 'rail');
const HELP_GUEST = info('Pagalba', 'guest', 'rail');
const CHARITY_GUEST = info('Jaunimo linija', 'guest', 'rail');
const CHARITY_PILL = info('Jaunimo linija', 'guest', 'pills');
const RULES_PLAYER = info('Taisyklės', 'player', 'rail');
const HELP_PLAYER = info('Pagalba', 'player', 'rail');
const CHARITY_PLAYER = info('Jaunimo linija', 'player', 'rail');
const PRIVACY_GUEST = info('Privatumas', 'guest', 'rail');
const PRIVACY_PLAYER = info('Privatumas', 'player', 'rail');
const PLAYER_INFO = [RULES_PLAYER, HELP_PLAYER, CHARITY_PLAYER, PRIVACY_PLAYER];
/** A live entry by its address: both survival entries are "Išlikimas". */
function liveAt(href: string): NavEntry {
  const entry = NAV_ENTRIES.find((each) => each.href === href);
  if (entry === undefined) throw new Error(`no entry at ${href}`);
  return entry;
}
const SURVIVAL = liveAt('/prediction/predictionSurvival');
const SURVIVAL_SUMMARY = liveAt('/summary/predictionSurvivals');
const RESULTS_SUMMARY = liveAt('/summary/prediction/results');
const STANDINGS_SUMMARY = liveAt('/summary/prediction/standings');
const CHART = liveAt('/summary/chart');
const FIXTURE: readonly NavEntry[] = NAV_ENTRIES;

const hrefsOf = (entries: readonly NavEntry[]) =>
  entries.map(({ href }) => href);

/** src/app, where each page's page.tsx lives at its path. */
const APP = join(import.meta.dirname, '..', '..', 'app');

describe('NAV_ENTRIES', () => {
  it('lists Turnyrai for a guest on the rail, then Lyderiai on the rail and pills (slice 8), Pradžia for a player on the rail (slice 8), Spėjimai for a player with its badge (slice 6), Eiga with its own (slice 9), then survival (slice 10), and the summary block: Prognozės and Eiga (slice 11), the survival summary, and Lygos and Tvarkyti lygą with the invites badge (slice 12b)', () => {
    expect(NAV_ENTRIES).toEqual([
      {
        label: 'Turnyrai',
        href: '/',
        icon: 'globe2',
        audience: 'guest',
        group: 'main',
        surfaces: ['rail'],
      },
      {
        label: 'Lyderiai',
        href: '/leaderboard',
        icon: 'trophy-fill',
        audience: 'guest',
        group: 'main',
        surfaces: ['rail', 'pills'],
        shownWhen: LYDERIAI.shownWhen,
      },
      {
        label: 'Pradžia',
        href: '/main',
        icon: 'house',
        audience: 'player',
        group: 'main',
        surfaces: ['rail'],
      },
      {
        label: 'Spėjimai',
        href: '/prediction/results',
        icon: 'sports-basketball',
        audience: 'player',
        group: 'main',
        surfaces: ['rail', 'menu', 'tabs'],
        badge: 'results',
      },
      {
        label: 'Eiga',
        href: '/prediction/standings',
        icon: 'table',
        audience: 'player',
        group: 'main',
        surfaces: ['rail', 'menu', 'tabs'],
        badge: 'standings',
      },
      {
        label: 'Išlikimas',
        href: '/prediction/predictionSurvival',
        icon: 'bullseye',
        audience: 'player',
        group: 'main',
        surfaces: ['rail', 'menu', 'tabs'],
        badge: 'survival',
        shownWhen: SURVIVAL.shownWhen,
      },
      {
        label: 'Prognozės',
        href: '/summary/prediction/results',
        icon: 'list-check',
        audience: 'player',
        group: 'summary',
        surfaces: ['rail', 'menu'],
        shownWhen: RESULTS_SUMMARY.shownWhen,
      },
      {
        label: 'Eiga',
        href: '/summary/prediction/standings',
        icon: 'table',
        audience: 'player',
        group: 'summary',
        surfaces: ['rail', 'menu'],
        shownWhen: STANDINGS_SUMMARY.shownWhen,
      },
      {
        label: 'Išlikimas',
        href: '/summary/predictionSurvivals',
        icon: 'shield-check',
        audience: 'player',
        group: 'summary',
        surfaces: ['rail', 'menu'],
        shownWhen: SURVIVAL_SUMMARY.shownWhen,
      },
      {
        label: 'Grafikas',
        href: '/summary/chart',
        icon: 'bar-chart-line',
        audience: 'player',
        group: 'summary',
        surfaces: ['rail', 'menu'],
        shownWhen: CHART.shownWhen,
      },
      {
        label: 'Lygos',
        href: '/leagues',
        icon: 'trophy',
        audience: 'player',
        group: 'league',
        surfaces: ['rail'],
        badge: 'invites',
      },
      {
        label: 'Tvarkyti lygą',
        href: '/leagues',
        icon: 'gear',
        audience: 'player',
        group: 'league',
        surfaces: ['menu'],
        badge: 'invites',
      },
      {
        label: 'Taisyklės',
        href: '/rules',
        icon: 'journal-text',
        audience: 'player',
        group: 'info',
        surfaces: ['rail', 'menu'],
      },
      {
        label: 'Taisyklės',
        href: '/rules',
        icon: 'journal-text',
        audience: 'guest',
        group: 'main',
        surfaces: ['rail'],
      },
      {
        label: 'Pagalba',
        href: '/help',
        icon: 'question-circle',
        audience: 'player',
        group: 'info',
        surfaces: ['rail', 'menu'],
      },
      {
        label: 'Pagalba',
        href: '/help',
        icon: 'question-circle',
        audience: 'guest',
        group: 'info',
        surfaces: ['rail'],
      },
      {
        label: 'Jaunimo linija',
        href: '/charity',
        icon: 'heart',
        audience: 'player',
        group: 'info',
        surfaces: ['rail', 'menu'],
      },
      {
        label: 'Jaunimo linija',
        href: '/charity',
        icon: 'heart',
        audience: 'guest',
        group: 'info',
        surfaces: ['rail'],
      },
      {
        label: 'Jaunimo linija',
        href: '/charity',
        icon: 'heart-fill',
        audience: 'guest',
        group: 'info',
        surfaces: ['pills'],
      },
      {
        label: 'Privatumas',
        href: '/privacy',
        icon: 'shield-lock',
        audience: 'player',
        group: 'info',
        surfaces: ['rail', 'menu'],
      },
      {
        label: 'Privatumas',
        href: '/privacy',
        icon: 'shield-lock',
        audience: 'guest',
        group: 'info',
        surfaces: ['rail'],
      },
    ]);
  });

  it('shows the survival page while the round and the tournament play survival, and its summary while the summary shows and the tournament plays survival (NavVisibility)', () => {
    const flags = (
      survival: boolean,
      summary: boolean,
      survivalSummary: boolean,
    ) => playerView({ nav: { survival, summary, survivalSummary } });
    expect(SURVIVAL.shownWhen?.(flags(true, false, false))).toBe(true);
    expect(SURVIVAL.shownWhen?.(flags(false, true, true))).toBe(false);
    expect(SURVIVAL_SUMMARY.shownWhen?.(flags(false, true, true))).toBe(true);
    expect(SURVIVAL_SUMMARY.shownWhen?.(flags(true, true, false))).toBe(false);
    expect(SURVIVAL_SUMMARY.shownWhen?.(flags(true, false, true))).toBe(false);
  });

  it('links only to pages that exist, so the shell never leads to a 404', () => {
    const missing = NAV_ENTRIES.filter(
      ({ href }) => !existsSync(join(APP, ...href.split('/'), 'page.tsx')),
    );
    expect(missing).toEqual([]);
  });
});

describe('entriesFor', () => {
  it("gives a guest the guest entries and a player the player's: Spėjimai, Eiga, then survival", () => {
    expect(hrefsOf(entriesFor(guestView(), 'rail', FIXTURE))).toEqual([
      '/',
      '/rules',
      '/help',
      '/charity',
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
    ).toEqual([
      '/main',
      '/prediction/results',
      '/prediction/standings',
      '/prediction/predictionSurvival',
      '/leagues',
      '/rules',
      '/help',
      '/charity',
      '/privacy',
    ]);
  });

  it('draws an entry only on its surfaces', () => {
    const view = playerView({
      nav: { survival: true, summary: true, survivalSummary: true },
    });
    expect(hrefsOf(entriesFor(view, 'tabs', FIXTURE))).toEqual([
      '/prediction/results',
      '/prediction/standings',
      '/prediction/predictionSurvival',
    ]);
    expect(entriesFor(guestView(), 'pills', FIXTURE)).toEqual([CHARITY_PILL]);
  });

  it('shows survival only in a tournament with a survival game; Spėjimai and Eiga always', () => {
    const off = playerView();
    const on = playerView({
      nav: { survival: true, summary: false, survivalSummary: false },
    });
    expect(entriesFor(off, 'menu', FIXTURE)).toEqual([
      SPEJIMAI,
      EIGA,
      TVARKYTI_ENTRY,
      ...PLAYER_INFO,
    ]);
    expect(entriesFor(on, 'menu', FIXTURE)).toEqual([
      SPEJIMAI,
      EIGA,
      SURVIVAL,
      TVARKYTI_ENTRY,
      ...PLAYER_INFO,
    ]);
  });

  it('shows the summary once there is one, and its survival line only with both flags, after Spėjimai and Eiga', () => {
    const summaryOnly = playerView({
      nav: { survival: false, summary: true, survivalSummary: false },
    });
    const both = playerView({
      nav: { survival: false, summary: true, survivalSummary: true },
    });
    const survivalSummaryAlone = playerView({
      nav: { survival: false, summary: false, survivalSummary: true },
    });
    expect(entriesFor(summaryOnly, 'rail', FIXTURE)).toEqual([
      PRADZIA,
      SPEJIMAI,
      EIGA,
      RESULTS_SUMMARY,
      STANDINGS_SUMMARY,
      CHART,
      LYGOS_ENTRY,
      ...PLAYER_INFO,
    ]);
    expect(entriesFor(both, 'rail', FIXTURE)).toEqual([
      PRADZIA,
      SPEJIMAI,
      EIGA,
      RESULTS_SUMMARY,
      STANDINGS_SUMMARY,
      SURVIVAL_SUMMARY,
      CHART,
      LYGOS_ENTRY,
      ...PLAYER_INFO,
    ]);
    expect(entriesFor(survivalSummaryAlone, 'rail', FIXTURE)).toEqual([
      PRADZIA,
      SPEJIMAI,
      EIGA,
      LYGOS_ENTRY,
      ...PLAYER_INFO,
    ]);
  });

  it('the "Suvestinė" block lists Prognozės, Eiga, Išlikimas and Grafikas in sportbet\'s order, on the rail and the menu only, and only once the summary shows (NavVisibility::showSummary)', () => {
    const shown = playerView({
      nav: { survival: true, summary: true, survivalSummary: true },
    });
    const hidden = playerView({
      nav: { survival: true, summary: false, survivalSummary: false },
    });
    for (const surface of ['rail', 'menu'] as const) {
      const block = sectionsFor(shown, surface).find(
        ({ label }) => label === 'Suvestinė',
      );
      expect(block?.entries.map(({ label, href }) => [label, href])).toEqual([
        ['Prognozės', '/summary/prediction/results'],
        ['Eiga', '/summary/prediction/standings'],
        ['Išlikimas', '/summary/predictionSurvivals'],
        ['Grafikas', '/summary/chart'],
      ]);
      expect(
        sectionsFor(hidden, surface).some(({ label }) => label === 'Suvestinė'),
      ).toBe(false);
    }
    expect(
      entriesFor(shown, 'tabs').some(({ group }) => group === 'summary'),
    ).toBe(false);
  });

  it("defaults to NAV_ENTRIES: a guest's rail is Turnyrai, a player's Pradžia, Spėjimai, Eiga and Lygos, a player's menu Spėjimai, Eiga and Tvarkyti lygą, the tabs Spėjimai and Eiga", () => {
    expect(entriesFor(guestView(), 'rail')).toEqual([
      TURNYRAI,
      RULES_GUEST,
      HELP_GUEST,
      CHARITY_GUEST,
      PRIVACY_GUEST,
    ]);
    expect(entriesFor(playerView(), 'rail')).toEqual([
      PRADZIA,
      SPEJIMAI,
      EIGA,
      LYGOS_ENTRY,
      ...PLAYER_INFO,
    ]);
    expect(entriesFor(playerView(), 'menu')).toEqual([
      SPEJIMAI,
      EIGA,
      TVARKYTI_ENTRY,
      ...PLAYER_INFO,
    ]);
    expect(entriesFor(playerView(), 'tabs')).toEqual([SPEJIMAI, EIGA]);
  });
});

describe('Lyderiai (rail-guest.blade.php, header.blade.php)', () => {
  it('is offered to a guest, on the rail after Turnyrai and as a pill, only once the leaderboard has entries (issue 131)', () => {
    const offered = { ...guestView(), leaderboardOffered: true };
    const others = [RULES_GUEST, HELP_GUEST, CHARITY_GUEST, PRIVACY_GUEST];
    expect(entriesFor(guestView(), 'rail')).toEqual([TURNYRAI, ...others]);
    expect(entriesFor(guestView(), 'pills')).toEqual([CHARITY_PILL]);
    expect(entriesFor(offered, 'rail')).toEqual([
      TURNYRAI,
      LYDERIAI,
      ...others,
    ]);
    expect(entriesFor(offered, 'pills')).toEqual([LYDERIAI, CHARITY_PILL]);
  });

  it('is not a player entry', () => {
    expect(
      entriesFor(playerView({ leaderboardOffered: true }), 'rail'),
    ).not.toContain(LYDERIAI);
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
      [null, ['Turnyrai', 'Taisyklės']],
      [null, ['Pagalba', 'Jaunimo linija', 'Privatumas']],
    ]);
    expect(shape(sectionsFor(playerView(), 'menu', FIXTURE))).toEqual([
      ['Spėjimai', ['Spėjimai', 'Eiga']],
      ['Informacija', ['Taisyklės', 'Pagalba', 'Jaunimo linija', 'Privatumas']],
      ['Lyga', ['Tvarkyti lygą']],
    ]);
    expect(sectionsFor(guestView(), 'pills', FIXTURE)).toEqual([
      { label: null, entries: [CHARITY_PILL] },
    ]);
  });

  it("defaults to NAV_ENTRIES: a guest's rail block is Turnyrai", () => {
    expect(sectionsFor(guestView(), 'rail')).toEqual([
      { label: null, entries: [TURNYRAI, RULES_GUEST] },
      { label: null, entries: [HELP_GUEST, CHARITY_GUEST, PRIVACY_GUEST] },
    ]);
  });
});

describe('Lygos and Tvarkyti lygą (partials/rail.blade.php:78, header.blade.php:128)', () => {
  it('are one page for a player: "Lygos" on the rail after its separator, "Tvarkyti lygą" in the phone menu block "Lyga", each with the invites badge', () => {
    expect(LYGOS_ENTRY).toMatchObject({
      href: '/leagues',
      icon: 'trophy',
      group: 'league',
      surfaces: ['rail'],
      badge: 'invites',
    });
    expect(TVARKYTI_ENTRY).toMatchObject({
      href: '/leagues',
      icon: 'gear',
      group: 'league',
      surfaces: ['menu'],
      badge: 'invites',
    });
    const rail = sectionsFor(playerView(), 'rail');
    expect(rail.at(-1)?.entries).toEqual([LYGOS_ENTRY, ...PLAYER_INFO]);
    const menu = sectionsFor(playerView(), 'menu');
    expect(menu.at(-1)).toEqual({ label: 'Lyga', entries: [TVARKYTI_ENTRY] });
  });

  it('are not offered to a guest, nor on the bottom tabs', () => {
    for (const surface of ['rail', 'menu', 'tabs', 'pills'] as const) {
      expect(entriesFor(guestView(), surface)).not.toContain(LYGOS_ENTRY);
      expect(entriesFor(guestView(), surface)).not.toContain(TVARKYTI_ENTRY);
    }
    expect(entriesFor(playerView(), 'tabs')).not.toContain(LYGOS_ENTRY);
  });
});

describe('privacyHref', () => {
  it('is the privacy page once it is listed, and nothing before', () => {
    expect(privacyHref([])).toBeNull();
    expect(privacyHref()).toBe('/privacy');
    expect(privacyHref(FIXTURE)).toBe('/privacy');
  });
});

describe('the information entries (slice 18, #35)', () => {
  it('a player has Taisyklės, Pagalba and Jaunimo linija after Lygos on the rail and in the menu block "Informacija" (partials/rail.blade.php:84-98)', () => {
    expect(PLAYER_INFO.map((entry) => [entry.label, entry.href])).toEqual([
      ['Taisyklės', '/rules'],
      ['Pagalba', '/help'],
      ['Jaunimo linija', '/charity'],
      ['Privatumas', '/privacy'],
    ]);
    for (const entry of PLAYER_INFO) {
      expect(entry).toMatchObject({
        group: 'info',
        surfaces: ['rail', 'menu'],
      });
    }
    const menu = sectionsFor(playerView(), 'menu');
    expect(menu.find(({ label }) => label === 'Informacija')?.entries).toEqual(
      PLAYER_INFO,
    );
  });

  it("a guest has Taisyklės in the rail's first block after Lyderiai, and Pagalba and Jaunimo linija after the separator, on the rail only (rail-guest.blade.php:27-44)", () => {
    expect(RULES_GUEST).toMatchObject({ group: 'main', surfaces: ['rail'] });
    const offered = { ...guestView(), leaderboardOffered: true };
    expect(entriesFor(offered, 'rail').map(({ label }) => label)).toEqual([
      'Turnyrai',
      'Lyderiai',
      'Taisyklės',
      'Pagalba',
      'Jaunimo linija',
      'Privatumas',
    ]);
    expect(entriesFor(offered, 'menu')).toEqual([]);
    expect(entriesFor(offered, 'pills').map(({ label }) => label)).toEqual([
      'Lyderiai',
      'Jaunimo linija',
    ]);
  });

  it("a guest's phone pill is the filled heart (header.blade.php); a guest's menu has none (R-133 Q10)", () => {
    expect(CHARITY_PILL).toMatchObject({
      icon: 'heart-fill',
      href: '/charity',
    });
    expect(sectionsFor(guestView(), 'menu')).toEqual([]);
  });

  it('lists Privatumas for both audiences, after Jaunimo linija, with the lock (R-108: approved 2026-10-16)', () => {
    expect(PRIVACY_GUEST).toMatchObject({
      icon: 'shield-lock',
      href: '/privacy',
      surfaces: ['rail'],
    });
    expect(PRIVACY_PLAYER).toMatchObject({
      icon: 'shield-lock',
      surfaces: ['rail', 'menu'],
    });
  });
});

describe('the entries are written from shell-paths, once each', () => {
  const source = readFileSync(
    join(import.meta.dirname, 'nav-entries.ts'),
    'utf8',
  );

  it('writes no address of its own: every href is a shell-paths constant', () => {
    expect(source).not.toMatch(/href: '/);
    expect(source).not.toMatch(/'\/[a-z]*'/);
  });

  it('imports no content module: the shell reads paths from shell-paths only', () => {
    expect(source).not.toContain("from '../static/");
  });

  it('lists each information page once', () => {
    const labels = ['Taisyklės', 'Pagalba', 'Jaunimo linija', 'Privatumas'];
    for (const label of labels) {
      expect(source.split(`label: '${label}'`)).toHaveLength(2);
    }
  });
});
