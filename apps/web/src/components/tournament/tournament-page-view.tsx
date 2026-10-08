import type { JSX } from 'react';
import type {
  LeagueTable as LeagueTableData,
  TournamentPage,
} from '@sportbet/db';
import type { MedalRow, TournamentPageAction } from '@sportbet/domain';
import Link from 'next/link';
import { LeagueTable } from '../dashboard/league-table';
import { CardIcon } from '../hub/card-icon';
import { sportName } from '../hub/header-line';
import {
  BUTTON_GHOST_SMALL,
  BUTTON_INERT,
  BUTTON_PRIMARY,
  CARD,
  CARD_TITLE,
} from '../hub/styles';
import { MedalsPanel } from '../hub/widgets';
import { Icon } from '../shell/icon';

function BackToHub() {
  return (
    <Link href="/" className={BUTTON_GHOST_SMALL}>
      ← Turnyrai
    </Link>
  );
}

function PageAction({
  action,
  slug,
}: {
  action: TournamentPageAction;
  slug: string;
}) {
  switch (action) {
    case 'sign-in':
      return (
        <a href={`/login?tournament=${slug}`} className={BUTTON_PRIMARY}>
          Prisijungti ir dalyvauti
        </a>
      );
    case 'register':
      return (
        <div className="mb-4">
          <a href={`/tournament/${slug}/register`} className={BUTTON_PRIMARY}>
            <Icon name="pencil-square" /> Registruotis į turnyrą
          </a>
        </div>
      );
    case 'create-league':
      // The leagues page is slice 12's: text until it exists.
      return (
        <div className="mb-4">
          <span className={BUTTON_INERT}>
            <Icon name="plus-circle" /> Sukurti lygą šiame turnyre
          </span>
        </div>
      );
  }
}

/**
 * show.blade.php's public league: the tournament's listed players' table
 * (R-73) with no row the viewer's, then the medals, each when not empty.
 */
function PublicLeague({
  table,
  medals,
}: {
  table: LeagueTableData;
  medals: readonly MedalRow[];
}) {
  return (
    <>
      {table.rows.length === 0 ? null : (
        <div className="mb-3">
          <LeagueTable table={table} me={null} />
        </div>
      )}
      {medals.length === 0 ? null : (
        <div className="mb-3">
          <MedalsPanel medals={medals} variant="league" />
        </div>
      )}
    </>
  );
}

/**
 * TournamentController::show (show.blade.php): a finished tournament
 * shows only the way back; any other its header card - name, description,
 * sport, start year and players, and the button for the viewer. The name
 * is the card's title, with the way back beside it in the title's own
 * case, as sportbet draws it. Below either, the public league's table and
 * medals, so a finished tournament stays browsable.
 */
export function TournamentPageView({
  page,
  table,
  medals,
}: {
  page: TournamentPage;
  table: LeagueTableData;
  medals: readonly MedalRow[];
}): JSX.Element {
  if (page.finished) {
    return (
      <>
        <div className="mb-4">
          <BackToHub />
        </div>
        <PublicLeague table={table} medals={medals} />
      </>
    );
  }
  const { tournament, profile } = page;
  const sport = sportName(profile.sport);
  const year =
    profile.startsOn === null ? '' : ` · ${profile.startsOn.slice(0, 4)}`;
  return (
    <>
      <article className={`${CARD} mb-4`}>
        <div className={`mb-3 ${CARD_TITLE}`}>
          <CardIcon name="globe2" />
          <h1 className={`m-0 inline ${CARD_TITLE}`}>{tournament.name}</h1>{' '}
          <BackToHub />
        </div>
        {profile.description === null ? null : (
          <p className="mb-4 text-[0.9rem] text-muted">{profile.description}</p>
        )}
        <div className="mb-5 text-[0.85rem] text-muted">
          {`${sport}${year} · ${String(page.participants)} dalyviai`}
        </div>
        <PageAction action={page.action} slug={tournament.slug} />
      </article>
      <PublicLeague table={table} medals={medals} />
    </>
  );
}
