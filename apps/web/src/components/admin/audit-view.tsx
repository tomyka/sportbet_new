import type { JSX } from 'react';
import Link from 'next/link';
import type { AuditPageData } from '@sportbet/db';
import { AUDIT_TABS, type AuditTab } from '@sportbet/domain';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { TITLE_ROW } from './admin-styles';
import { AuditFilter } from './audit-filter';
import { auditHref } from './audit-links';
import { AuditTable } from './audit-tables';

const TAB_LABEL: Readonly<Record<AuditTab, string>> = {
  prisijungimai: 'Prisijungimai',
  prognozes: 'Prognozės',
  rezultatai: 'Rezultatai',
  roles: 'Rolės',
  islikimas: 'Išlikimas',
};

/** The tabs as server links, each with its count under the user filter; the active one is marked. */
function Tabs({ data }: { data: AuditPageData }): JSX.Element {
  return (
    <nav
      aria-label="Auditas"
      className="mb-3 flex flex-wrap gap-1 border-b border-border"
    >
      {AUDIT_TABS.map((tab) => {
        const active = tab === data.query.tab;
        return (
          <Link
            key={tab}
            href={auditHref(data.query, { tab })}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[0.85rem] font-semibold no-underline ${active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`}
          >
            {TAB_LABEL[tab]}{' '}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted">
              {data.counts[tab]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The active tab's own pager (sportbet's `links()`), keeping the user and the other tabs' pages; none for a single page. */
function Pager({ data }: { data: AuditPageData }): JSX.Element | null {
  if (data.lastPage <= 1) return null;
  const { tab, pages } = data.query;
  const page = pages[tab];
  const to = (target: number): string =>
    auditHref(data.query, { pages: { [tab]: target } });
  return (
    <nav
      aria-label="Puslapiai"
      className="mt-3 flex items-center justify-center gap-3 text-[0.85rem]"
    >
      {page > 1 ? (
        <Link href={to(page - 1)} className="text-accent no-underline">
          Ankstesnis
        </Link>
      ) : null}
      <span className="text-muted tabular-nums">{`${String(page)} / ${String(data.lastPage)}`}</span>
      {page < data.lastPage ? (
        <Link href={to(page + 1)} className="text-accent no-underline">
          Kitas
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * admin/audit.blade.php: "Auditas" with the user filter, the five tabs
 * (sign-ins, prediction changes, result changes, role changes, survival
 * picks) with their
 * counts, the active tab's table - 25 rows a page, Vilnius dates, no IP
 * (R-45) - and its pager.
 */
export function AuditView({ data }: { data: AuditPageData }): JSX.Element {
  return (
    <div className={CARD}>
      <div className={`${TITLE_ROW} flex-wrap`}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="clock-history" /> Auditas
        </h1>
        <AuditFilter query={data.query} users={data.users} />
      </div>
      <Tabs data={data} />
      <AuditTable active={data.active} />
      <Pager data={data} />
    </div>
  );
}
