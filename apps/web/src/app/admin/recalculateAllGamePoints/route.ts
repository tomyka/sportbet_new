import { recalculateAll } from '@sportbet/db';
import { mayRecalculate, ruledRules } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../../env';
import { ADMIN_RESULTS_PATH } from '../../../components/shell/shell-paths';
import { resultsManager } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { writeFlash } from '../../../server/flash';
import {
  refuseCrossSite,
  seeOther,
} from '../../../server/request/route-responses';

/**
 * ResultController::recalculateAllGamePoints for R-65's one button: from
 * this site only (#16), for a role that may recalculate (R-26 amended),
 * else home. Every tournament not frozen is recalculated
 * (recalculateAll), each one's time logged - its slug and milliseconds,
 * nothing personal - then the results page with sportbet's message.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const admin = await resultsManager();
  if (admin === null || !mayRecalculate(admin.role)) return seeOther('/');
  const at = now();
  const done = await recalculateAll(getDb(), {
    now: at,
    rules: ruledRules,
    timer: () => performance.now(),
  });
  for (const { tournament, ms } of done) {
    console.info(`recalculateAll: ${tournament} ${String(Math.round(ms))} ms`);
  }
  writeFlash(await cookies(), { kind: 'recalculated' }, at, env().AUTH_SECRET);
  return seeOther(ADMIN_RESULTS_PATH);
}
