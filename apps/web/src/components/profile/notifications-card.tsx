import type { JSX } from 'react';
import { CardIcon } from '../hub/card-icon';
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';

const NOTIFICATIONS_PATH = '/profile/notifications';

/**
 * "Pranešimai": the one switch, "Įjungti priminimus", and "Išsaugoti". An
 * unticked box posts nothing, which the server reads as off.
 */
export function NotificationsCard({
  receiveReminders,
}: {
  receiveReminders: boolean;
}): JSX.Element {
  return (
    <div className={`${CARD} mb-3`}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="envelope" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Pranešimai</h2>
      </div>
      <form method="post" action={NOTIFICATIONS_PATH}>
        <p className="mb-3 text-[0.82rem] text-muted">
          Gauti priminimus el. paštu apie artėjančias rungtynes prieš pat
          žaidimo pradžią.
        </p>
        <label
          htmlFor="receive_reminders"
          className="mb-3 flex items-center gap-2 text-[0.9rem]"
        >
          <input
            type="checkbox"
            id="receive_reminders"
            name="receive_reminders"
            value="1"
            defaultChecked={receiveReminders}
          />
          Įjungti priminimus
        </label>
        <div className="text-right">
          <button type="submit" className={BUTTON_PRIMARY}>
            <Icon name="check2" /> Išsaugoti
          </button>
        </div>
      </form>
    </div>
  );
}
