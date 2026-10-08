'use client';

import type { JSX } from 'react';
import type { ReactNode } from 'react';
import {
  SIGN_IN_DIALOG_ID,
  SIGN_IN_EVENT,
  SIGN_IN_PATH,
} from './sign-in-state';

/**
 * "Prisijungti" (sportbet's .sb-rail-login and .sb-nav-pill, issue 106):
 * opens the dialog where the visitor is, so the page they are reading
 * survives the click; without the dialog, or JavaScript, it is a link to
 * /login, which opens the dialog on '/'.
 */
export function SignInLink({
  className,
  label,
  children,
}: {
  className: string;
  label?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <a
      href={SIGN_IN_PATH}
      className={className}
      aria-label={label}
      onClick={(event) => {
        if (document.getElementById(SIGN_IN_DIALOG_ID) === null) return;
        event.preventDefault();
        window.dispatchEvent(new Event(SIGN_IN_EVENT));
      }}
    >
      {children}
    </a>
  );
}
