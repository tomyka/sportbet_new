import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnsubscribeConfirm } from './unsubscribe-confirm';

const CONFIRM_PATH =
  '/profile/notifications/unsubscribe/7/confirm?signature=abc.def';

// R-98: the mail's link opens this page; the setting changes only on its button.
describe('UnsubscribeConfirm', () => {
  it('asks, says what stops, and offers one button posting to the confirm address with the signature', () => {
    const { container } = render(
      <UnsubscribeConfirm
        view={{ kind: 'confirm', confirmPath: CONFIRM_PATH }}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Atsisakyti priminimų?' }),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Daugiau nebegausite priminimų apie neatliktus spėjimus.',
      ),
    ).toBeDefined();
    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(CONFIRM_PATH);
    const button = screen.getByRole('button', { name: 'Atsisakyti' });
    expect(button.getAttribute('type')).toBe('submit');
    expect(form?.contains(button)).toBe(true);
  });

  it('has no other way to change the setting: no link to it', () => {
    render(
      <UnsubscribeConfirm
        view={{ kind: 'confirm', confirmPath: CONFIRM_PATH }}
      />,
    );
    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('says the link no longer works, with a way to sign in and no form, for a link that does not open', () => {
    const { container } = render(
      <UnsubscribeConfirm view={{ kind: 'invalid' }} />,
    );
    expect(screen.getByText('Nuoroda nebegalioja.')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Prisijungti' }).getAttribute('href'),
    ).toBe('/login');
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
