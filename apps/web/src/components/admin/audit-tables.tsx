import type { JSX, ReactNode } from 'react';
import type { AuditTabRows } from '@sportbet/db';
import type {
  AuditAdminRow,
  AuditLoginRow,
  AuditPredictionRow,
  AuditResultRow,
  AuditResultSide,
  AuditSurvivalRow,
} from '@sportbet/domain';
import { vilniusStamp } from '../format/vilnius-time';
import { TABLE, TD, TH } from './admin-styles';
import { ROLE_LABEL } from './role-labels';

/** A forgotten or absent value, as sportbet printed it. */
const DASH = '-';

const LOGIN_METHOD: Readonly<Record<AuditLoginRow['method'], string>> = {
  email_code: 'El. paštas',
  register: 'Registracija',
  // Slice 19, sportbet's: Google sign-in and registration with Google.
  google: 'Google',
  register_google: 'Registracija (Google)',
};

const ADMIN_KIND: Readonly<Record<AuditAdminRow['kind'], string>> = {
  role_change: 'Rolės keitimas',
  account_deletion: 'Paskyros ištrynimas',
};

/** A pair as `h:a`, or a dash for none. */
const pairText = (pair: { home: number; away: number } | null): string =>
  pair === null ? DASH : `${String(pair.home)}:${String(pair.away)}`;

/** A result's side (R-63): a score, "Atidėta" for a postponed game, a dash for no result. */
function sideText(side: AuditResultSide): string {
  switch (side.kind) {
    case 'score':
      return pairText(side);
    case 'postponed':
      return 'Atidėta';
    case 'none':
      return DASH;
  }
}

const roleText = (role: AuditAdminRow['oldRole']): string =>
  role === null ? DASH : ROLE_LABEL[role];

/** The headers and rows of one tab, in the table the audit page draws. */
function Table({
  headers,
  children,
}: {
  headers: readonly string[];
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${String(index)}-${header}`} className={TH}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Row = ({ children }: { children: ReactNode }): JSX.Element => (
  <tr data-testid="audit-row">{children}</tr>
);

const Cell = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element => <td className={`${TD} ${className}`}>{children}</td>;

function Logins({ rows }: { rows: readonly AuditLoginRow[] }): JSX.Element {
  return (
    <Table headers={['Vartotojas', 'Metodas', 'Data']}>
      {rows.map((row) => (
        <Row key={`${row.username}-${String(row.at)}-${row.method}`}>
          <Cell>{row.username}</Cell>
          <Cell>{LOGIN_METHOD[row.method]}</Cell>
          <Cell className="tabular-nums">{vilniusStamp(row.at)}</Cell>
        </Row>
      ))}
    </Table>
  );
}

function Predictions({
  rows,
}: {
  rows: readonly AuditPredictionRow[];
}): JSX.Element {
  return (
    <Table headers={['Vartotojas', 'Rungtynės', 'Sena', '', 'Nauja', 'Data']}>
      {rows.map((row) => (
        <Row key={`${row.username}-${String(row.at)}-${row.home}-${row.away}`}>
          <Cell>{row.username}</Cell>
          <Cell>{`${row.home} - ${row.away}`}</Cell>
          <Cell className="text-right tabular-nums text-muted">
            {pairText(row.old)}
          </Cell>
          <Cell className="text-muted">→</Cell>
          <Cell className="font-semibold tabular-nums">
            {pairText(row.new)}
          </Cell>
          <Cell className="tabular-nums">{vilniusStamp(row.at)}</Cell>
        </Row>
      ))}
    </Table>
  );
}

function Results({ rows }: { rows: readonly AuditResultRow[] }): JSX.Element {
  return (
    <Table headers={['Vartotojas', 'Rungtynės', 'Sena', '', 'Nauja', 'Data']}>
      {rows.map((row) => (
        <Row
          key={`${row.username ?? DASH}-${String(row.at)}-${row.home}-${row.away}`}
        >
          <Cell>{row.username ?? DASH}</Cell>
          <Cell>{`${row.home} - ${row.away}`}</Cell>
          <Cell className="text-right tabular-nums text-muted">
            {sideText(row.old)}
          </Cell>
          <Cell className="text-muted">→</Cell>
          <Cell className="font-semibold tabular-nums">
            {sideText(row.new)}
          </Cell>
          <Cell className="tabular-nums">{vilniusStamp(row.at)}</Cell>
        </Row>
      ))}
    </Table>
  );
}

function Survival({
  rows,
}: {
  rows: readonly AuditSurvivalRow[];
}): JSX.Element {
  return (
    <Table headers={['Vartotojas', 'Turas', 'Sena', '', 'Nauja', 'Data']}>
      {rows.map((row) => (
        <Row
          key={`${row.username}-${String(row.at)}-${String(row.round)}-${row.team}`}
        >
          <Cell>{row.username}</Cell>
          <Cell className="tabular-nums">{String(row.round)}</Cell>
          <Cell className="text-muted">{row.oldTeam ?? DASH}</Cell>
          <Cell className="text-muted">→</Cell>
          <Cell className="font-semibold">{row.team}</Cell>
          <Cell className="tabular-nums">{vilniusStamp(row.at)}</Cell>
        </Row>
      ))}
    </Table>
  );
}

function Roles({ rows }: { rows: readonly AuditAdminRow[] }): JSX.Element {
  return (
    <Table
      headers={[
        'Atliko',
        'Veiksmas',
        'Vartotojas',
        'Sena rolė',
        '',
        'Nauja rolė',
        'Data',
      ]}
    >
      {rows.map((row) => (
        <Row
          key={`${row.actor ?? DASH}-${row.target ?? DASH}-${String(row.at)}-${row.kind}`}
        >
          <Cell>{row.actor ?? DASH}</Cell>
          <Cell>{ADMIN_KIND[row.kind]}</Cell>
          <Cell>{row.target ?? DASH}</Cell>
          <Cell className="text-muted">{roleText(row.oldRole)}</Cell>
          <Cell className="text-muted">→</Cell>
          <Cell className="font-semibold">{roleText(row.newRole)}</Cell>
          <Cell className="tabular-nums">{vilniusStamp(row.at)}</Cell>
        </Row>
      ))}
    </Table>
  );
}

const EMPTY: Readonly<Record<AuditTabRows['tab'], string>> = {
  prisijungimai: 'Prisijungimų įrašų nėra.',
  prognozes: 'Prognozių pakeitimų nėra.',
  rezultatai: 'Rezultatų pakeitimų nėra.',
  roles: 'Rolių pakeitimų nėra.',
  islikimas: 'Išlikimo pasirinkimų nėra.',
};

/** The active tab's rows, or its own words when there are none. */
export function AuditTable({ active }: { active: AuditTabRows }): JSX.Element {
  if (active.rows.length === 0) {
    return <p className="py-3 text-[0.9rem] text-muted">{EMPTY[active.tab]}</p>;
  }
  switch (active.tab) {
    case 'prisijungimai':
      return <Logins rows={active.rows} />;
    case 'prognozes':
      return <Predictions rows={active.rows} />;
    case 'rezultatai':
      return <Results rows={active.rows} />;
    case 'roles':
      return <Roles rows={active.rows} />;
    case 'islikimas':
      return <Survival rows={active.rows} />;
  }
}
