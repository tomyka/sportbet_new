import type { JSX } from 'react';
import type { PaymentsPage } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { CardIcon } from '../hub/card-icon';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { DetailsForm } from './details-form';
import { PaymentsBoard } from './payments-board';
import { playerPaymentsPaths, type PaymentsPaths } from './payments-paths';

/**
 * sportbet's `/leagues/{id}/payments` (leagues/payments.blade.php): the card
 * "Mokėjimai · <league>" with the way back to "Lygos", the message of the
 * last save, the board of amounts; and a card of its own for where to send
 * the fee. Only a private league's admin gets here (R-105), or a superadmin
 * through the admin door (`paths`: where it posts, and the way back).
 */
export function PaymentsView({
  page,
  flash,
  paths = playerPaymentsPaths(page.league.id),
}: {
  page: PaymentsPage;
  flash: Flash | null;
  paths?: PaymentsPaths;
}): JSX.Element {
  return (
    <>
      <h1 className="sr-only">Mokėjimai</h1>
      <div className={`${CARD} mb-3`}>
        <div
          className={`${CARD_TITLE} mb-3 flex items-center justify-between gap-2`}
        >
          <span className="flex items-center">
            <CardIcon name="cash-coin" />
            {`Mokėjimai · ${page.league.name}`}
          </span>
          <a
            href={paths.back.href}
            className="inline-flex items-center text-[0.8rem] font-semibold normal-case text-accent no-underline hover:text-accent-hover"
          >
            <Icon name="arrow-left-short" />
            {paths.back.label}
          </a>
        </div>
        {flash === null ? null : <FlashAlert flash={flash} />}
        <PaymentsBoard page={page} savePath={paths.save} />
      </div>
      <div className={CARD}>
        <DetailsForm page={page} action={paths.details} />
      </div>
    </>
  );
}
