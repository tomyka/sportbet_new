import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTER_IDLE,
  type RegisterAction,
  type RegisterState,
} from './register-state';
import { SignInDialog } from './sign-in-dialog';
import {
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type ShellSignIn,
  type SignInAction,
} from './sign-in-state';

const idle: SignInAction = () => Promise.resolve(SIGN_IN_IDLE);
const registerIdle: RegisterAction = () => Promise.resolve(REGISTER_IDLE);
/** Registration closed: the dialog as 4b drew it, its sign-in side only. */
const EMAIL_STEP: ShellSignIn = {
  step: { kind: 'email' },
  open: false,
  tab: 'login',
  registrationOpen: false,
  codeMinutes: 5,
  action: idle,
  registerAction: registerIdle,
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

const REGISTER_OPEN: ShellSignIn = { ...EMAIL_STEP, registrationOpen: true };
const REGISTER_CODE = {
  kind: 'register-code',
  email: 'ruta.naujoke@example.lt',
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  sentAt: '2026-10-05T12:00:00Z',
  resendIn: 0,
  expiresIn: 300,
} as const;
const registerAnswering = (state: RegisterState) =>
  vi.fn<RegisterAction>(() => Promise.resolve(state));
const pane = (container: HTMLElement, id: string) =>
  container.querySelector(`#${id}`);

/** Types the three required answers and presses "Registruotis". */
function register(): void {
  fireEvent.change(screen.getByPlaceholderText('Slapyvardis'), {
    target: { value: 'naujoke' },
  });
  fireEvent.change(screen.getByPlaceholderText('Vardas'), {
    target: { value: 'Rūta' },
  });
  const [, address] = screen.getAllByPlaceholderText('El. paštas');
  if (address === undefined) throw new Error('no register address field');
  fireEvent.change(address, { target: { value: 'ruta@example.lt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registruotis' }));
}

// sportbet's modals/main and modals/register (AuthDialogTest).
describe('the tabs and the register form', () => {
  it('draws "Prisijungti" and "Registruotis" as tabs while registration is open, the sign-in tab chosen', () => {
    const { container } = render(<SignInDialog {...REGISTER_OPEN} open />);
    expect(screen.getByRole('tablist')).toBeDefined();
    expect(
      screen
        .getAllByRole('tab')
        .map((tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
    ).toEqual([
      ['Prisijungti', 'true'],
      ['Registruotis', 'false'],
    ]);
    expect(pane(container, 'loginPane')?.hasAttribute('hidden')).toBe(false);
    expect(pane(container, 'registerPane')?.hasAttribute('hidden')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Registruotis' }));
    expect(pane(container, 'loginPane')?.hasAttribute('hidden')).toBe(true);
    expect(pane(container, 'registerPane')?.hasAttribute('hidden')).toBe(false);
  });

  it('draws no tab and no register form while registration is closed', () => {
    const { container } = render(<SignInDialog {...EMAIL_STEP} open />);
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(pane(container, 'registerPane')).toBeNull();
  });

  it('opens on the Registruotis tab when /register sent the visitor', () => {
    render(<SignInDialog {...REGISTER_OPEN} open tab="register" />);
    expect(
      screen
        .getByRole('tab', { name: 'Registruotis' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it("asks sportbet's four questions behind a honeypot, and posts them as step one", async () => {
    const action = registerAnswering({ kind: 'sent', resent: false });
    const { container } = render(
      <SignInDialog
        {...REGISTER_OPEN}
        open
        tab="register"
        registerAction={action}
      />,
    );
    const honeypot = container.querySelector('input[name="website"]');
    expect(honeypot?.getAttribute('tabindex')).toBe('-1');
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByPlaceholderText('Pavardė')).toBeDefined();
    register();
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('request');
    expect(form?.get('username')).toBe('naujoke');
    expect(form?.get('name')).toBe('Rūta');
    expect(form?.get('surname')).toBe('');
    expect(form?.get('email')).toBe('ruta@example.lt');
    expect(form?.get('website')).toBe('');
  });

  it('shows each refusal under its field on the Registruotis tab, the answers kept (Q2)', async () => {
    const action = registerAnswering({
      kind: 'refused',
      errors: {
        username: 'Įveskite vartotojo vardą.',
        email: 'Šis el. pašto adresas jau užregistruotas.',
      },
      values: {
        username: '',
        name: 'Rūta',
        surname: 'Naujokė',
        email: 'ruta@example.lt',
      },
    });
    const { container } = render(
      <SignInDialog
        {...REGISTER_OPEN}
        open
        tab="register"
        registerAction={action}
      />,
    );
    register();
    expect(await screen.findByText('Įveskite vartotojo vardą.')).toBeDefined();
    expect(
      screen.getByText('Šis el. pašto adresas jau užregistruotas.'),
    ).toBeDefined();
    expect(pane(container, 'registerPane')?.hasAttribute('hidden')).toBe(false);
    expect(screen.getByPlaceholderText('Pavardė')).toHaveProperty(
      'value',
      'Naujokė',
    );
    expect(
      screen.getByPlaceholderText('Slapyvardis').getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('shows a refusal that belongs to no field above the register form (Q2)', async () => {
    const message = 'Pirmiausia užpildykite registracijos formą.';
    render(
      <SignInDialog
        {...REGISTER_OPEN}
        open
        tab="register"
        registerAction={registerAnswering({ kind: 'code-refused', message })}
      />,
    );
    register();
    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });
});

// sportbet's partials/auth/register-code-step (RegistrationTest).
describe('the register code step', () => {
  it('names the address, asks for the code, and draws no tab', () => {
    render(<SignInDialog {...REGISTER_OPEN} step={REGISTER_CODE} />);
    expect(dialog().hidden).toBe(false);
    expect(screen.getByText('ruta.naujoke@example.lt').tagName).toBe('STRONG');
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.getByLabelText('8 skaitmenų kodas')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Užbaigti registraciją' }),
    ).toBeDefined();
  });

  it('resends by posting the four answers again (issue 114)', () => {
    const { container } = render(
      <SignInDialog {...REGISTER_OPEN} step={REGISTER_CODE} />,
    );
    const resend = container.querySelector('[data-testid="register-resend"]');
    expect(
      ['intent', 'username', 'name', 'surname', 'email'].map((name) =>
        resend?.querySelector(`input[name="${name}"]`)?.getAttribute('value'),
      ),
    ).toEqual([
      'request',
      'naujoke',
      'Rūta',
      'Naujokė',
      'ruta.naujoke@example.lt',
    ]);
  });

  it('confirms with the code typed, and shows the answer to a refused one', async () => {
    const action = registerAnswering({
      kind: 'code-refused',
      message: 'Neteisingas arba pasibaigęs kodas.',
    });
    render(
      <SignInDialog
        {...REGISTER_OPEN}
        step={REGISTER_CODE}
        registerAction={action}
      />,
    );
    fireEvent.change(screen.getByLabelText('8 skaitmenų kodas'), {
      target: { value: '01234567' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Užbaigti registraciją' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Neteisingas arba pasibaigęs kodas.',
    );
    const form = action.mock.calls[0]?.[1];
    expect(form?.get('intent')).toBe('confirm');
    expect(form?.get('code')).toBe('01234567');
  });

  it('backs out with "Atgal"', async () => {
    const action = registerAnswering(REGISTER_IDLE);
    render(
      <SignInDialog
        {...REGISTER_OPEN}
        step={REGISTER_CODE}
        registerAction={action}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Atgal' }));
    await waitFor(() => {
      expect(action.mock.calls[0]?.[1].get('intent')).toBe('cancel');
    });
  });
});

// #18 review W1: register-code-step shows $errors->first(), so a refused
// resend (throttled, or the address registered meanwhile) is never silent.
it('shows a refused resend on the register code step: its first field error', async () => {
  const action = registerAnswering({
    kind: 'refused',
    errors: {
      email: 'Per daug bandymų. Pabandykite dar kartą po 10 min.',
    },
    values: {
      username: 'naujoke',
      name: 'Rūta',
      surname: 'Naujokė',
      email: 'ruta.naujoke@example.lt',
    },
  });
  render(
    <SignInDialog
      {...REGISTER_OPEN}
      step={REGISTER_CODE}
      registerAction={action}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Siųsti kodą iš naujo' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Per daug bandymų. Pabandykite dar kartą po 10 min.',
  );
  expect(action.mock.calls[0]?.[1].get('intent')).toBe('request');
});
