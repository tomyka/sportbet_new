import type { RegistrationForm } from '@sportbet/db';
import Link from 'next/link';
import { vilniusDateTime } from '../format/vilnius-time';
import { CardIcon } from '../hub/card-icon';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { headerLine } from '../hub/header-line';
import {
  BUTTON_GHOST,
  BUTTON_GHOST_SMALL,
  BUTTON_PRIMARY,
  CARD,
  CARD_TITLE,
} from '../hub/styles';

/**
 * TournamentController::registerForm's page (register.blade.php): a page
 * to read and a confirmation to give (issue #63), posted to its submit.
 * R-54: "Registracija galima iki {Vilnius time}." replaces sportbet's
 * "...tik iki pirmųjų turnyro rungtynių pradžios.", and is left out when
 * no moment closes it. "Taisyklės" is text in the link's colour until the
 * rules page exists. The title is the card's, the way back inline in it,
 * as sportbet draws them.
 */
export function RegisterFormView({
  form,
  error,
}: {
  form: Extract<RegistrationForm, { step: 'open' }>;
  /** Only the unconfirmed submit's message: the others are the hub's. */
  error: Extract<Flash, { kind: 'confirm-required' }> | null;
}) {
  const { tournament, profile } = form;
  return (
    <div className={`${CARD} mx-auto mb-6 max-w-[640px]`}>
      <div className={CARD_TITLE}>
        <CardIcon name="pencil-square" />
        <h1 className={`m-0 inline ${CARD_TITLE}`}>
          Registracija į turnyrą
        </h1>{' '}
        <Link href="/" className={BUTTON_GHOST_SMALL}>
          ← Turnyrai
        </Link>
      </div>
      <div className="mt-4 mb-1 text-[1.1rem] font-bold">{tournament.name}</div>
      <div className="text-[0.85rem] text-muted">
        {headerLine(profile, tournament.endsOn)}
      </div>
      {profile.description === null ? null : (
        <p className="mt-3 mb-0 text-[0.88rem] text-muted">
          {profile.description}
        </p>
      )}
      <div className="my-5 rounded-[10px] border border-border bg-surface-2 p-4">
        <div className="mb-[10px] text-[0.88rem] font-bold">
          Ką gausite užsiregistravę
        </div>
        <ul className="m-0 flex list-disc flex-col gap-[6px] pl-5 text-[0.86rem] text-muted">
          <li>Vietą bendroje šio turnyro lygoje ir lyderių lentelėje.</li>
          <li>{`Spėjimų korteles visoms turnyro rungtynėms: ${String(form.games)}.`}</li>
          <li>{`Komandų vietų prognozes: ${String(form.teams)} komandos.`}</li>
        </ul>
      </div>
      <p className="mb-4 text-[0.85rem] text-muted">
        {form.closesAt === null ? null : (
          <>
            <span>{`Registracija galima iki ${vilniusDateTime(form.closesAt)}.`}</span>{' '}
          </>
        )}
        <span className="text-accent">Taisyklės</span>
      </p>
      {error === null ? null : <FlashAlert flash={error} />}
      <form
        method="post"
        action={`/tournament/${tournament.slug}/register/submit`}
        data-testid="tournament-register"
      >
        <label className="mb-4 flex items-center gap-2 text-[0.9rem]">
          <input type="checkbox" name="confirm" value="1" />
          Patvirtinu, kad noriu dalyvauti šiame turnyre.
        </label>
        <button type="submit" className={BUTTON_PRIMARY}>
          Registruotis į turnyrą
        </button>{' '}
        <Link href="/" className={BUTTON_GHOST}>
          Atšaukti
        </Link>
      </form>
    </div>
  );
}
