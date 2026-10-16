import type { JSX } from 'react';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';

/**
 * "Prisijungimas": no passwords, a one-time code to the address above. The
 * "per Google" line of sportbet's list waits for slice 4d's Google sign-in:
 * until then the card lists the code alone, so it never promises a way in
 * that does not exist.
 */
export function SignInCard(): JSX.Element {
  return (
    <div className={`${CARD} h-full`}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="lock-fill" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Prisijungimas</h2>
      </div>
      <p className="mb-2 text-[0.82rem] text-muted">
        Slaptažodžių nebenaudojame. Prisijungti galite:
      </p>
      <ul className="m-0 list-disc pl-5 text-[0.82rem] text-muted">
        <li>vienkartiniu kodu, siunčiamu į jūsų el. pašto adresą</li>
      </ul>
      <p className="mt-3 mb-0 text-[0.78rem] text-muted">
        Todėl svarbu, kad aukščiau nurodytas el. pašto adresas būtų teisingas -
        kodas siunčiamas būtent į jį.
      </p>
    </div>
  );
}
