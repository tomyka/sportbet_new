import { z } from 'zod';

// Reading codes back from Mailpit's API - the real one in E2E, the
// stand-in (mail-catcher.ts) in feature tests.

const searchSchema = z.object({
  messages: z.array(z.object({ ID: z.string() })),
});
const messageSchema = z.object({ Text: z.string() });
const CODE = /\b(\d{8})\b/;

/** Every code mailed to `address`, oldest first. */
export async function codesTo(
  mailpitUrl: string,
  address: string,
): Promise<string[]> {
  const search = new URL('/api/v1/search', mailpitUrl);
  search.searchParams.set('query', `to:"${address}"`);
  const found = searchSchema.parse(await (await fetch(search)).json());
  const codes: string[] = [];
  for (const { ID } of found.messages.toReversed()) {
    const message = messageSchema.parse(
      await (await fetch(new URL(`/api/v1/message/${ID}`, mailpitUrl))).json(),
    );
    const code = CODE.exec(message.Text)?.[1];
    if (code !== undefined) codes.push(code);
  }
  return codes;
}

/**
 * Waits until at least `count` codes have been mailed to `address` - a code
 * goes out after the response - and returns them, oldest first.
 */
export async function waitForCodes(
  mailpitUrl: string,
  address: string,
  count = 1,
  timeoutMs = 10_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const codes = await codesTo(mailpitUrl, address);
    if (codes.length >= count) return codes;
    if (Date.now() > deadline) {
      throw new Error(`mail: ${String(count)} code(s) did not arrive in time`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const totalSchema = z.object({ total: z.number() });

/**
 * Waits until no more mail arrives. A code is minted and mailed after the
 * response, so a test that does not wait for its code ends with it still
 * on its way, and it would land in the next test's inbox and table.
 */
export async function settleMail(
  mailpitUrl: string,
  quietMs = 300,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  for (;;) {
    const { total } = totalSchema.parse(
      await (await fetch(new URL('/api/v1/messages', mailpitUrl))).json(),
    );
    if (total === last) return;
    if (Date.now() > deadline) throw new Error('mail: still arriving');
    last = total;
    await new Promise((resolve) => setTimeout(resolve, quietMs));
  }
}

export async function clearMail(mailpitUrl: string): Promise<void> {
  await fetch(new URL('/api/v1/messages', mailpitUrl), { method: 'DELETE' });
}
