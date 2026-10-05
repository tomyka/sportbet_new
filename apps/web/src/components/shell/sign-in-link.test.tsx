import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SignInLink } from './sign-in-link';
import { SIGN_IN_DIALOG_ID, SIGN_IN_EVENT } from './sign-in-state';

// sportbet issue 106: "Prisijungti" opens the dialog where the visitor is;
// without the dialog (or JavaScript) it is an ordinary link to /login.
it('opens the dialog in place when the page has one', () => {
  const opened = vi.fn();
  window.addEventListener(SIGN_IN_EVENT, opened);
  render(
    <>
      <div id={SIGN_IN_DIALOG_ID} />
      <SignInLink className="">Prisijungti</SignInLink>
    </>,
  );
  const link = screen.getByRole('link', { name: 'Prisijungti' });
  expect(link.getAttribute('href')).toBe('/login');
  expect(fireEvent.click(link)).toBe(false);
  expect(opened).toHaveBeenCalledTimes(1);
  window.removeEventListener(SIGN_IN_EVENT, opened);
});

it('follows its href when the page has no dialog', () => {
  render(<SignInLink className="">Prisijungti</SignInLink>);
  expect(
    fireEvent.click(screen.getByRole('link', { name: 'Prisijungti' })),
  ).toBe(true);
});
