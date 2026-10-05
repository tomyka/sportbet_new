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

/**
 * A stand-in for the part of Mailpit's HTTP API the app and the tests use
 * (spec 4b; the real Mailpit runs in E2E): POST /api/v1/send, GET
 * /api/v1/search?query=to:"<address>" (newest first), GET
 * /api/v1/message/<ID>, GET /api/v1/messages (the total only), DELETE
 * /api/v1/messages. In memory, on a free
 * loopback port: a feature test starts no container (CLAUDE.md).
 */
export async function startMailCatcher(): Promise<MailCatcher> {
  const caught: Caught[] = [];
  let sent = 0;
  const reply = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://catcher');
    if (request.method === 'POST' && url.pathname === '/api/v1/send') {
      const message = sentSchema.safeParse(await bodyOf(request));
      if (!message.success) {
        reply(response, 400, { Error: 'not a message' });
        return;
      }
      sent += 1;
      const ID = String(sent);
      for (const { Email } of message.data.To) {
        caught.push({
          ID,
          to: Email,
          Subject: message.data.Subject,
          Text: message.data.Text,
          HTML: message.data.HTML,
        });
      }
      reply(response, 200, { ID });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/search') {
      const address = /^to:"(.*)"$/.exec(
        url.searchParams.get('query') ?? '',
      )?.[1];
      const messages = caught
        .filter(({ to }) => to === address)
        .toReversed()
        .map(({ ID, to, Subject }) => ({ ID, To: [{ Address: to }], Subject }));
      reply(response, 200, { messages, messages_count: messages.length });
      return;
    }
    const id = /^\/api\/v1\/message\/(.+)$/.exec(url.pathname)?.[1];
    if (request.method === 'GET' && id !== undefined) {
      const found = caught.find(({ ID }) => ID === id);
      if (found === undefined) {
        reply(response, 404, {});
        return;
      }
      reply(response, 200, {
        ID: found.ID,
        To: [{ Address: found.to }],
        Subject: found.Subject,
        Text: found.Text,
        HTML: found.HTML,
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/messages') {
      reply(response, 200, { total: caught.length });
      return;
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v1/messages') {
      caught.length = 0;
      reply(response, 200, {});
      return;
    }
    reply(response, 404, {});
  };
  const server = createServer((request, response) => {
    void handle(request, response);
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
