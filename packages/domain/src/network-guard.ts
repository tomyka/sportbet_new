// The test fetch guard (slice 15): no test reaches a host but this machine.
// A Vitest setup file calls `installNetworkGuard` in every project; a test's
// own stub of `fetch` is installed after it and still wins.

const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
]);

interface FetchHolder {
  fetch: typeof fetch;
}

function hostOf(input: Parameters<typeof fetch>[0]): string {
  const text =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    return new URL(text).hostname;
  } catch {
    return text;
  }
}

/** Wraps `holder.fetch` so any host but a local one throws before connecting. */
export function installNetworkGuard(holder: FetchHolder = globalThis): void {
  const real = holder.fetch.bind(holder);
  holder.fetch = (input, init) => {
    const host = hostOf(input);
    if (!LOCAL_HOSTS.has(host)) {
      return Promise.reject(new Error(`network is closed in tests: ${host}`));
    }
    return real(input, init);
  };
}
