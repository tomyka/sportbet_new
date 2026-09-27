import { ping } from '@sportbet/db';
import { getDb } from '../../../server/db';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<Response> {
  try {
    await ping(getDb());
    return Response.json({ status: 'ok' }, { headers: NO_STORE });
  } catch (error) {
    console.error('health: database unreachable', error);
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: NO_STORE },
    );
  }
}
