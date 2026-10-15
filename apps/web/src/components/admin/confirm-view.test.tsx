import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmGone, ConfirmView } from './confirm-view';

const DESCRIPTION =
  'Ištrinti žaidimą #412: Zalgiris Kaunas - Real Madrid, gruodžio 1 d., 20:00';

describe('ConfirmView (R-26 amended: the emailed confirmation)', () => {
  it('confirm: says what will happen, in the words the mail used', () => {
    render(<ConfirmView description={DESCRIPTION} flash={null} />);
    expect(
      screen.getByRole('heading', { name: /Patvirtinkite veiksmą/ }),
    ).toBeTruthy();
    expect(screen.getByTestId('confirm-action').textContent).toBe(DESCRIPTION);
    expect(
      screen.getByText(/išsiuntėme 8 skaitmenų kodą/).textContent,
    ).toContain('Jis galioja 5 min.');
  });

  it('confirm: one code box - eight digits, never autofilled by the browser as a password - posting to the confirm route', () => {
    render(<ConfirmView description={DESCRIPTION} flash={null} />);
    const box = screen.getByLabelText('8 skaitmenų kodas');
    expect(box.getAttribute('name')).toBe('code');
    expect(box.getAttribute('inputmode')).toBe('numeric');
    expect(box.getAttribute('autocomplete')).toBe('one-time-code');
    expect(box.getAttribute('maxlength')).toBe('8');
    expect(box.getAttribute('pattern')).toBe('[0-9]{8}');
    expect(box.hasAttribute('required')).toBe(true);
    const form = screen
      .getByRole('button', { name: 'Patvirtinti' })
      .closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/confirm/save');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.querySelectorAll('input')).toHaveLength(1);
  });

  it('confirm: "Atšaukti" goes back to the dashboard, deleting nothing', () => {
    render(<ConfirmView description={DESCRIPTION} flash={null} />);
    expect(
      screen.getByRole('link', { name: 'Atšaukti' }).getAttribute('href'),
    ).toBe('/admin/index');
  });

  it('confirm: a wrong code says so above the box', () => {
    render(
      <ConfirmView
        description={DESCRIPTION}
        flash={{ kind: 'admin', message: 'wrong-code' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Neteisingas arba pasibaigęs kodas.',
    );
  });

  it('confirm: a target gone since the ask is said so, with no code box and a way back', () => {
    render(<ConfirmGone text="Paskyra nebeegzistuoja." />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Paskyra nebeegzistuoja.',
    );
    expect(screen.queryByLabelText('8 skaitmenų kodas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Patvirtinti' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Atgal' }).getAttribute('href'),
    ).toBe('/admin/index');
  });
});
