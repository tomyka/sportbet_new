import { ORDER_FIELD } from '../../../../components/standings/standings-protocol';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { trimInput } from '../../../../server/request/form-input';
import { autosaveRoute } from '../../../../server/request/route-responses';
import { saveStandingsOrderFromForm } from '../../../../server/standings/save-standings';

/**
 * The ladder's order (sportbet's POST /prediction/standings/reorder),
 * through autosaveRoute (this site only, a guest 401): every `order[]`,
 * trimmed as Laravel trims each.
 */
export function POST(request: Request): Promise<Response> {
  return autosaveRoute(request, (player, form) =>
    saveStandingsOrderFromForm(getDb(), {
      player,
      order: form
        .getAll(ORDER_FIELD)
        .map((value) => (typeof value === 'string' ? trimInput(value) : '')),
      now: now(),
    }),
  );
}
