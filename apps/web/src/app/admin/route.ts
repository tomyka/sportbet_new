import { ADMIN_PATH } from '../../components/shell/shell-paths';

/**
 * sportbet's route 'admin': a GET to /admin redirects (302) to the
 * dashboard at /admin/index, for anyone - the gate is the dashboard's
 * (AdminMiddleware on admin.index). GET only, as sportbet registers it.
 */
export function GET(): Response {
  return new Response(null, { status: 302, headers: { Location: ADMIN_PATH } });
}
