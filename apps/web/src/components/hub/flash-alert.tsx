import type { JSX } from 'react';
import { Icon } from '../shell/icon';
import {
  LEAGUE_MESSAGES,
  type Flash,
  type LeagueMessage,
} from '../../server/flash';
import { throttledText } from '../../server/sign-in/texts';

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

const ALERT =
  'mb-4 flex items-center gap-2 rounded-[6px] border px-4 py-2 text-[0.9rem]';

/**
 * sportbet's `alert alert-success` (`session('info')`) or `alert
 * alert-danger` (`session('error')`), as custom.css colours them.
 */
export function FlashAlert({ flash }: { flash: Flash }): JSX.Element {
  if (flash.kind === 'recalculated') {
    // sportbet's alert alert-primary (session('info') on the admin page).
    return (
      <div
        role="status"
        className={`${ALERT} border-accent bg-accent-tint text-accent`}
      >
        <Icon name="info-circle" />
        Visi taškų rezultatai perskaičiuoti.
      </div>
    );
  }
  if (flash.kind === 'league-switched') {
    return (
      <div role="status" className={`${ALERT} border-ok bg-ok-tint text-ok`}>
        <Icon name="check-circle-fill" />
        Lyga pakeista
      </div>
    );
  }
  if (flash.kind === 'league') {
    const info = LEAGUE_MESSAGES[flash.message] === 'info';
    return info ? (
      <div role="status" className={`${ALERT} border-ok bg-ok-tint text-ok`}>
        <Icon name="check-circle-fill" />
        {LEAGUE_TEXT[flash.message]}
      </div>
    ) : (
      <div role="alert" className={`${ALERT} border-bad bg-bad-tint text-bad`}>
        <Icon name="exclamation-circle" />
        {LEAGUE_TEXT[flash.message]}
      </div>
    );
  }
  if (flash.kind === 'registered') {
    return (
      <div role="status" className={`${ALERT} border-ok bg-ok-tint text-ok`}>
        <Icon name="check-circle-fill" />
        {`Užsiregistravote į turnyrą: ${flash.tournament}`}
      </div>
    );
  }
  return (
    <div role="alert" className={`${ALERT} border-bad bg-bad-tint text-bad`}>
      <Icon name="exclamation-circle" />
      {flash.kind === 'throttled'
        ? throttledText(flash.minutes)
        : TEXT[flash.kind]}
    </div>
  );
}
