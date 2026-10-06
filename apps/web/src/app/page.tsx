import { loadHub } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { connection } from 'next/server';
import { HubView } from '../components/hub/hub-view';
import { now } from '../server/clock';
import { getDb } from '../server/db';
import { readFlash } from '../server/flash';
import { hubViewer } from '../server/viewer';

export default async function HubPage() {
  await connection(); // per request, never prerendered at build
  const cards = await loadHub(getDb(), await hubViewer(), now(), ruledRules);
  return <HubView cards={cards} flash={await readFlash()} />;
}
