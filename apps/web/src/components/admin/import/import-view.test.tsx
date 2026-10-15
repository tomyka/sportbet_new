import { seasonCodeSchema, type ImportPlan } from '@sportbet/domain';
import { at, gameNo, roundNo } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewState } from '../../../server/import/import';
import { RUNNING } from '../tournament-fixtures';
import { ImportFormView } from './import-form-view';
import { ImportPreviewView } from './import-preview-view';

// admin/import.blade.php: the form, and "Ką padarys importas".

const TOURNAMENT = RUNNING.tournament;
const FINGERPRINT = 'f'.repeat(64);

const EMPTY: ImportPlan = {
  teamsToCreate: [],
  roundsToCreate: [],
  gamesToCreate: [],
  moves: [],
  skippedMoves: [],
  unchanged: 0,
  dropped: [],
  postSeasonLeftOut: 0,
  teamsWithoutCrest: [],
  playersAffected: 0,
};

const planState = (plan: Partial<ImportPlan>): PreviewState => ({
  kind: 'plan',
  tournament: TOURNAMENT,
  season: seasonCodeSchema.parse('E2026'),
  plan: { ...EMPTY, ...plan },
  fingerprint: FINGERPRINT,
});

const preview = (state: PreviewState) =>
  render(<ImportPreviewView state={state} flash={null} />);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImportFormView', () => {
  it('asks for a season code, E2026 first, and previews it by GET: the preview writes nothing and no link prefetches it', () => {
    render(<ImportFormView tournament={TOURNAMENT} flash={null} />);
    expect(
      screen.getByRole('heading', { name: /Tvarkaraščio importas/ }),
    ).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain(TOURNAMENT.name);
    const season = screen.getByLabelText('Sezono kodas');
    expect(season.getAttribute('name')).toBe('season');
    expect(season.getAttribute('value')).toBe('E2026');
    expect(season.hasAttribute('required')).toBe(true);
    expect(screen.getByText('E2026 - 2026-27 sezonas')).toBeTruthy();
    const form = screen
      .getByRole('button', { name: /Peržiūrėti/ })
      .closest('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/admin/import/preview');
  });

  it('says what it does: it changes nothing until the admin imports, and only games not started move', () => {
    render(<ImportFormView tournament={TOURNAMENT} flash={null} />);
    const text = document.body.textContent;
    expect(text).toContain('Pirmiausia spauskite „Peržiūrėti"');
    expect(text).toContain('dublikatai nekuriami');
    expect(text).toContain('Perkeliamos tik dar neprasidėjusios');
  });

  it('shows the one-time message, and the season that was previewed', () => {
    render(
      <ImportFormView
        tournament={TOURNAMENT}
        season="E2031"
        flash={{ kind: 'import-refused', problem: { kind: 'bad-season' } }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Netinkamas sezono kodas.',
    );
    expect(screen.getByLabelText('Sezono kodas').getAttribute('value')).toBe(
      'E2031',
    );
  });

  it('without a tournament warns and offers no form', () => {
    render(<ImportFormView tournament={null} flash={null} />);
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras',
    );
    expect(screen.queryByLabelText('Sezono kodas')).toBeNull();
  });
});

describe('ImportPreviewView: a refusal', () => {
  it('shows the problem above the form, and no plan', () => {
    preview({
      kind: 'problem',
      tournament: TOURNAMENT,
      problem: { kind: 'unreachable' },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'Nepavyko pasiekti Euroleague serverio',
    );
    expect(screen.getByLabelText('Sezono kodas')).toBeTruthy();
    expect(screen.queryByText('Ką padarys importas')).toBeNull();
  });

  it('says for how long the previews are too many', () => {
    preview({ kind: 'throttled', tournament: TOURNAMENT, minutes: 2 });
    expect(screen.getByRole('alert').textContent).toContain('2 min.');
  });

  it('without a tournament warns', () => {
    preview({ kind: 'no-tournament' });
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras',
    );
  });

  it('shows a one-time message beside the plan (R-93: the fresh preview after a changed plan)', () => {
    render(
      <ImportPreviewView
        state={planState({ teamsToCreate: ['Real Madrid'] })}
        flash={{ kind: 'import-refused', problem: { kind: 'plan-changed' } }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'pasikeitė po peržiūros',
    );
    expect(screen.getByText('Ką padarys importas')).toBeTruthy();
  });
});

describe('ImportPreviewView: the plan', () => {
  it("lists sportbet's counts, the new teams by name, and the players who get rows", () => {
    preview(
      planState({
        teamsToCreate: ['Real Madrid', 'FC Barcelona'],
        roundsToCreate: [],
        gamesToCreate: [
          {
            round: roundNo(1),
            home: 'Real Madrid',
            away: 'FC Barcelona',
            tipOff: at('2026-09-24T16:00:00Z'),
          },
        ],
        unchanged: 7,
        playersAffected: 12,
      }),
    );
    expect(screen.getByText('Ką padarys importas')).toBeTruthy();
    const list = screen.getByTestId('import-counts');
    const text = list.textContent;
    expect(text).toContain('Naujos komandos: 2 - Real Madrid, FC Barcelona');
    expect(text).toContain('Nauji turai: 0');
    expect(text).toContain('Naujos rungtynės: 1');
    expect(text).toContain('Perkeltos rungtynės: 0');
    expect(text).toContain('Nepakitusios rungtynės: 7');
    expect(text).toContain(
      'Žaidėjai, kuriems bus sukurtos spėjimų eilutės: 12',
    );
    expect(text).not.toContain('Neperkeliamos');
    expect(text).not.toContain('Atkrintamųjų');
    expect(text).not.toContain('Tvarkaraštyje nebėra');
    expect(text).not.toContain('Komandos be logotipo');
    expect(screen.queryByText(/Viskas jau atnaujinta/)).toBeNull();
  });

  it('says nothing is to be changed when it would change nothing, and offers no import', () => {
    preview(planState({ unchanged: 20, playersAffected: 3 }));
    expect(
      screen.getByText('Viskas jau atnaujinta - nieko keisti nereikia.'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Importuoti/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('imports with the season and the fingerprint of this very plan, after asking (R-93)', () => {
    preview(planState({ teamsToCreate: ['Real Madrid'] }));
    const button = screen.getByRole('button', { name: /Importuoti/ });
    expect(button.hasAttribute('disabled')).toBe(false);
    const form = button.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/admin/import/save');
    expect(
      form?.querySelector('input[name="season"]')?.getAttribute('value'),
    ).toBe('E2026');
    expect(
      form?.querySelector('input[name="fingerprint"]')?.getAttribute('value'),
    ).toBe(FINGERPRINT);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(
      'Importuoti tvarkaraštį į šį turnyrą?',
    );
  });

  it('shows each moved game as it was and will be, in Vilnius time', () => {
    preview(
      planState({
        moves: [
          {
            game: gameNo(5),
            label: 'Real Madrid - FC Barcelona',
            from: at('2026-09-24T16:00:00Z'),
            to: at('2026-09-24T17:00:00Z'),
            lockedSince: null,
            postponed: false,
          },
        ],
      }),
    );
    const table = screen.getByTestId('import-moves');
    expect(within(table).getByText('Real Madrid - FC Barcelona')).toBeTruthy();
    expect(within(table).getByText('rugsėjo 24 d., 19:00')).toBeTruthy();
    expect(within(table).getByText('rugsėjo 24 d., 20:00')).toBeTruthy();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Rungtynės', 'Buvo', 'Bus']);
  });

  it("shows the games it will not move, with sportbet's note and the reason of each", () => {
    const skipped = (
      game: number,
      reason: 'scored' | 'postponed' | 'locked',
    ) => ({
      game: gameNo(game),
      label: `Namai ${String(game)} - Svečiai`,
      from: at('2026-09-24T16:00:00Z'),
      to: at('2026-09-25T16:00:00Z'),
      reason,
    });
    preview(
      planState({
        skippedMoves: [
          skipped(1, 'scored'),
          skipped(2, 'postponed'),
          skipped(3, 'locked'),
        ],
      }),
    );
    expect(screen.getByTestId('import-counts').textContent).toContain(
      'Neperkeliamos - jau užrakintos: 3',
    );
    const block = screen.getByTestId('import-skipped');
    expect(block.textContent).toContain(
      'Šių rungtynių data nebus pakeista: jos jau prasidėjo arba turi rezultatą, o spėjimai lieka tokie, kokie buvo.',
    );
    const rows = within(block).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Namai 1 - Svečiairugsėjo 24 d., 19:00rugsėjo 25 d., 19:00turi rezultatą',
      'Namai 2 - Svečiairugsėjo 24 d., 19:00rugsėjo 25 d., 19:00atidėtos',
      'Namai 3 - Svečiairugsėjo 24 d., 19:00rugsėjo 25 d., 19:00jau prasidėjo',
    ]);
  });

  it('lists the games the feed no longer has, never deleted (R-94), with the post-season count', () => {
    preview(
      planState({
        dropped: [
          {
            game: gameNo(9),
            label: 'Real Madrid - FC Barcelona',
            round: roundNo(3),
            tipOff: at('2026-10-10T17:30:00Z'),
          },
        ],
        postSeasonLeftOut: 6,
      }),
    );
    expect(screen.getByTestId('import-counts').textContent).toContain(
      'Atkrintamųjų rungtynių neimportuota: 6',
    );
    const block = screen.getByTestId('import-dropped');
    expect(block.textContent).toContain('Tvarkaraštyje nebėra');
    expect(block.textContent).toContain('3 turas');
    expect(block.textContent).toContain('Real Madrid - FC Barcelona');
    expect(block.textContent).toContain('spalio 10 d., 20:30');
  });

  it('names the teams that have no crest (R-96)', () => {
    preview(planState({ teamsWithoutCrest: ['Nauja', 'Kita'] }));
    expect(screen.getByTestId('import-counts').textContent).toContain(
      'Komandos be logotipo: 2 - Nauja, Kita',
    );
  });
});
