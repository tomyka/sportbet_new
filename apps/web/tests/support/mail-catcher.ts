import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { z } from 'zod';

export interface MailCatcher {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const sentSchema = z.object({
  From: z.object({ Email: z.string(), Name: z.string() }),
  To: z.array(z.object({ Email: z.string() })).min(1),
  Subject: z.string(),
  HTML: z.string(),
  Text: z.string(),
});

interface Caught {
  readonly ID: string;
  readonly to: string;
  readonly Subject: string;
  readonly Text: string;
  readonly HTML: string;
}

async function bodyOf(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed;
  } catch {
    return null;
  }
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

const NOT_FOUND: Reply = { status: 404, body: {} };

/** What the catcher holds, and its answer to each request it serves. */
class Mailbox {
  readonly #caught: Caught[] = [];
  #sent = 0;

  /** POST /api/v1/send: one caught message per recipient, one ID for them all. */
  send(body: unknown): Reply {
    const message = sentSchema.safeParse(body);
    if (!message.success)
      return { status: 400, body: { Error: 'not a message' } };
    this.#sent += 1;
    const ID = String(this.#sent);
    const { Subject, Text, HTML } = message.data;
    for (const { Email } of message.data.To) {
      this.#caught.push({ ID, to: Email, Subject, Text, HTML });
    }
    return { status: 200, body: { ID } };
  }

  /** GET /api/v1/search?query=to:"<address>": newest first. */
  search(query: string): Reply {
    const address = /^to:"(.*)"$/.exec(query)?.[1];
    const messages = this.#caught
      .filter(({ to }) => to === address)
      .toReversed()
      .map(({ ID, to, Subject }) => ({ ID, To: [{ Address: to }], Subject }));
    return { status: 200, body: { messages, messages_count: messages.length } };
  }

  /** GET /api/v1/message/<ID>. */
  message(id: string): Reply {
    const found = this.#caught.find(({ ID }) => ID === id);
    if (found === undefined) return NOT_FOUND;
    const { ID, to, Subject, Text, HTML } = found;
    return {
      status: 200,
      body: { ID, To: [{ Address: to }], Subject, Text, HTML },
    };
  }

  /** GET /api/v1/messages: the total only. */
  count(): Reply {
    return { status: 200, body: { total: this.#caught.length } };
  }

  /** DELETE /api/v1/messages. */
  clear(): Reply {
    this.#caught.length = 0;
    return { status: 200, body: {} };
  }
}

/** The fixed paths the catcher serves, by method and path. */
const ROUTES: Readonly<
  Record<
    string,
    (box: Mailbox, request: IncomingMessage, url: URL) => Promise<Reply> | Reply
  >
> = {
  'POST /api/v1/send': async (box, request) => box.send(await bodyOf(request)),
  'GET /api/v1/search': (box, _request, url) =>
    box.search(url.searchParams.get('query') ?? ''),
  'GET /api/v1/messages': (box) => box.count(),
  'DELETE /api/v1/messages': (box) => box.clear(),
};

async function answer(box: Mailbox, request: IncomingMessage): Promise<Reply> {
  const url = new URL(request.url ?? '/', 'http://catcher');
  const method = request.method ?? 'GET';
  const route = ROUTES[`${method} ${url.pathname}`];
  if (route !== undefined) return route(box, request, url);
  const id = /^\/api\/v1\/message\/(.+)$/.exec(url.pathname)?.[1];
  return method === 'GET' && id !== undefined ? box.message(id) : NOT_FOUND;
}

/**
 * A stand-in for the part of Mailpit's HTTP API the app and the tests use
 * (spec 4b; the real Mailpit runs in E2E): POST /api/v1/send, GET
 * /api/v1/search?query=to:"<address>" (newest first), GET
 * /api/v1/message/<ID>, GET /api/v1/messages (the total only), DELETE
 * /api/v1/messages. In memory, on a free
 * loopback port: a feature test starts no container (CLAUDE.md).
 */
export async function startMailCatcher(): Promise<MailCatcher> {
  const box = new Mailbox();
  const server = createServer((request, response) => {
    void answer(box, request).then(({ status, body }) => {
      reply(response, status, body);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('mail catcher: no port');
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}
