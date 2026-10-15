/** The form body a stubbed `fetch` was asked to post, as text (a URLSearchParams, as postSave sends). */
export function postedBody(init: RequestInit): string {
  return init.body instanceof URLSearchParams ? init.body.toString() : '';
}
