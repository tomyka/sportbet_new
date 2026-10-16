import type { JSX } from 'react';
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { SignInLink } from '../shell/sign-in-link';

/** What the unsubscribe page shows: the confirmation, or a link that does not open. */
export type UnsubscribeView =
  | {
      readonly kind: 'confirm';
      /** The handler the button posts to, signature included. */
      readonly confirmPath: string;
    }
  | { readonly kind: 'invalid' };

function Confirm({ confirmPath }: { confirmPath: string }): JSX.Element {
  return (
    <>
      <h1 className={`m-0 mb-3 ${CARD_TITLE}`}>Atsisakyti priminimų?</h1>
      <p className="mb-4 text-[0.9rem] text-muted">
        Daugiau nebegausite priminimų apie neatliktus spėjimus.
      </p>
      <form method="post" action={confirmPath}>
        <button type="submit" className={BUTTON_PRIMARY}>
          Atsisakyti
        </button>
      </form>
    </>
  );
}

function Invalid(): JSX.Element {
  return (
    <>
      <p className="mb-4 text-[0.9rem]">Nuoroda nebegalioja.</p>
      <SignInLink className={BUTTON_GHOST}>Prisijungti</SignInLink>
    </>
  );
}

/**
 * The page a reminder's "Atsisakyti priminimų" opens (R-98): sportbet turned
 * the setting off on the GET itself, which a mail scanner's prefetch would do
 * too, so here the change is the button's. A link that does not open (forged,
 * another player's, or one of sportbet's own signatures from before the
 * switch-over) says so and changes nothing.
 */
export function UnsubscribeConfirm({
  view,
}: {
  view: UnsubscribeView;
}): JSX.Element {
  return (
    <div className={`${CARD} mx-auto mb-6 max-w-[480px]`}>
      {view.kind === 'confirm' ? (
        <Confirm confirmPath={view.confirmPath} />
      ) : (
        <Invalid />
      )}
    </div>
  );
}
