import type { Profile } from '@sportbet/db';
import { emailAddress, instantFrom } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Flash } from '../../server/flash';
import { ProfileView } from './profile-view';

const PROFILE: Profile = {
  username: 'jonas',
  name: 'Jonas',
  surname: 'Petraitis',
  email: unwrap(emailAddress('jonas@example.lt')),
  pendingEmail: null,
  role: 'player',
  receiveReminders: true,
  createdAt: unwrap(instantFrom('2025-03-04T10:00:00Z')),
};

const show = (flash: Flash | null = null, profile: Profile = PROFILE) =>
  render(<ProfileView profile={profile} flash={flash} />);

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

describe('the header card', () => {
  it('shows the initials, the name, the username and address, and "Narys nuo" with the creation day (R-114)', () => {
    show();
    expect(screen.getByText('JP')).toBeDefined();
    expect(screen.getByText('Jonas Petraitis')).toBeDefined();
    expect(screen.getByText(/jonas@example.lt/)).toBeDefined();
    expect(screen.getByText('Narys nuo', { exact: false })).toBeDefined();
    expect(screen.getByText('2025-03-04')).toBeDefined();
  });

  it('shows the Admin badge for a results manager and a superadmin, not for a player', () => {
    show();
    expect(screen.queryByText('Admin')).toBeNull();
    for (const role of ['results-manager', 'superadmin'] as const) {
      const { unmount } = show(null, { ...PROFILE, role });
      expect(screen.getByText('Admin')).toBeDefined();
      unmount();
    }
  });
});

describe('the account card', () => {
  it("holds one form posting to /userProfile/save with the account's own values", () => {
    show();
    const form = screen.getByTestId('profile-form');
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/userProfile/save');
    for (const [label, value] of [
      ['Vartotojo vardas', 'jonas'],
      ['Vardas', 'Jonas'],
      ['Pavardė', 'Petraitis'],
      ['El. paštas', 'jonas@example.lt'],
    ] as const) {
      expect(within(form).getByLabelText<HTMLInputElement>(label).value).toBe(
        value,
      );
    }
    expect(
      within(form).getByRole('button', { name: /Išsaugoti/ }),
    ).toBeDefined();
  });

  it('lists every refusal above the form, outlines its field and keeps what was typed', () => {
    show({
      kind: 'profile-refused',
      bag: 'account',
      errors: { username: 'taken', surname: 'required', email: 'not-an-email' },
      values: {
        username: 'zuk',
        name: 'Jonas',
        surname: '',
        email: 'jonas@',
      },
    });
    const alert = screen.getByRole('alert');
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Šis vartotojo vardas jau užimtas.',
      'Įveskite pavardę.',
      'Įveskite teisingą el. pašto adresą.',
    ]);
    expect(
      screen.getByLabelText<HTMLInputElement>('Vartotojo vardas').value,
    ).toBe('zuk');
    expect(screen.getByLabelText<HTMLInputElement>('El. paštas').value).toBe(
      'jonas@',
    );
    expect(
      screen.getByLabelText('Vartotojo vardas').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(screen.getByLabelText('Pavardė').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(
      screen.getByLabelText('Vardas').getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('says how long a throttled address change waits, in the form', () => {
    show({
      kind: 'profile-refused',
      bag: 'account',
      errors: { email: 'throttled' },
      values: {
        username: 'jonas',
        name: 'Jonas',
        surname: 'Petraitis',
        email: 'a@b.lt',
      },
      minutes: 7,
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'Per daug bandymų. Pabandykite po 7 min.',
    );
  });

  it('draws no pending box without a pending change', () => {
    show();
    expect(screen.queryByTestId('pending-email')).toBeNull();
  });
});

describe('the pending address change (R-24)', () => {
  const pending: Profile = {
    ...PROFILE,
    pendingEmail: unwrap(emailAddress('naujas@example.lt')),
  };

  it('names the address, offers the code box posting to confirm, and "Atšaukti keitimą" posting to cancel', () => {
    show(null, pending);
    const box = screen.getByTestId('pending-email');
    expect(box.textContent).toContain(
      'Laukiama patvirtinimo adresui naujas@example.lt. Kol kodo neįvesite, galioja senasis adresas.',
    );
    const forms = box.querySelectorAll('form');
    expect(forms[0]?.getAttribute('action')).toBe(
      '/profile/email-change/confirm',
    );
    expect(forms[1]?.getAttribute('action')).toBe(
      '/profile/email-change/cancel',
    );
    expect(
      within(box).getByLabelText<HTMLInputElement>('Patvirtinimo kodas').name,
    ).toBe('code');
    expect(
      within(box).getByRole('button', { name: 'Patvirtinti' }),
    ).toBeDefined();
    expect(
      within(box).getByRole('button', { name: 'Atšaukti keitimą' }),
    ).toBeDefined();
  });

  it.each([
    ['none', 'Nėra laukiančio el. pašto keitimo.'],
    ['invalid', 'Neteisingas arba pasibaigęs patvirtinimo kodas.'],
    ['taken', 'Šis el. paštas jau susietas su kita paskyra.'],
  ] as const)(
    'shows the code box refusal %s beside the box, not above the form',
    (code, text) => {
      show(
        { kind: 'profile-refused', bag: 'emailChange', errors: { code } },
        pending,
      );
      const box = screen.getByTestId('pending-email');
      expect(within(box).getByRole('alert').textContent).toBe(text);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    },
  );
});

describe('the sign-in card, notifications and the one-time message', () => {
  it('lists the one-time code alone, with no Google line', () => {
    show();
    expect(screen.getByText('Prisijungimas')).toBeDefined();
    expect(
      screen.getByText('vienkartiniu kodu, siunčiamu į jūsų el. pašto adresą'),
    ).toBeDefined();
    expect(screen.queryByText(/Google/)).toBeNull();
    expect(
      screen.getByText(
        /Todėl svarbu, kad aukščiau nurodytas el. pašto adresas/,
      ),
    ).toBeDefined();
  });

  it('has a reminders switch posting to /profile/notifications, ticked as the setting is', () => {
    const { unmount } = show();
    const box = screen.getByLabelText<HTMLInputElement>('Įjungti priminimus');
    expect(box.checked).toBe(true);
    expect(box.name).toBe('receive_reminders');
    expect(box.closest('form')?.getAttribute('action')).toBe(
      '/profile/notifications',
    );
    unmount();
    show(null, { ...PROFILE, receiveReminders: false });
    expect(
      screen.getByLabelText<HTMLInputElement>('Įjungti priminimus').checked,
    ).toBe(false);
  });

  it.each([
    [{ kind: 'profile-updated' }, 'Profilis atnaujintas.'],
    [
      { kind: 'email-change-requested', email: 'naujas@example.lt' },
      'Patvirtinimo kodas išsiųstas į naujas@example.lt. Senasis adresas galioja, kol kodo neįvesite.',
    ],
    [
      { kind: 'email-changed' },
      'El. paštas pakeistas. Apie pakeitimą pranešėme senuoju adresu.',
    ],
    [{ kind: 'email-change-cancelled' }, 'El. pašto keitimas atšauktas.'],
    [
      { kind: 'deletion-code-sent' },
      'Patvirtinimo kodas išsiųstas į jūsų el. pašto adresą.',
    ],
    [{ kind: 'notifications-saved' }, 'Pranešimų nustatymai atnaujinti.'],
  ] as const satisfies readonly (readonly [Flash, string])[])(
    'shows %o at the top as a status',
    (flash, text) => {
      show(flash);
      expect(screen.getByRole('status').textContent).toBe(text);
    },
  );

  it('shows no status for a refusal or no message', () => {
    show();
    expect(screen.queryByRole('status')).toBeNull();
    show({
      kind: 'profile-refused',
      bag: 'userDeletion',
      errors: { code: 'invalid' },
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('the theme', () => {
  it('starts as the page is and writes sb-theme and data-theme on a choice', () => {
    show();
    const light = screen.getByRole('button', { name: 'Šviesi' });
    const dark = screen.getByRole('button', { name: 'Tamsi' });
    expect(light.getAttribute('aria-pressed')).toBe('true');
    expect(dark.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dark);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('sb-theme')).toBe('dark');
    expect(dark.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(light);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(localStorage.getItem('sb-theme')).toBe('light');
    expect(light.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows dark as chosen when the page already is dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    show();
    expect(
      screen
        .getByRole('button', { name: 'Tamsi' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('the danger zone', () => {
  const panel = () => document.getElementById('danger-zone-panel');

  it('is closed at first, opened and closed by its toggle', () => {
    show();
    expect(panel()?.hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ištrinti paskyrą' }));
    expect(panel()?.hidden).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Atšaukti' }));
    expect(panel()?.hidden).toBe(true);
  });

  it('is open after a sent code, with the two forms: send the code, and delete with it', () => {
    show({ kind: 'deletion-code-sent' });
    expect(panel()?.hidden).toBe(false);
    const zone = screen.getByTestId('danger-zone');
    expect(zone.textContent).toContain(
      'Visi jūsų duomenys bus ištrinti. Šio veiksmo negalima atšaukti.',
    );
    const [send, destroy] = Array.from(zone.querySelectorAll('form'));
    expect(send?.getAttribute('action')).toBe('/profile/deletion-code');
    expect(destroy?.getAttribute('action')).toBe('/profile');
    expect(destroy?.getAttribute('method')).toBe('post');
    expect(
      destroy?.querySelector<HTMLInputElement>('input[name="_method"]')?.value,
    ).toBe('DELETE');
    expect(
      within(zone).getByLabelText<HTMLInputElement>('Patvirtinimo kodas').name,
    ).toBe('code');
    expect(
      within(zone).getByRole('button', { name: /Siųsti patvirtinimo kodą/ }),
    ).toBeDefined();
    expect(
      within(zone).getByRole('button', {
        name: /Ištrinti paskyrą visam laikui/,
      }),
    ).toBeDefined();
  });

  it.each([
    ['invalid', 'Neteisingas arba pasibaigęs patvirtinimo kodas.'],
    ['send-failed', 'Nepavyko išsiųsti patvirtinimo kodo. Bandykite vėliau.'],
    [
      'last-superadmin',
      'Paskutinio superadministratoriaus paskyros ištrinti negalima. Pirmiausia paskirkite kitą superadministratorių.',
    ],
  ] as const)(
    'is open after the refusal %s, saying it in the zone',
    (code, text) => {
      show({ kind: 'profile-refused', bag: 'userDeletion', errors: { code } });
      expect(panel()?.hidden).toBe(false);
      expect(
        within(panel() ?? document.body).getByRole('alert').textContent,
      ).toBe(text);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    },
  );

  it('stays closed for a refusal of another bag', () => {
    show({
      kind: 'profile-refused',
      bag: 'emailChange',
      errors: { code: 'invalid' },
    });
    expect(panel()?.hidden).toBe(true);
  });
});

describe('a code refusal with nothing pending (the change was cancelled elsewhere)', () => {
  it('is still said, under the form, so the refusal is never lost', () => {
    show({
      kind: 'profile-refused',
      bag: 'emailChange',
      errors: { code: 'none' },
    });
    expect(screen.queryByTestId('pending-email')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(
      'Nėra laukiančio el. pašto keitimo.',
    );
  });
});
