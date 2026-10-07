import Link from 'next/link';
import {
  ADMIN_RESULTS_ALL_PATH,
  ADMIN_RESULTS_PATH,
  RECALCULATE_PATH,
} from '../shell/shell-paths';
import { Icon, type IconName } from '../shell/icon';
import { CardIcon } from '../hub/card-icon';
import { CARD_TITLE } from '../hub/styles';
import { ConfirmForm } from './confirm-form';

/** .admin-tile: a card-sized link or button, its icon in accent over its label. */
const TILE =
  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-2.5 py-5 text-text no-underline transition hover:-translate-y-0.5 hover:text-accent hover:shadow-[0_4px_16px_var(--color-shadow)]';

function TileBody({ icon, label }: { icon: IconName; label: string }) {
  return (
    <>
      <span className="text-[1.8rem] text-accent">
        <Icon name={icon} />
      </span>
      <span className="text-center text-[0.78rem] font-semibold">{label}</span>
    </>
  );
}

/**
 * admin/index.blade.php: "Admin skydelis" and the tiles of the pages this
 * app serves - the results pages and "Perskaičiuoti taškus" (a POST that
 * asks first, issue 269). "Eigos taškai" is gone (R-65); the other tiles
 * come with their slices (13, 14).
 */
export function AdminIndexView() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      <h1 className={`col-span-full ${CARD_TITLE}`}>
        <CardIcon name="gear-fill" /> Admin skydelis
      </h1>
      <Link href={ADMIN_RESULTS_PATH} className={TILE}>
        <TileBody icon="trophy" label="Rezultatai (turas)" />
      </Link>
      <Link href={ADMIN_RESULTS_ALL_PATH} className={TILE}>
        <TileBody icon="trophy-fill" label="Visi rezultatai" />
      </Link>
      <ConfirmForm
        action={RECALCULATE_PATH}
        question="Perskaičiuoti visų rungtynių taškus? Tai gali užtrukti."
      >
        <button type="submit" className={TILE}>
          <TileBody icon="arrow-repeat" label="Perskaičiuoti taškus" />
        </button>
      </ConfirmForm>
    </div>
  );
}
