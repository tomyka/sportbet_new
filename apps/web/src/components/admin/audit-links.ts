import {
  AUDIT_PAGE_PARAMS,
  AUDIT_TABS,
  type AuditPageQuery,
  type AuditTab,
} from '@sportbet/domain';
import { ADMIN_AUDIT_PATH } from './admin-paths';

/** What a link changes of the page being shown. */
export interface AuditChange {
  readonly tab?: AuditTab;
  readonly user?: number | null;
  readonly pages?: Partial<Record<AuditTab, number>>;
}

/**
 * A link to the audit page as it is now with `change` applied: the tab (the
 * sign-ins are the bare page), the user filter, and each tab's own page when
 * it is above 1 - so a tab's pager and the user filter keep what the others
 * show (`logins_page`, `predictions_page`, `results_page`, `roles_page`).
 */
export function auditHref(query: AuditPageQuery, change: AuditChange): string {
  const tab = change.tab ?? query.tab;
  const user = change.user === undefined ? query.user : change.user;
  const params: string[] = [];
  if (tab !== 'prisijungimai') params.push(`tab=${tab}`);
  if (user !== null) params.push(`user=${String(user)}`);
  for (const each of AUDIT_TABS) {
    const page = change.pages?.[each] ?? query.pages[each];
    if (page > 1) params.push(`${AUDIT_PAGE_PARAMS[each]}=${String(page)}`);
  }
  return params.length === 0
    ? ADMIN_AUDIT_PATH
    : `${ADMIN_AUDIT_PATH}?${params.join('&')}`;
}
