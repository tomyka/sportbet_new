import { JSDOM } from 'jsdom';

export interface Page {
  readonly path: string;
  readonly status: number;
  readonly location: string | null;
  readonly html: string;
  readonly setCookies: readonly string[];
}

export interface From {
  /** The Origin header: this site's unless given; null sends none. */
  readonly origin?: string | null;
  readonly secFetchSite?: string;
}

/** The page's document, to read it as a browser would. */
export const documentOf = (page: Page) => new JSDOM(page.html).window.document;

/** The Set-Cookie line `page` sent for `name`, if any. */
export const setCookieFor = (page: Page, name: string) =>
  page.setCookies.find((line) => line.startsWith(`${name}=`));

/**
 * A browser without JavaScript, for feature tests: a cookie jar, a client
 * address (X-Forwarded-For, for the per-IP throttles), and forms submitted
 * as the served HTML writes them - React's hidden $ACTION_* fields
 * included - so Next runs the Server Action and answers with the page a
 * visitor would see (or its redirect).
 */
export class Browser {
  readonly #base: URL;
  readonly #ip: string;
  readonly #jar = new Map<string, string>();

  constructor(base: string, ip: string) {
    this.#base = new URL(base);
    this.#ip = ip;
  }

  get origin(): string {
    return this.#base.origin;
  }

  cookie(name: string): string | undefined {
    return this.#jar.get(name);
  }

  setCookie(name: string, value: string): void {
    this.#jar.set(name, value);
  }

  get(path: string): Promise<Page> {
    return this.#send(path, 'GET', undefined, {});
  }

  post(path: string, body?: FormData, from: From = {}): Promise<Page> {
    return this.#send(path, 'POST', body, from);
  }

  /** Submits the form `data-testid={testId}` on `page`, its fields as served unless `fields` says otherwise. */
  submit(
    page: Page,
    testId: string,
    fields: Readonly<Record<string, string>> = {},
    from: From = {},
  ): Promise<Page> {
    const form = documentOf(page).querySelector(
      `form[data-testid="${testId}"]`,
    );
    if (form === null) throw new Error(`no form ${testId} on ${page.path}`);
    const body = new FormData();
    for (const input of form.querySelectorAll('input')) {
      if (input.name !== '' && !(input.name in fields)) {
        body.append(input.name, input.value);
      }
    }
    for (const [name, value] of Object.entries(fields))
      body.append(name, value);
    return this.post(page.path, body, from);
  }

  async #send(
    path: string,
    method: string,
    body: FormData | undefined,
    from: From,
  ): Promise<Page> {
    const headers: Record<string, string> = { 'X-Forwarded-For': this.#ip };
    const origin = from.origin === undefined ? this.origin : from.origin;
    if (method === 'POST' && origin !== null) headers['Origin'] = origin;
    if (from.secFetchSite !== undefined)
      headers['Sec-Fetch-Site'] = from.secFetchSite;
    const cookie = [...this.#jar]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookie !== '') headers['Cookie'] = cookie;
    const response = await fetch(new URL(path, this.#base), {
      method,
      headers,
      redirect: 'manual',
      ...(body === undefined ? {} : { body }),
    });
    const setCookies = response.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair = ''] = line.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value === '' || /max-age=0/i.test(line)) this.#jar.delete(name);
      else this.#jar.set(name, value);
    }
    return {
      path,
      status: response.status,
      location: response.headers.get('location'),
      html: await response.text(),
      setCookies,
    };
  }
}
