import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FINISHED, RUNNING } from './tournament-fixtures';
import { TournamentFormView } from './tournament-form-view';

const field = (label: string) => screen.getByLabelText(label);

describe('TournamentFormView (admin/tournaments/form.blade.php)', () => {
  it('create: "Naujas turnyras", empty, public by default, posting to the store route', () => {
    render(<TournamentFormView existing={null} flash={null} />);
    expect(
      screen.getByRole('heading', { name: 'Naujas turnyras' }),
    ).toBeTruthy();
    const form = screen
      .getByRole('button', { name: 'Sukurti' })
      .closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/admin/tournaments/save');
    expect(field('Pavadinimas')).toHaveProperty('value', '');
    expect(field('Viešas')).toHaveProperty('checked', true);
    expect(field('Išlikimas')).toHaveProperty('checked', false);
    expect(field('Statusas')).toHaveProperty('value', 'upcoming');
  });

  it('create: boxes post the names adminStore reads', () => {
    render(<TournamentFormView existing={null} flash={null} />);
    const names = [...document.querySelectorAll('input, select, textarea')].map(
      (box) => box.getAttribute('name'),
    );
    expect(names).toEqual([
      'name',
      'slug',
      'status',
      'standings_deadline_round',
      'start_date',
      'end_date',
      'description',
      'is_public',
      'survival_game',
    ]);
  });

  it('create: the status offers "Artėjantis" and "Vykstantis" only (R-55)', () => {
    render(<TournamentFormView existing={null} flash={null} />);
    const options = [...field('Statusas').querySelectorAll('option')].map(
      (option) => option.textContent,
    );
    expect(options).toEqual(['Artėjantis', 'Vykstantis']);
  });

  it('edit: "Redaguoti turnyrą", filled with the tournament, posting to its own route', () => {
    render(<TournamentFormView existing={RUNNING} flash={null} />);
    expect(
      screen.getByRole('heading', { name: 'Redaguoti turnyrą' }),
    ).toBeTruthy();
    const form = screen
      .getByRole('button', { name: 'Atnaujinti' })
      .closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/tournaments/3');
    expect(field('Pavadinimas')).toHaveProperty('value', 'Euroleague 2026/27');
    expect(field('Slug (URL)')).toHaveProperty('value', 'euroleague-2026-27');
    expect(field('Statusas')).toHaveProperty('value', 'active');
    expect(field('Pradžia')).toHaveProperty('value', '2026-10-01');
    expect(field('Aprašymas')).toHaveProperty('value', 'Sezonas');
    expect(field('Išlikimas')).toHaveProperty('checked', true);
  });

  it('edit: the deadline round shows the format\'s own as the placeholder, and "Tuščia - formato numatytasis."', () => {
    render(<TournamentFormView existing={RUNNING} flash={null} />);
    expect(field('Eigos prognozės užsidaro nuo turo')).toHaveProperty(
      'value',
      '',
    );
    expect(
      field('Eigos prognozės užsidaro nuo turo').getAttribute('placeholder'),
    ).toBe('5');
    expect(screen.getByText('Tuščia - formato numatytasis.')).toBeTruthy();
  });

  it('edit: a stored finished tournament shows its dates, deadline round and "Baigtas" status, and it is not public', () => {
    render(<TournamentFormView existing={FINISHED} flash={null} />);
    expect(field('Statusas')).toHaveProperty('value', 'finished');
    expect(
      [...field('Statusas').querySelectorAll('option')].map(
        (o) => o.textContent,
      ),
    ).toEqual(['Artėjantis', 'Vykstantis', 'Baigtas']);
    expect(field('Pabaiga')).toHaveProperty('value', '2026-05-31');
    expect(field('Eigos prognozės užsidaro nuo turo')).toHaveProperty(
      'value',
      '6',
    );
    expect(field('Viešas')).toHaveProperty('checked', false);
  });

  it('edit: "Atšaukti" goes back to the list', () => {
    render(<TournamentFormView existing={RUNNING} flash={null} />);
    expect(
      screen.getByRole('link', { name: 'Atšaukti' }).getAttribute('href'),
    ).toBe('/admin/tournaments');
  });

  it('a refused form lists its problems above the boxes', () => {
    render(
      <TournamentFormView
        existing={null}
        flash={{
          kind: 'admin-invalid',
          problems: [{ field: 'slug', problem: 'bad-slug' }],
        }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Slug (URL)');
  });
});
