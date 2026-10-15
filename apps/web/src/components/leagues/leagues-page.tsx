import type { JSX } from 'react';
import type { LeaguesPage, PlayerId } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { CardIcon } from '../hub/card-icon';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { InviteList } from './invite-list';
import { CreateLeague } from './league-form-dialog';
import { LeagueRow } from './league-row';

/**
 * sportbet's `/leagues` (leagues/index.blade.php): the message of the last
 * action, the pending invites, and "Mano lygos" - the player's leagues in
 * the tournament with what each lets them do, or "Dar nepriklausote jokiai
 * lygai." Each admin card of a private league links to its "Mokėjimai".
 */
export function LeaguesView({
  page,
  viewer,
  flash,
}: {
  page: LeaguesPage;
  viewer: PlayerId;
  flash: Flash | null;
}): JSX.Element {
  return (
    <>
      <h1 className="sr-only">Lygos</h1>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <InviteList invites={page.invites} />
      <div className={CARD}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className={`${CARD_TITLE} flex items-center`}>
            <CardIcon name="trophy" />
            Mano lygos
          </div>
          <CreateLeague />
        </div>
        {page.mine.length === 0 ? (
          <div className="py-6 text-center text-[0.9rem] text-muted">
            Dar nepriklausote jokiai lygai.
          </div>
        ) : (
          page.mine.map((league) => (
            <LeagueRow key={league.id} league={league} viewer={viewer} />
          ))
        )}
      </div>
    </>
  );
}
