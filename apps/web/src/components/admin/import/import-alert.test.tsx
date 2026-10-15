import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ImportProblem } from '../../../server/import/problem';
import { ImportAlert, importedText, importProblemText } from './import-alert';

// sportbet's session('info') and session('error') of the import screen, and
// the exceptions its feed and importer threw, in the same words.

const PROBLEMS: readonly (readonly [ImportProblem, string])[] = [
  [{ kind: 'bad-season' }, 'Netinkamas sezono kodas.'],
  [
    { kind: 'unreachable' },
    'Nepavyko pasiekti Euroleague serverio. Bandykite dar kartą po kelių minučių.',
  ],
  [
    { kind: 'http-error', status: 404, season: 'E2031' },
    'Euroleague serveris grąžino klaidą (404). Patikrinkite sezono kodą E2031.',
  ],
  [{ kind: 'not-json' }, 'Euroleague atsakymo nepavyko perskaityti.'],
  [
    { kind: 'no-games' },
    'Euroleague atsakyme nėra rungtynių. Patikrinkite sezono kodą.',
  ],
  [
    { kind: 'malformed', number: 7, field: 'utcDate' },
    'Euroleague atsakymas netinkamas: rungtynėse nr. 7 trūksta lauko utcDate.',
  ],
  [{ kind: 'tournament-finished' }, 'Turnyras baigtas - keisti negalima.'],
  [
    { kind: 'duplicate-team-names', team: 'Real Madrid' },
    'Turnyre yra dvi vienodai vadinamos komandos: Real Madrid. Pervadinkite vieną iš jų ir bandykite dar kartą.',
  ],
  [
    { kind: 'unmatched-teams', teams: ['Zalgiris Kaunas', 'Real Madrid'] },
    'Šios komandos yra tvarkaraštyje, bet ne turnyre: Zalgiris Kaunas, Real Madrid. Pervadinkite jas turnyre taip pat, kaip vadinasi tvarkaraštyje, ir bandykite dar kartą. Niekas nebuvo importuota.',
  ],
  [
    { kind: 'round-not-regular', round: 3 },
    'Turas 3 jau yra ir nėra reguliariojo sezono.',
  ],
  [
    { kind: 'duplicate-fixture', round: 2, home: 'A', away: 'B' },
    'Euroleague atsakyme rungtynės kartojasi: 2 turas, A - B.',
  ],
  [
    { kind: 'plan-changed' },
    'Tvarkaraštis arba turnyras pasikeitė po peržiūros - peržiūrėkite dar kartą.',
  ],
  [{ kind: 'no-tournament' }, 'Turnyro nebėra.'],
];

describe('importProblemText', () => {
  it.each(PROBLEMS)(
    '%o is said as sportbet or the spec words it',
    (problem, text) => {
      expect(importProblemText(problem)).toBe(text);
    },
  );
});

describe('importedText', () => {
  const RESULT = {
    teams: 20,
    rounds: 2,
    games: 20,
    moved: 1,
    skipped: 3,
    players: 5,
    withoutCrest: [],
  };

  it("is sportbet's counts, without its crest count", () => {
    expect(importedText(RESULT)).toBe(
      'Importuota: 20 komandų, 2 turų, 20 naujų rungtynių, 1 perkeltų, 3 neperkeltų. Spėjimų eilutės sukurtos 5 žaidėjams.',
    );
  });

  it('names the teams with no crest, when there are any (R-96)', () => {
    expect(importedText({ ...RESULT, withoutCrest: ['Nauja', 'Kita'] })).toBe(
      'Importuota: 20 komandų, 2 turų, 20 naujų rungtynių, 1 perkeltų, 3 neperkeltų. Spėjimų eilutės sukurtos 5 žaidėjams. Komandos be logotipo: Nauja, Kita.',
    );
  });
});

describe('ImportAlert', () => {
  it('shows a result as a status and a refusal as an alert', () => {
    const { rerender } = render(
      <ImportAlert
        flash={{
          kind: 'imported',
          result: {
            teams: 1,
            rounds: 1,
            games: 1,
            moved: 0,
            skipped: 0,
            players: 0,
            withoutCrest: [],
          },
        }}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Importuota: 1');
    rerender(
      <ImportAlert
        flash={{ kind: 'import-refused', problem: { kind: 'plan-changed' } }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'pasikeitė po peržiūros',
    );
  });
});
