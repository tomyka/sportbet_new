import { recalculateAll } from '@sportbet/db';
import {
  mayRecalculate,
  recalculateAllLimits,
  ruledRules,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../../env';
import { ADMIN_RESULTS_PATH } from '../../../components/shell/shell-paths';
import { adminGate } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { logInfo } from '../../../server/log';
import { pointsChanged } from '../../../server/points-changed';
import { writeFlash } from '../../../server/flash';
import { throttle } from '../../../server/sign-in/throttle';
import {
  refuseCrossSite,
  seeOther,
} from '../../../server/request/route-responses';

/**
 * ResultController::recalculateAllGamePoints for R-65's one button: from
 * this site only (#16), for a role that may recalculate (R-26 amended),
 * else home; twice a minute per account (R-69), past which nothing is
 * recalculated and the results page says why. Every tournament not frozen is recalculated
 * (recalculateAll), each one's time logged - its slug and milliseconds,
 * nothing personal - then the results page with sportbet's message.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const admin = await adminGate(mayRecalculate);
  if (admin === null) return seeOther('/');
  const at = now();
  const db = getDb();
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  // R-69: twice a minute per account; past it nothing is recalculated.
  const verdict = await throttle(db, recalculateAllLimits(admin.player), at);
  if (!verdict.allowed) {
    writeFlash(
      jar,
      { kind: 'throttled', minutes: verdict.minutes },
      at,
      secret,
    );
    return seeOther(ADMIN_RESULTS_PATH);
  }
  const done = await recalculateAll(db, {
    now: at,
    rules: ruledRules,
    timer: () => performance.now(),
  });
  pointsChanged();
  for (const { tournament, ms } of done) {
    logInfo('recalculateAll', {
      tournament,
      ms: Math.round(ms),
    });
  }
  writeFlash(jar, { kind: 'recalculated' }, at, secret);
  return seeOther(ADMIN_RESULTS_PATH);
}
