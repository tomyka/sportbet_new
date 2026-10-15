import { isSuperadmin } from '@sportbet/domain';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { saveImport } from '../../../../server/import/import';

/** A season is 380 games and a row per game per player: Vercel's default limit is not sized for it (spec, "Vercel's limit"). */
export const maxDuration = 60;

/**
 * EuroleagueImportController::store (sportbet posts to `/admin/import`, the
 * page's own address; Next cannot serve both there), for a superadmin
 * (R-26 amended): the plan the admin previewed applied if it is still the
 * plan (R-93); answered by saveImport, a 303 with the message.
 */
export function POST(request: Request): Promise<Response> {
  return answerAdminPost(request, isSuperadmin, saveImport);
}
