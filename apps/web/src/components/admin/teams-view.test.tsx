import type { AdminTeamsPage } from '@sportbet/db';
import { team } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamInsertView } from './team-insert-view';
import { FINISHED } from './tournament-fixtures';
import { TeamsView } from './teams-view';

const TOURNAMENT = FINISHED.tournament;

const PAGE: AdminTeamsPage = {
  teams: [
    {
      id: team('11'),
      name: 'Zalgiris Kaunas',
      outcome: {
        team: team('11'),
        place: 1,
        playOffs: true,
        finalFour: true,
        finalPlace: 1,
      },
    },
    {
      id: team('12'),
      name: 'Real Madrid',
      outcome: {
        team: team('12'),
        place: null,
        playOffs: false,
        finalFour: false,
        finalPlace: null,
      },
    },
  ],
  final: false,
};

const SUPERADMIN = { rename: true, unmark: true };
const MANAGER = { rename: false, unmark: false };

const view = (
  may = SUPERADMIN,
  page: AdminTeamsPage = PAGE,
  tournament = TOURNAMENT,
) =>
  render(
    <TeamsView tournament={tournament} page={page} may={may} flash={null} />,
  );

describe('TeamsView (admin/teams.blade.php)', () => {
  it('teams: the title with the count and the tournament', () => {
    view();
    expect(screen.getByRole('heading', { name: /Komandos/ })).toBeTruthy();
    expect(screen.getByTestId('team-count').textContent).toBe('2');
    expect(screen.getByRole('note').textContent).toBe(
      'Turnyras: Euroleague 2025/26',
    );
  });

  it('teams: the facts form posts every row - id, place, ticks by row, final place - to the save route', () => {
    view();
    const form = screen.getByTestId('facts-form');
    expect(form.getAttribute('action')).toBe('/admin/teams/save');
    expect(form.getAttribute('method')).toBe('post');
    const [first, second] = screen.getAllByTestId('team-row');
    expect(
      [...(first?.querySelectorAll<HTMLInputElement>('input') ?? [])].map(
        (box) => [box.getAttribute('name'), box.value],
      ),
    ).toEqual([
      ['teamID', '11'],
      ['place', '1'],
      ['playOffs', '0'],
      ['finalFour', '0'],
      ['finalPlace', '1'],
    ]);
    expect(
      [
        ...(second?.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]',
        ) ?? []),
      ].map((box) => box.value),
    ).toEqual(['1', '1']);
  });

  it('teams: each row shows what was entered', () => {
    view();
    const row = within(screen.getAllByTestId('team-row')[0] ?? document.body);
    expect(row.getByLabelText('Zalgiris Kaunas: vieta')).toHaveProperty(
      'value',
      '1',
    );
    expect(
      row.getByLabelText('Zalgiris Kaunas: ketvirtfinalis'),
    ).toHaveProperty('checked', true);
    expect(row.getByLabelText('Zalgiris Kaunas: pusfinalis')).toHaveProperty(
      'checked',
      true,
    );
    expect(row.getByLabelText('Zalgiris Kaunas: finalo vieta')).toHaveProperty(
      'value',
      '1',
    );
    const blank = within(screen.getAllByTestId('team-row')[1] ?? document.body);
    expect(blank.getByLabelText('Real Madrid: vieta')).toHaveProperty(
      'value',
      '',
    );
    expect(blank.getByLabelText('Real Madrid: pusfinalis')).toHaveProperty(
      'checked',
      false,
    );
  });

  it('R-92: the final mark is a box of the form, ticked as stored, and "Išsaugoti" saves the table', () => {
    view(SUPERADMIN, { ...PAGE, final: true });
    expect(screen.getByLabelText('Galutinė lentelė')).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByLabelText('Galutinė lentelė').getAttribute('name')).toBe(
      'final',
    );
    expect(
      screen.getByRole('button', { name: 'Išsaugoti' }).getAttribute('type'),
    ).toBe('submit');
  });

  it('R-92: a results manager marks the table but cannot take the mark off - it stays as posted, and says why', () => {
    view(MANAGER, { ...PAGE, final: true });
    const box = screen.getByLabelText(/Galutinė lentelė/);
    expect(box).toHaveProperty('disabled', true);
    expect(box.getAttribute('name')).toBeNull();
    const hidden = document.querySelector('input[type="hidden"][name="final"]');
    expect(hidden).toHaveProperty('value', '1');
    expect(
      screen.getByText(/žymą gali nuimti tik superadministratorius/),
    ).toBeTruthy();
  });

  it('R-92: a results manager marking a table not yet final has an ordinary box', () => {
    view(MANAGER);
    const box = screen.getByLabelText('Galutinė lentelė');
    expect(box).toHaveProperty('disabled', false);
    expect(box.getAttribute('name')).toBe('final');
  });

  it("R-26: a superadmin's rows open the rename modal - the team's name to updateTeamDetails; a results manager has no such button", () => {
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Redaguoti komandą Real Madrid' }),
    );
    const dialog = within(
      screen.getByRole('dialog', { name: 'Redaguoti: Real Madrid' }),
    );
    expect(dialog.getByLabelText('Pavadinimas')).toHaveProperty(
      'value',
      'Real Madrid',
    );
    const form = dialog
      .getByRole('button', { name: 'Išsaugoti' })
      .closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/updateTeamDetails');
    expect(form?.querySelector('input[name="teamID"]')).toHaveProperty(
      'value',
      '12',
    );
    fireEvent.click(dialog.getByRole('button', { name: 'Atšaukti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('R-26: a results manager has no rename buttons', () => {
    view(MANAGER);
    expect(
      screen.queryByRole('button', { name: /Redaguoti komandą/ }),
    ).toBeNull();
  });

  it('R-92: marked final with a place missing, the form is held back with the reason and the typed places stay', () => {
    view();
    const facts = screen.getByTestId('facts-form');
    fireEvent.change(screen.getByLabelText('Real Madrid: vieta'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByLabelText('Galutinė lentelė'));
    expect(fireEvent.submit(facts)).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe(
      'Galutinė lentelė galima tik užpildžius visas vietas 1..2 be pasikartojimų.',
    );
    expect(screen.getByLabelText('Zalgiris Kaunas: vieta')).toHaveProperty(
      'value',
      '1',
    );
  });

  it('R-92: two teams at one place hold the form back, and a complete table goes through, clearing the reason', () => {
    view();
    const facts = screen.getByTestId('facts-form');
    const real = screen.getByLabelText('Real Madrid: vieta');
    fireEvent.change(real, { target: { value: '1' } });
    expect(fireEvent.submit(facts)).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe(
      'Dvi komandos negali turėti tos pačios vietos.',
    );
    fireEvent.change(real, { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Galutinė lentelė'));
    // The form's own handler runs first: the submission is let through if it left the event alone (jsdom cannot navigate, so it is held off after).
    const prevented: boolean[] = [];
    document.addEventListener(
      'submit',
      (event) => {
        prevented.push(event.defaultPrevented);
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.submit(facts);
    expect(prevented).toEqual([false]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('teams: with none, a superadmin sees the placeholder form and a results manager is told there are none', () => {
    view(SUPERADMIN, { teams: [], final: false });
    expect(screen.getByTestId('team-insert-form')).toBeTruthy();
    expect(screen.queryByTestId('facts-form')).toBeNull();
  });

  it('teams: a results manager with none is told', () => {
    view(MANAGER, { teams: [], final: false });
    expect(screen.queryByTestId('team-insert-form')).toBeNull();
    expect(screen.getByText('Šiame turnyre komandų dar nėra.')).toBeTruthy();
  });

  it('teams: with no tournament chosen, the warning only', () => {
    render(
      <TeamsView
        tournament={null}
        page={{ teams: [], final: false }}
        may={SUPERADMIN}
        flash={null}
      />,
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras',
    );
    expect(screen.queryByTestId('team-insert-form')).toBeNull();
  });

  it('teams: the one-time message is shown above the form', () => {
    render(
      <TeamsView
        tournament={TOURNAMENT}
        page={PAGE}
        may={SUPERADMIN}
        flash={{ kind: 'admin', message: 'places-incomplete', number: 20 }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Galutinė lentelė galima tik užpildžius visas vietas 1..20 be pasikartojimų.',
    );
  });
});

describe('TeamInsertView (admin/teaminsert.blade.php)', () => {
  it('insert: "Įveskite komandų kiekį:" from 2 to 64, posting teamCount to the insert route', () => {
    render(<TeamInsertView tournament={TOURNAMENT} flash={null} />);
    const box = screen.getByLabelText('Įveskite komandų kiekį:');
    expect(box.getAttribute('name')).toBe('teamCount');
    expect(box.getAttribute('min')).toBe('2');
    expect(box.getAttribute('max')).toBe('64');
    expect(box.closest('form')?.getAttribute('action')).toBe(
      '/admin/teaminsert/save',
    );
    expect(screen.getByRole('note').textContent).toBe(
      'Turnyras: Euroleague 2025/26',
    );
  });

  it('insert: with no tournament chosen, the warning and no form', () => {
    render(<TeamInsertView tournament={null} flash={null} />);
    expect(screen.queryByTestId('team-insert-form')).toBeNull();
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras',
    );
  });

  it('insert: a refused count is listed', () => {
    render(
      <TeamInsertView
        tournament={TOURNAMENT}
        flash={{
          kind: 'admin-invalid',
          problems: [{ field: 'teamCount', problem: 'below-minimum' }],
        }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Komandų kiekis');
  });
});
