import type { JSX } from 'react';
import Link from 'next/link';
import { LOGIN_CODE_DIGITS, LOGIN_CODE_TTL_MINUTES } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { ADMIN_PATH } from '../shell/shell-paths';
import { Icon } from '../shell/icon';
import { CONFIRM_SAVE_PATH } from './admin-paths';
import { ACTION_BUTTON, FIELD_INPUT, FIELD_LABEL } from './admin-styles';

/**
 * The emailed confirmation (R-26 amended; sportbet has no such page): what
 * will happen, in words, and the one code box. The code was mailed to the
 * admin's own address when they asked, and is good for a few minutes; a
 * wrong code leaves the box for another try.
 */
export function ConfirmView({
  description,
  flash,
}: {
  description: string;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={`${CARD} mx-auto max-w-[480px]`}>
      <h1 className={`mb-3 flex items-center gap-2 ${CARD_TITLE}`}>
        <Icon name="lock-fill" /> Patvirtinkite veiksmą
      </h1>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <p
        data-testid="confirm-action"
        className="mb-2 text-[0.95rem] font-semibold"
      >
        {description}
      </p>
      <p className="mb-4 text-[0.85rem] text-muted">
        Į jūsų el. paštą išsiuntėme {String(LOGIN_CODE_DIGITS)} skaitmenų kodą.
        Jis galioja {String(LOGIN_CODE_TTL_MINUTES)} min.
      </p>
      <form method="post" action={CONFIRM_SAVE_PATH} className="grid gap-3">
        <label className={FIELD_LABEL}>
          {String(LOGIN_CODE_DIGITS)} skaitmenų kodas
          <input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`[0-9]{${String(LOGIN_CODE_DIGITS)}}`}
            maxLength={LOGIN_CODE_DIGITS}
            required
            className={FIELD_INPUT}
          />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className={BUTTON_PRIMARY}>
            Patvirtinti
          </button>
          <Link href={ADMIN_PATH} className={ACTION_BUTTON}>
            Atšaukti
          </Link>
        </div>
      </form>
    </div>
  );
}

/**
 * The confirmation of an action whose target has gone since it was asked
 * (an account or a league deleted meanwhile): what is missing, and no code
 * box - there is nothing to confirm.
 */
export function ConfirmGone({ text }: { text: string }): JSX.Element {
  return (
    <div className={`${CARD} mx-auto max-w-[480px]`}>
      <h1 className={`mb-3 flex items-center gap-2 ${CARD_TITLE}`}>
        <Icon name="lock-fill" /> Patvirtinkite veiksmą
      </h1>
      <p
        data-testid="confirm-gone"
        role="alert"
        className="mb-4 text-[0.95rem]"
      >
        {text}
      </p>
      <Link href={ADMIN_PATH} className={ACTION_BUTTON}>
        Atgal
      </Link>
    </div>
  );
}
