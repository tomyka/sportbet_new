import type { JSX } from 'react';
import type { PaymentsPage } from '@sportbet/domain';
import { BUTTON_PRIMARY, CARD_TITLE } from '../hub/styles';
import { leagueDetailsPath } from './league-paths';

type Details = PaymentsPage['details'];

const LABEL = 'mb-1 block text-[0.75rem] font-semibold text-muted';
const INPUT =
  'w-full rounded-md border border-border bg-card px-2 py-1.5 text-[0.9rem] text-text placeholder:text-dim';

/** The recipient is a person, not the league: the owner's name is offered when nothing is stored (a prefill, not a write). */
function Beneficiary({ value }: { value: string }): JSX.Element {
  return (
    <div className="mb-3">
      <label htmlFor="payment_beneficiary" className={LABEL}>
        Gavėjas
      </label>
      <input
        type="text"
        id="payment_beneficiary"
        name="payment_beneficiary"
        maxLength={70}
        autoComplete="off"
        placeholder="Vardas Pavardė"
        aria-describedby="payment_beneficiary_help"
        defaultValue={value}
        className={INPUT}
      />
      <div
        id="payment_beneficiary_help"
        className="mt-1 text-[0.8rem] text-muted"
      >
        Sąskaitos savininko vardas ir pavardė, ne lygos ar įmonės pavadinimas -
        mokėtojo bankas palygina jį su sąskaita ir įspėja, jei nesutampa.
      </div>
    </div>
  );
}

/** Shown grouped in fours, stored compact (whatever spacing is typed back). */
function Iban({ value }: { value: string }): JSX.Element {
  return (
    <div className="mb-3">
      <label htmlFor="payment_iban" className={LABEL}>
        Sąskaita (IBAN)
      </label>
      <input
        type="text"
        id="payment_iban"
        name="payment_iban"
        maxLength={42}
        autoComplete="off"
        spellCheck={false}
        defaultValue={value}
        className={INPUT}
      />
    </div>
  );
}

function Note({ value }: { value: string }): JSX.Element {
  return (
    <div className="mb-3">
      <label htmlFor="payment_note" className={LABEL}>
        Papildomas tekstas <span className="text-muted">— nebūtina</span>
      </label>
      <textarea
        id="payment_note"
        name="payment_note"
        rows={2}
        maxLength={500}
        defaultValue={value}
        className={INPUT}
      />
    </div>
  );
}

/**
 * league-payment-details-form.blade.php: where this league's members are
 * told to send the fee - a real form with a Save button, not an autosave (an
 * account number is not something to save on blur). Both the beneficiary and
 * the IBAN, or neither, are checked by the server.
 */
export function DetailsForm({
  page,
  action = leagueDetailsPath(page.league.id),
}: {
  page: PaymentsPage;
  action?: string;
}): JSX.Element {
  const details: Details = page.details;
  return (
    <form method="post" action={action}>
      <div className={`${CARD_TITLE} mb-1`}>Mokėjimo rekvizitai</div>
      <p className="mb-3 text-[0.8rem] text-muted">
        Matys tik tie nariai, kurie dar nesumokėjo.
      </p>
      <Beneficiary value={details.beneficiary} />
      <Iban value={details.iban} />
      <Note value={details.note} />
      <button type="submit" className={BUTTON_PRIMARY}>
        Išsaugoti
      </button>
    </form>
  );
}
