import type { JSX } from 'react';
import {
  LEAGUE_MESSAGES,
  type Flash,
  type LeagueMessage,
} from '../../server/flash';
import { throttledText } from '../../server/sign-in/texts';
import { AdminAlert } from '../admin/admin-alert';
import { ImportAlert } from '../admin/import/import-alert';
import { Alert } from './alert';

const TEXT = {
  'registration-closed': 'Registracija į šį turnyrą jau pasibaigė.',
  'confirm-required': 'Patvirtinkite, kad norite dalyvauti šiame turnyre.',
} as const;

/** The league page's texts: sportbet's (LeagueController), and R-119's hand-over (the owner's ruling). */
const LEAGUE_TEXT: Readonly<Record<LeagueMessage, string>> = {
  'league-created': 'Lyga sukurta',
  'league-updated': 'Lyga atnaujinta',
  'invite-sent': 'Kvietimas išsiųstas',
  'league-joined': 'Prisijungta prie lygos',
  'invite-declined': 'Kvietimas atmestas',
  'league-deleted': 'Lyga ištrinta',
  'league-left': 'Palikote lygą',
  'league-handed-over': 'Lygos valdymas perduotas',
  'payments-saved': 'Mokėjimai išsaugoti',
  'details-saved': 'Rekvizitai išsaugoti',
  'no-tournament':
    'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
  'already-member-or-invited': 'Vartotojas jau narys arba pakviestas',
  'invitee-not-in-tournament':
    'Šis žaidėjas dar neprisijungė prie šio turnyro.',
  'join-tournament-first': 'Pirmiausia prisijunkite prie šio turnyro.',
  'delete-public': 'Viešos lygos ištrinti negalima',
  'leave-public': 'Negalima palikti Bendros lygos',
  'leave-owner': 'Perduokite lygos valdymą kitam nariui prieš išeidami',
  'leave-only-league': 'Negalima palikti vienintelės lygos',
  'transfer-not-owner': 'Lygos valdymą gali perduoti tik jos savininkas',
  'transfer-not-a-member': 'Valdymą galima perduoti tik šios lygos nariui',
  'transfer-already-owner': 'Jūs jau esate šios lygos savininkas',
  'transfer-public': 'Viešos lygos valdymo perduoti negalima',
  'details-iban-invalid':
    'Neteisingas IBAN - patikrinkite, ar nesuklydote skaitmeniu.',
  'details-half-pair':
    'Nurodykite ir gavėją, ir sąskaitą - su viena iš jų rekvizitai nerodomi.',
};

/** A league message, its tone sportbet's (`info` or `error`). */
function LeagueAlert({ message }: { message: LeagueMessage }): JSX.Element {
  return LEAGUE_MESSAGES[message] === 'info' ? (
    <Alert tone="ok" icon="check-circle-fill">
      {LEAGUE_TEXT[message]}
    </Alert>
  ) : (
    <Alert tone="bad" icon="exclamation-circle">
      {LEAGUE_TEXT[message]}
    </Alert>
  );
}

type AdminPageFlash = Extract<
  Flash,
  { kind: 'admin' | 'admin-invalid' | 'imported' | 'import-refused' }
>;

const ADMIN_PAGE_KINDS: readonly string[] = [
  'admin',
  'admin-invalid',
  'imported',
  'import-refused',
];

const isAdminPageFlash = (flash: Flash): flash is AdminPageFlash =>
  ADMIN_PAGE_KINDS.includes(flash.kind);

/** The admin pages' messages: the structure and people screens', and the import's (slice 15). */
function AdminPageAlert({ flash }: { flash: AdminPageFlash }): JSX.Element {
  switch (flash.kind) {
    case 'admin':
    case 'admin-invalid':
      return <AdminAlert flash={flash} />;
    case 'imported':
    case 'import-refused':
      return <ImportAlert flash={flash} />;
  }
}

/**
 * sportbet's `alert alert-success` (`session('info')`) or `alert
 * alert-danger` (`session('error')`), as custom.css colours them.
 */
export function FlashAlert({ flash }: { flash: Flash }): JSX.Element {
  if (isAdminPageFlash(flash)) return <AdminPageAlert flash={flash} />;
  switch (flash.kind) {
    case 'recalculated':
      // sportbet's alert alert-primary (session('info') on the admin page).
      return (
        <Alert tone="accent" icon="info-circle">
          Visi taškų rezultatai perskaičiuoti.
        </Alert>
      );
    case 'league-switched':
      return (
        <Alert tone="ok" icon="check-circle-fill">
          Lyga pakeista
        </Alert>
      );
    case 'league':
      return <LeagueAlert message={flash.message} />;
    case 'registered':
      return (
        <Alert tone="ok" icon="check-circle-fill">
          {`Užsiregistravote į turnyrą: ${flash.tournament}`}
        </Alert>
      );
    case 'throttled':
      return (
        <Alert tone="bad" icon="exclamation-circle">
          {throttledText(flash.minutes)}
        </Alert>
      );
    case 'registration-closed':
    case 'confirm-required':
      return (
        <Alert tone="bad" icon="exclamation-circle">
          {TEXT[flash.kind]}
        </Alert>
      );
  }
}
