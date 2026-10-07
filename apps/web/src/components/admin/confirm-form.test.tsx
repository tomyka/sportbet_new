import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmForm } from './confirm-form';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConfirmForm (onsubmit="return confirm(...)")', () => {
  it('confirm: submits only when the admin agrees', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ConfirmForm action="/x" question="Tikrai?">
        <button type="submit">Eiti</button>
      </ConfirmForm>,
    );
    const form = screen.getByRole('button', { name: 'Eiti' }).closest('form');
    if (form === null) throw new Error('no form');
    const submitted = fireEvent.submit(form);
    expect(confirm).toHaveBeenCalledWith('Tikrai?');
    expect(submitted).toBe(false);
  });
});
