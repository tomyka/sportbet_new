import type { JSX } from 'react';
import type { Profile } from '@sportbet/db';
import type { Flash } from '../../server/flash';
import { CardIcon } from '../hub/card-icon';
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { refusalTexts } from './profile-texts';
import {
  INPUT,
  INPUT_INVALID,
  LABEL,
  LINK_BUTTON,
  REFUSAL_ITEM,
  REFUSALS,
} from './profile-styles';

const PROFILE_SAVE_PATH = '/userProfile/save';
const EMAIL_CONFIRM_PATH = '/profile/email-change/confirm';
const EMAIL_CANCEL_PATH = '/profile/email-change/cancel';

type Field = 'username' | 'name' | 'surname' | 'email';

/** What the form holds: Laravel's old input after a refusal, else the account's own. */
function valuesOf(
  profile: Profile,
  flash: Flash | null,
): Record<Field, string> {
  if (flash?.kind === 'profile-refused' && flash.values !== undefined) {
    return flash.values;
  }
  return {
    username: profile.username,
    name: profile.name,
    surname: profile.surname,
    email: profile.email,
  };
}

function refusedFields(flash: Flash | null): ReadonlySet<string> {
  return flash?.kind === 'profile-refused' && flash.bag === 'account'
    ? new Set(Object.keys(flash.errors))
    : new Set();
}

function TextField({
  field,
  label,
  type = 'text',
  value,
  invalid,
}: {
  field: Field;
  label: string;
  type?: 'text' | 'email';
  value: string;
  invalid: boolean;
}): JSX.Element {
  return (
    <div className="mb-2">
      <label htmlFor={`fp_${field}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`fp_${field}`}
        name={field}
        type={type}
        defaultValue={value}
        required
        aria-invalid={invalid ? true : undefined}
        className={invalid ? INPUT_INVALID : INPUT}
      />
    </div>
  );
}

/** A bag's refusals, listed as sportbet's `alert alert-danger`. */
function Refusals({ texts }: { texts: readonly string[] }): JSX.Element | null {
  if (texts.length === 0) return null;
  return (
    <div role="alert" className={REFUSALS}>
      <ul className="m-0 list-disc pl-5">
        {texts.map((text) => (
          <li key={text} className={REFUSAL_ITEM}>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Issue 289: a requested address is not the account's until a code sent to
 * it comes back. Until then the old one still signs in, and this is where
 * the code is entered, its refusals beside the box.
 */
function PendingChange({
  pending,
  flash,
}: {
  pending: string;
  flash: Flash | null;
}): JSX.Element {
  const refusals = refusalTexts(flash, 'emailChange');
  return (
    <div
      data-testid="pending-email"
      className="mt-3 rounded-[6px] border border-warn bg-warn-tint px-4 py-3"
    >
      <p className="mb-2 text-[0.85rem]">
        {`Laukiama patvirtinimo adresui ${pending}. Kol kodo neįvesite, galioja senasis adresas.`}
      </p>
      {refusals.map((text) => (
        <p key={text} role="alert" className="mb-2 text-[0.85rem] text-bad">
          {text}
        </p>
      ))}
      <form
        method="post"
        action={EMAIL_CONFIRM_PATH}
        className="flex items-start gap-2"
      >
        <input
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="Patvirtinimo kodas"
          aria-label="Patvirtinimo kodas"
          className={`${INPUT} max-w-[12rem]`}
        />
        <button type="submit" className={BUTTON_PRIMARY}>
          Patvirtinti
        </button>
      </form>
      <form method="post" action={EMAIL_CANCEL_PATH} className="mt-2">
        <button type="submit" className={LINK_BUTTON}>
          Atšaukti keitimą
        </button>
      </form>
    </div>
  );
}

/**
 * "Paskyros informacija": the one form (username, name, surname, address;
 * "Išsaugoti"), its refusals above it and the typed values kept, and, while
 * an address change waits, the code box and "Atšaukti keitimą".
 */
export function AccountCard({
  profile,
  flash,
}: {
  profile: Profile;
  flash: Flash | null;
}): JSX.Element {
  const values = valuesOf(profile, flash);
  const refused = refusedFields(flash);
  return (
    <div className={`${CARD} h-full`}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="person" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Paskyros informacija</h2>
      </div>
      <Refusals texts={refusalTexts(flash, 'account')} />
      <form method="post" action={PROFILE_SAVE_PATH} data-testid="profile-form">
        <TextField
          field="username"
          label="Vartotojo vardas"
          value={values.username}
          invalid={refused.has('username')}
        />
        <div className="grid grid-cols-2 gap-2">
          <TextField
            field="name"
            label="Vardas"
            value={values.name}
            invalid={refused.has('name')}
          />
          <TextField
            field="surname"
            label="Pavardė"
            value={values.surname}
            invalid={refused.has('surname')}
          />
        </div>
        <TextField
          field="email"
          label="El. paštas"
          type="email"
          value={values.email}
          invalid={refused.has('email')}
        />
        <div className="text-right">
          <button type="submit" className={BUTTON_PRIMARY}>
            <Icon name="check2" /> Išsaugoti
          </button>
        </div>
      </form>
      {profile.pendingEmail === null ? (
        <Refusals texts={refusalTexts(flash, 'emailChange')} />
      ) : (
        <PendingChange pending={profile.pendingEmail} flash={flash} />
      )}
    </div>
  );
}
