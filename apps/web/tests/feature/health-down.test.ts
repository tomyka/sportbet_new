import { expect, it } from 'vitest';
import { startDatabase, startServer } from '../support/app';

// Its own database and server: stopping this database cannot touch any other test.
it('turns 503 when the database goes away, and the server stays up', async () => {
  const database = await startDatabase();
  const server = await startServer({
    DATABASE_URL: database.getConnectionUri(),
  });
  try {
    expect((await fetch(`${server.url}/api/health`)).status).toBe(200);

    await database.stop();

    const down = await fetch(`${server.url}/api/health`);
    expect(down.status).toBe(503);
    const body: unknown = await down.json();
    expect(body).toEqual({ status: 'unavailable' });
    // Still serving: the pool's idle-client error did not kill the process.
    expect((await fetch(`${server.url}/api/health`)).status).toBe(503);
  } finally {
    await server.stop();
  }
}, 120_000);
