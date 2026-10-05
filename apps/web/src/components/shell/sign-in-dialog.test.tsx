import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInDialog } from './sign-in-dialog';
import {
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type ShellSignIn,
  type SignInAction,
} from './sign-in-state';

const idle: SignInAction = () => Promise.resolve(SIGN_IN_IDLE);
const EMAIL_STEP: ShellSignIn = {
  step: { kind: 'email' },
  open: false,
  codeMinutes: 5,
  action: idle,
};
const CODE = {
  kind: 'code',
  email: 'jonas@example.lt',
  sentAt: '2026-10-05T12:00:00Z',
  resendIn: 20,
  expiresIn: 300,
} as const;

const dialog = () => screen.getByTestId('sign-in-dialog');
const answering = (state: Awaited<ReturnType<SignInAction>>) =>
  vi.fn<SignInAction>(() => Promise.resolve(state));

afterEach(() => {
  vi.useRealTimers();
});

describe('the sign-in dialog', () => {
  it('is on the page, closed, with its address form, until "Prisijungti" opens it', () => {
    render(<SignInDialog {...EMAIL_STEP} />);
    expect(dialog().hidden).toBe(true);
    act(() => {
      window.dispatchEvent(new Event(SIGN_IN_EVENT));
    });
    expect(dialog().hidden).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Prisijungti' })).toBeDefined();
    expect(screen.getByPlaceholderText('El. paštas')).toBeDefined();
    expect(
      screen.getByText('Atsiųsime 8 skaitmenų kodą. Jis galios 5 min.'),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Gauti prisijungimo kodą' }),
    ).toBeDefined();
  });

  it('opens itself on arrival from /login, its form carrying nothing but the address (review W5)', () => {
    const { container } = render(<SignInDialog {...EMAIL_STEP} open />);
    expect(dialog().hidden).toBe(false);
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it('closes on "Uždaryti" and on Escape', () => {
    render(<SignInDialog {...EMAIL_STEP} open />);
    fireEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(dialog().hidden).toBe(true);
    act(() => {
      window.dispatchEvent(new Event(SIGN_IN_EVENT));
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog().hidden).toBe(true);
  });

  it('asks for a code for the address typed', async () => {
    const action = answering({ kind: 'sent', resent: false });
    render(<SignInDialog {...EMAIL_STEP} open action={action} />);
    fireEvent.change(screen.getByPlaceholderText('El. paštas'), {
      target: { value: 'jonas@example.lt' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Gauti prisijungimo kodą' }),
    );
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('request');
    expect(form?.get('email')).toBe('jonas@example.lt');
  });

  it('shows a refusal of the address above the address form', async () => {
    const message = 'Per daug bandymų. Pabandykite dar kartą po 10 min.';
    render(
      <SignInDialog
        {...EMAIL_STEP}
        open
        action={answering({ kind: 'refused', field: 'email', message })}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Gauti prisijungimo kodą' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });
});

// sportbet's LoginCodeStepTest and AuthCodeStep.
describe('the code step', () => {
  it('opens itself, names the address the code went to, and drops the address form', () => {
    render(<SignInDialog {...EMAIL_STEP} step={CODE} />);
    expect(dialog().hidden).toBe(false);
    expect(screen.getByText('jonas@example.lt').tagName).toBe('STRONG');
    expect(screen.getByText(/Kodą išsiuntėme į/)).toBeDefined();
    expect(screen.queryByPlaceholderText('El. paštas')).toBeNull();
    const input = screen.getByLabelText('8 skaitmenų kodas');
    expect(input.getAttribute('placeholder')).toBe('\u2022'.repeat(8));
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('maxlength')).toBe('8');
  });

  it('counts the code down, and says so once it has died', () => {
    vi.useFakeTimers();
    render(<SignInDialog {...EMAIL_STEP} step={{ ...CODE, expiresIn: 2 }} />);
    expect(screen.getByText('Kodas galioja dar 0:02')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      screen.getByText('Kodo galiojimas baigėsi - išsiųskite naują.'),
    ).toBeDefined();
  });

  it('keeps the resend locked for its cooldown, counting, then offers it with the address', () => {
    vi.useFakeTimers();
    const { container } = render(<SignInDialog {...EMAIL_STEP} step={CODE} />);
    const resend = screen.getByRole('button', { name: 'Siųsti kodą iš naujo' });
    expect(resend).toHaveProperty('disabled', true);
    expect(resend.textContent).toBe('siųskite iš naujo (0:20)');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(resend).toHaveProperty('disabled', false);
    expect(resend.textContent).toBe('siųskite iš naujo');
    expect(
      container
        .querySelector('[data-testid="sign-in-resend"] input[name="email"]')
        ?.getAttribute('value'),
    ).toBe('jonas@example.lt');
  });

  it('acknowledges a resend on its countdown line, and a first send not at all', async () => {
    render(
      <SignInDialog
        {...EMAIL_STEP}
        step={{ ...CODE, resendIn: 0 }}
        action={answering({ kind: 'sent', resent: true })}
      />,
    );
    expect(screen.queryByText('Kodą išsiuntėme iš naujo.')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Siųsti kodą iš naujo' }),
    );
    expect(await screen.findByText('Kodą išsiuntėme iš naujo.')).toBeDefined();
  });

  it('sends the code typed, and shows the one answer to a wrong one', async () => {
    const action = answering({
      kind: 'refused',
      field: 'code',
      message: 'Neteisingas arba pasibaigęs kodas.',
    });
    render(<SignInDialog {...EMAIL_STEP} step={CODE} action={action} />);
    fireEvent.change(screen.getByLabelText('8 skaitmenų kodas'), {
      target: { value: '01234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Neteisingas arba pasibaigęs kodas.',
    );
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('verify');
    expect(form?.get('code')).toBe('01234567');
  });

  it('backs out with "Atgal"', async () => {
    const action = answering(SIGN_IN_IDLE);
    render(<SignInDialog {...EMAIL_STEP} step={CODE} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Atgal' }));
    await waitFor(() => {
      expect(action.mock.calls[0]?.[1].get('intent')).toBe('cancel');
    });
  });
});
