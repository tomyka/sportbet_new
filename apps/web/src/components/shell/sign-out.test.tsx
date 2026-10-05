import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SignOut } from './sign-out';

// sportbet's sign-out in the rail and the phone menu: a button submitting
// that place's own hidden POST form (partials/rail-account, header).

it('submits its own hidden form, a POST to /logout', () => {
  render(<SignOut formId="logout-form-x" className="link" />);
  const button = screen.getByRole('button', { name: 'Atsijungti' });
  expect(button.getAttribute('type')).toBe('submit');
  expect(button.getAttribute('form')).toBe('logout-form-x');
  expect(button.className).toBe('link');
  expect(button.querySelector('[data-icon="box-arrow-right"]')).not.toBeNull();
  const form = document.getElementById('logout-form-x');
  expect(form?.getAttribute('action')).toBe('/logout');
  expect(form?.getAttribute('method')).toBe('post');
  expect(form?.hidden).toBe(true);
});
