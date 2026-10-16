'use client';

import { useState, type JSX } from 'react';
import { CARD } from '../hub/styles';
import { Icon } from '../shell/icon';
import { BUTTON_DANGER, BUTTON_DANGER_OUTLINE, INPUT } from './profile-styles';
import { Refusals } from './refusals';

const DELETION_CODE_PATH = '/profile/deletion-code';
const DELETE_PATH = '/profile';

/**
 * Issue #43: deletion is re-authenticated with a one-time code, so a
 * session left open on a shared machine is not enough. First the code is
 * mailed to the account's own address; then it is typed here and posted
 * with `_method=DELETE`, as Laravel's form does.
 */
function DeletionForms(): JSX.Element {
  return (
    <div className="max-w-[360px]">
      <p className="mb-2 text-[0.83rem] text-muted">
        Pirmiausia atsiųsime vienkartinį kodą į jūsų paskyros el. pašto adresą.
      </p>
      <form method="post" action={DELETION_CODE_PATH} className="mb-3">
        <button
          type="submit"
          className="cursor-pointer rounded-full border-2 border-border-strong bg-transparent px-4 py-1 text-[0.8rem] font-semibold text-text"
        >
          <Icon name="envelope" /> Siųsti patvirtinimo kodą
        </button>
      </form>
      <form method="post" action={DELETE_PATH}>
        <input type="hidden" name="_method" value="DELETE" />
        <label
          htmlFor="fp_deletion_code"
          className="mb-1 block text-[0.75rem] font-semibold text-muted"
        >
          Patvirtinimo kodas
        </label>
        <input
          id="fp_deletion_code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          className={`${INPUT} mb-2`}
        />
        <button type="submit" className={BUTTON_DANGER}>
          <Icon name="exclamation-circle" /> Ištrinti paskyrą visam laikui
        </button>
      </form>
    </div>
  );
}

/**
 * "Pavojaus zona": closed until the toggle ("Ištrinti paskyrą" /
 * "Atšaukti"), open from the start after a sent code or a refusal in it
 * (`initiallyOpen`); the refusals are listed above the text.
 */
export function DangerZone({
  initiallyOpen,
  refusals,
}: {
  initiallyOpen: boolean;
  refusals: readonly string[];
}): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className={CARD} data-testid="danger-zone">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-[0.82rem] font-semibold text-bad">
            <Icon name="exclamation-circle" /> Pavojaus zona
          </h2>
          <div className="mt-1 text-[0.78rem] text-muted">
            Paskyros ištrynimas yra negrįžtamas veiksmas.
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="danger-zone-panel"
          className={`${BUTTON_DANGER_OUTLINE} shrink-0`}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Atšaukti' : 'Ištrinti paskyrą'}
        </button>
      </div>
      <div
        id="danger-zone-panel"
        hidden={!open}
        className="mt-3 border-t border-border pt-3"
      >
        <Refusals texts={refusals} />
        <p className="mb-3 text-[0.83rem] text-muted">
          Visi jūsų duomenys bus ištrinti. Šio veiksmo negalima atšaukti.
        </p>
        <DeletionForms />
      </div>
    </div>
  );
}
