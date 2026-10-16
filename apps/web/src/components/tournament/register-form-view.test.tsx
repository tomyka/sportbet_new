import type { RegistrationForm } from '@sportbet/db';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Flash } from '../../server/flash';
import { EL_2026, PROFILE } from '../../../tests/support/hub-cards';
import { RegisterFormView } from './register-form-view';

const FORM: Extract<RegistrationForm, { step: 'open' }> = {
  step: 'open',
  tournament: EL_2026,
  profile: PROFILE,
  games: 380,
  teams: 20,
};

describe('RegisterFormView: register.blade.php', () => {
  it("registration form: sportbet's title, the tournament, and what joining gives", () => {
    render(<RegisterFormView form={FORM} error={null} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Registracija į turnyrą' }),
    ).toBeDefined();
    expect(screen.getByText('Euroleague 2026/27')).toBeDefined();
    expect(
      screen.getByText('Krepšinis · 2026-09-30 - 2027-05-23'),
    ).toBeDefined();
    expect(screen.getByText('Ką gausite užsiregistravę')).toBeDefined();
    expect(
      screen.getByText(
        'Vietą bendroje šio turnyro lygoje ir lyderių lentelėje.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('Spėjimų korteles visoms turnyro rungtynėms: 380.'),
    ).toBeDefined();
    expect(
      screen.getByText('Komandų vietų prognozes: 20 komandos.'),
    ).toBeDefined();
  });

  it("registration form: the title is the card's, as sportbet's .sb-card-title draws it, with the way back", () => {
    render(<RegisterFormView form={FORM} error={null} />);
    const title = screen.getByRole('heading', { level: 1 }).className;
    expect(title).toContain('uppercase');
    expect(title).toContain('text-[0.7rem]');
    expect(
      screen.getByRole('link', { name: '← Turnyrai' }).getAttribute('href'),
    ).toBe('/');
  });

  it("registration form (R-128): production's sentence, with no date", () => {
    render(<RegisterFormView form={FORM} error={null} />);
    expect(
      screen.getByText(
        'Registracija galima tik iki pirmųjų turnyro rungtynių pradžios.',
      ),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Taisyklės' }).getAttribute('href'),
    ).toBe('/rules');
  });

  it('registration form: the confirmation, posted to the submit, and a way back', () => {
    render(<RegisterFormView form={FORM} error={null} />);
    const box = screen.getByRole('checkbox', {
      name: 'Patvirtinu, kad noriu dalyvauti šiame turnyre.',
    });
    expect(box.getAttribute('name')).toBe('confirm');
    expect(box.getAttribute('value')).toBe('1');
    const form = box.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(
      '/tournament/euroleague-2026-27/register/submit',
    );
    expect(
      screen.getByRole('button', { name: 'Registruotis į turnyrą' }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Atšaukti' }).getAttribute('href'),
    ).toBe('/');
  });

  it("registration form: an unconfirmed submit comes back with sportbet's message", () => {
    render(
      <RegisterFormView form={FORM} error={{ kind: 'confirm-required' }} />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
    );
  });

  it('registration form: takes only the unconfirmed message - the others belong to the hub', () => {
    // A type-level fact, checked by the typecheck: "registered" and the
    // rest are the hub's messages, never the form's.
    expectTypeOf<
      ComponentProps<typeof RegisterFormView>['error']
    >().toEqualTypeOf<Extract<Flash, { kind: 'confirm-required' }> | null>();
  });
});
