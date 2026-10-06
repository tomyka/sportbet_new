import type { TournamentPage } from '@sportbet/db';
import type { TournamentPageAction } from '@sportbet/domain';
import Link from 'next/link';
import { CardIcon } from '../hub/card-icon';
import { sportName } from '../hub/header-line';
import {
  BUTTON_GHOST,
  BUTTON_INERT,
  BUTTON_PRIMARY,
  CARD,
} from '../hub/styles';
import { Icon } from '../shell/icon';

/** .sb-card-title: small, bold, upper-case and muted. */
const TITLE = 'text-[0.7rem] font-bold tracking-[0.5px] text-muted uppercase';

function BackToHub() {
  return (
    <Link href="/" className={BUTTON_GHOST}>
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
 * TournamentController::show (show.blade.php): a finished tournament
 * shows only the way back; any other its header card - name, description,
 * sport, start year and players, and the button for the viewer. The name
 * is the card's title, with the way back beside it in the title's own
 * case, as sportbet draws it. The public league table below it is slice
 * 8's.
 */
export function TournamentPageView({ page }: { page: TournamentPage }) {
  if (page.finished) {
    return (
      <div className="mb-4">
        <BackToHub />
      </div>
    );
  }
  const { tournament, profile } = page;
  const sport = sportName(profile.sport);
  const year =
    profile.startsOn === null ? '' : ` · ${profile.startsOn.slice(0, 4)}`;
  return (
    <article className={`${CARD} mb-4`}>
      <div className={`mb-3 ${TITLE}`}>
        <CardIcon name="globe2" />
        <h1 className={`m-0 inline ${TITLE}`}>{tournament.name}</h1>{' '}
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
  );
}
