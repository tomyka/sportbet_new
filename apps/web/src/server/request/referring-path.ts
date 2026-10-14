import { safeReturnPath } from '../sign-in/guarded-pages';

/**
 * Laravel's `redirect()->back()`: the path (and query) of the page the
 * request came from, as safeReturnPath accepts it - only ever a path on
 * this site - or null when there is no Referer or it is no such path.
 */
export function referringPath(request: Request): string | null {
  const referer = request.headers.get('referer');
  if (referer === null) return null;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return null;
  }
  return safeReturnPath(`${url.pathname}${url.search}`);
}
