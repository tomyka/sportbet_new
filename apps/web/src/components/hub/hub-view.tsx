import type { HubCard } from '@sportbet/db';
import type { HubGroup } from '@sportbet/domain';
import { CharityCard } from './charity-card';
import type { Flash } from '../../server/flash';
import { FlashAlert } from './flash-alert';
import { GLYPH } from './glyphs';
import { CARD_FRAME } from './styles';
import { TournamentCard } from './tournament-card';

const GROUPS: readonly (readonly [HubGroup, string])[] = [
  ['active', `${GLYPH.active} Vykstantys turnyrai`],
  ['upcoming', `${GLYPH.upcoming} Artėjantys turnyrai`],
  ['finished', `${GLYPH.finished} Pasibaigę turnyrai`],
];

/**
 * TournamentController::hub's page (hub.blade.php): the one-time message,
 * the charity card, the empty state, each group's cards in the order
 * given (orderHub), the disclaimer. The admin's "Sukurti turnyrą" in the
 * empty state arrives with the admin screens.
 */
export function HubView({
  cards,
  flash,
}: {
  cards: readonly HubCard[];
  flash: Flash | null;
}) {
  return (
    <>
      <h1 className="sr-only">Turnyrai</h1>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <CharityCard />
      {cards.length === 0 ? (
        <div className={`${CARD_FRAME} mb-6 px-5 py-10 text-center`}>
          <div aria-hidden="true" className="mb-3 text-[2rem]">
            {GLYPH.trophy}
          </div>
          <div className="mb-[6px] text-[1.05rem] font-bold">
            Turnyrų kol kas nėra
          </div>
          <p className="m-0 text-[0.88rem] text-muted">
            Kai tik bus paskelbtas naujas turnyras, jis atsiras čia.
          </p>
        </div>
      ) : null}
      {GROUPS.map(([group, label]) => {
        const inGroup = cards.filter((card) => card.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} data-testid={`hub-group-${group}`}>
            <h2 className="mt-7 mb-3 text-[0.82rem] font-bold tracking-[0.08em] text-muted uppercase">
              {label}
            </h2>
            {inGroup.map((card) => (
              <TournamentCard key={card.tournament.id} card={card} />
            ))}
          </section>
        );
      })}
      <p className="mt-2 text-[0.78rem] text-muted opacity-65">
        SportBet yra nemokamas pramoginis žaidimas - realių pinigų lažybų nėra.
      </p>
    </>
  );
}
