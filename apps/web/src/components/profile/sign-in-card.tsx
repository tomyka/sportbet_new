import type { JSX } from 'react';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';

/**
 * "Prisijungimas": no passwords; Google (slice 19) or a one-time code to the
 * address above, as sportbet's list has them.
 */
export function SignInCard(): JSX.Element {
  return (
    <div className={`${CARD} h-full`}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="lock-fill" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Prisijungimas</h2>
      </div>
      <p className="mb-2 text-[0.82rem] text-muted">
        Slaptažodžių nebenaudojame. Prisijungti galite dviem būdais:
      </p>
      <ul className="m-0 list-disc pl-5 text-[0.82rem] text-muted">
        <li>per Google</li>
        <li>vienkartiniu kodu, siunčiamu į jūsų el. pašto adresą</li>
      </ul>
      <p className="mt-3 mb-0 text-[0.78rem] text-muted">
        Todėl svarbu, kad aukščiau nurodytas el. pašto adresas būtų teisingas -
        kodas siunčiamas būtent į jį.
      </p>
    </div>
  );
}
