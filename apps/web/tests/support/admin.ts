import type { Browser, Page } from './browser';

/** A form as the admin pages post it: each field once, or - for a list - once per value. */
export function formOf(
  fields: Readonly<Record<string, string | readonly string[]>>,
): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const each of typeof value === 'string' ? [value] : value) {
      body.append(name, each);
    }
  }
  return body;
}

/** The page a 303 points at, opened as the browser would, so its one-time message shows. */
export async function followed(browser: Browser, posted: Page): Promise<Page> {
  if (posted.status !== 303 || posted.location === null) {
    throw new Error(
      `${posted.path} answered ${String(posted.status)}, not a 303`,
    );
  }
  return browser.get(posted.location);
}

/** The text of the page's alerts and statuses, one-time messages among them. */
export function said(page: Page): string {
  return page.html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Every admin write the pages post, by path - for the gates every one of them has. */
export const SUPERADMIN_POSTS = [
  '/admin/tournaments/save',
  '/admin/tournaments/1',
  '/admin/tournaments/1/context',
  '/admin/events/save',
  '/admin/eventInsert',
  '/admin/insertGame',
  '/admin/updateGame',
  '/admin/deleteGame',
  '/admin/teaminsert/save',
  '/admin/updateTeamDetails',
] as const;
