import type { JSX } from 'react';
import { loadHub } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { connection } from 'next/server';
import { HubView } from '../components/hub/hub-view';
import { now } from '../server/clock';
import { getDb } from '../server/db';
import { readFlash } from '../server/flash';
import { cachedGuestPanels } from '../server/public-league';
import { hubViewer } from '../server/viewer';

export default async function HubPage(): Promise<JSX.Element> {
  await connection(); // per request, never prerendered at build
  const cards = await loadHub(getDb(), {
    viewer: await hubViewer(),
    now: now(),
    rules: ruledRules,
    guestPanelsOf: cachedGuestPanels,
  });
  return <HubView cards={cards} flash={await readFlash()} />;
}
