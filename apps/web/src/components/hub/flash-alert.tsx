import { Icon } from '../shell/icon';
import type { Flash } from '../../server/flash';
import { throttledText } from '../../server/sign-in/texts';

const TEXT = {
  'registration-closed': 'Registracija į šį turnyrą jau pasibaigė.',
  'confirm-required': 'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
} as const;

const ALERT =
  'mb-4 flex items-center gap-2 rounded-[6px] border px-4 py-2 text-[0.9rem]';

/**
 * sportbet's `alert alert-success` (`session('info')`) or `alert
 * alert-danger` (`session('error')`), as custom.css colours them.
 */
export function FlashAlert({ flash }: { flash: Flash }) {
  if (flash.kind === 'recalculated') {
    // sportbet's alert alert-primary (session('info') on the admin page).
    return (
      <div
        role="status"
        className={`${ALERT} border-accent bg-accent-tint text-accent`}
      >
        <Icon name="info-circle" />
        Visi taškų rezultatai perskaičiuoti.
      </div>
    );
  }
  if (flash.kind === 'registered') {
    return (
      <div role="status" className={`${ALERT} border-ok bg-ok-tint text-ok`}>
        <Icon name="check-circle-fill" />
        {`Užsiregistravote į turnyrą: ${flash.tournament}`}
      </div>
    );
  }
  return (
    <div role="alert" className={`${ALERT} border-bad bg-bad-tint text-bad`}>
      <Icon name="exclamation-circle" />
      {flash.kind === 'throttled'
        ? throttledText(flash.minutes)
        : TEXT[flash.kind]}
    </div>
  );
}
