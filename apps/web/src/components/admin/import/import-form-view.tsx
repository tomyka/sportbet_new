import type { JSX } from 'react';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../../server/flash';
import { FlashAlert } from '../../hub/flash-alert';
import { CARD, CARD_TITLE } from '../../hub/styles';
import { Icon } from '../../shell/icon';
import { ADMIN_IMPORT_PREVIEW_PATH } from '../admin-paths';
import {
  FIELD_INPUT,
  FIELD_LABEL,
  PRIMARY_BUTTON,
  TITLE_ROW,
} from '../admin-styles';
import { TournamentContextNote } from '../tournament-context-note';

/**
 * sportbet's intro, as it wrote it, and a sentence for R-13 (only games not
 * started move) in its place of the crest download R-96 drops.
 */
const INTRO =
  'Parsisiunčia Eurolygos komandas, turus ir rungtynes iš oficialaus Eurolygos tvarkaraščio. Pirmiausia spauskite „Peržiūrėti" - tai nieko nekeičia, tik parodo, kas bus padaryta. Importą galima kartoti: pasikeitęs rungtynių laikas bus atnaujintas, dublikatai nekuriami. Perkeliamos tik dar neprasidėjusios rungtynės be rezultato.';

/**
 * admin/import.blade.php's top card: "Tvarkaraščio importas", the tournament
 * it will write into (sportbet's select is not carried: the admin's
 * tournament is the one), the one-time message and the season form. The
 * preview is a GET, which writes nothing; it is reached only by this form.
 */
export function ImportFormView({
  tournament,
  flash,
  season = 'E2026',
}: {
  tournament: Tournament | null;
  flash: Flash | null;
  season?: string;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="cloud-download-fill" /> Tvarkaraščio importas
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      {tournament === null ? null : (
        <>
          <p className="mb-3 text-[0.85rem] text-muted">{INTRO}</p>
          <form
            method="get"
            action={ADMIN_IMPORT_PREVIEW_PATH}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label htmlFor="import-season" className={FIELD_LABEL}>
                Sezono kodas
              </label>
              <input
                id="import-season"
                type="text"
                name="season"
                defaultValue={season}
                required
                pattern="[A-Z]{1,2}[0-9]{4}"
                className={`${FIELD_INPUT} w-40`}
              />
              <div className="mt-1 text-[0.72rem] text-muted">
                E2026 - 2026-27 sezonas
              </div>
            </div>
            <button type="submit" className={PRIMARY_BUTTON}>
              <Icon name="search" /> Peržiūrėti
            </button>
          </form>
        </>
      )}
    </div>
  );
}
