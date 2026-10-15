import { describe, expect, it } from 'vitest';
import { installNetworkGuard } from './network-guard';

function guarded() {
  const reached: string[] = [];
  const holder: { fetch: typeof fetch } = {
    fetch: (input) => {
      reached.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(new Response('ok'));
    },
  };
  installNetworkGuard(holder);
  return { holder, reached };
}

describe('installNetworkGuard', () => {
  it('refuses a remote host without reaching the real fetch', async () => {
    const { holder, reached } = guarded();
    await expect(holder.fetch('https://example.com/x')).rejects.toThrow(
      'network is closed in tests: example.com',
    );
    expect(reached).toEqual([]);
  });

  it('refuses a remote host given as a URL or a Request', async () => {
    const { holder } = guarded();
    await expect(
      holder.fetch(new URL('https://api-live.euroleague.net/v2')),
    ).rejects.toThrow('network is closed in tests: api-live.euroleague.net');
    await expect(
      holder.fetch(new Request('https://example.org/')),
    ).rejects.toThrow('network is closed in tests: example.org');
  });

  it.each([
    'http://localhost:8025/api',
    'http://127.0.0.1:1/',
    'http://[::1]:3000/',
  ])('lets %s through', async (url) => {
    const { holder, reached } = guarded();
    const response = await holder.fetch(url);
    expect(await response.text()).toBe('ok');
    expect(reached).toEqual([url]);
  });

  it('refuses a text that is not a URL, naming it', async () => {
    const { holder } = guarded();
    await expect(holder.fetch('not a url')).rejects.toThrow(
      'network is closed in tests: not a url',
    );
  });

  it('is installed in this project: the global fetch refuses a remote host', async () => {
    await expect(fetch('https://guard-proof.invalid/')).rejects.toThrow(
      'network is closed in tests',
    );
  });

  it('is installed in this project: a local host fails as a connection, not by the guard', async () => {
    const attempt = fetch('http://127.0.0.1:1/');
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toThrow('network is closed in tests');
  });
});
