import type { JSX } from 'react';
import {
  ADMIN_MESSAGES,
  type AdminMessage,
  type FormProblem,
} from '../../server/admin/admin-messages';
import type { Flash } from '../../server/flash';
import { Alert } from '../hub/alert';

/** What a message names besides itself. */
interface Names {
  readonly number?: number | undefined;
  readonly name?: string | undefined;
}

const numberOf = ({ number }: Names): string => String(number ?? '');

/**
 * The admin structure pages' messages (decision 13: written here, never
 * carried in the cookie). sportbet's own, in Lithuanian where it wrote
 * Lithuanian (lang/lt.json); its English flashes ("Game N has been
 * inserted") are the owner's (2026-10-13); a refusal with no text of
 * sportbet's is a text of this slice's, for the owner to reword.
 */
const MESSAGE_TEXT: Readonly<Record<AdminMessage, (names: Names) => string>> = {
  'game-added': (names) => `Žaidimas #${numberOf(names)} pridėtas.`,
  'game-updated': (names) => `Žaidimas #${numberOf(names)} atnaujintas.`,
  'game-deleted': (names) => `Žaidimas #${numberOf(names)} ištrintas.`,
  'round-added': () => 'Turas pridėtas.',
  'round-updated': () => 'Turas atnaujintas.',
  'round-deleted': () => 'Turas ištrintas.',
  'teams-updated': () => 'Komandos atnaujintos.',
  'teams-added': (names) => `Pridėta komandų: ${numberOf(names)}.`,
  'team-renamed': () => 'Komanda atnaujinta',
  'tournament-created': () => 'Turnyras sukurtas.',
  'tournament-updated': () => 'Turnyras atnaujintas.',
  'context-chosen': ({ name }) => `Turnyro kontekstas: ${name ?? ''}`,
  'no-tournament': () =>
    'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
  'tournament-finished': () => 'Turnyras baigtas - keisti negalima.',
  'duplicate-number': () => 'Turas su tokia diena šiame turnyre jau yra.',
  'unknown-round': () => 'Tokio turo šiame turnyre nėra.',
  'has-games': () => 'Turo, kuriame yra rungtynių, ištrinti negalima.',
  'has-picks': () =>
    'Turo, kurį jau pasirinko išlikimo žaidėjai, ištrinti negalima.',
  'mixed-tournament': () =>
    'Komanda ir turas priklauso skirtingiems turnyrams.',
  'same-team-twice': () =>
    'Šeimininkai ir svečiai turi būti skirtingos komandos.',
  'duplicate-pair': () => 'Šiame ture šios komandos jau žaidžia viena su kita.',
  'teams-fixed': () =>
    'Pradėtų rungtynių, kurias jau spėjo žaidėjai, komandų keisti negalima.',
  'has-real-predictions': () =>
    'Šių rungtynių ištrinti negalima: jos jau turi spėjimų.',
  'has-result': () =>
    'Šių rungtynių ištrinti negalima: jos jau turi rezultatą.',
  'has-survival-picks': () =>
    'Rungtynių, kurių komandas jau pasirinko išlikimo žaidėjai, ištrinti negalima.',
  'no-game': () => 'Tokių rungtynių nėra.',
  'teams-exist': () => 'Šiame turnyre komandos jau yra.',
  'places-incomplete': (names) =>
    `Galutinė lentelė galima tik užpildžius visas vietas 1..${numberOf(names)} be pasikartojimų.`,
  'unmark-not-allowed': () =>
    'Galutinės lentelės žymą gali nuimti tik superadministratorius.',
  'unknown-team': () => 'Tokios komandos šiame turnyre nėra.',
  'duplicate-team': () => 'Ta pati komanda pateikta kelis kartus.',
  'place-not-positive': () => 'Vieta turi būti ne mažesnė už 1.',
  'duplicate-place': () => 'Dvi komandos negali turėti tos pačios vietos.',
  'final-place-out-of-range': () => 'Finalo vieta gali būti tik 1 arba 2.',
  'duplicate-final-place': () =>
    'Dvi komandos negali turėti tos pačios finalo vietos.',
  'slug-taken': () => 'Toks slug jau užimtas.',
  'wrong-code': () => 'Neteisingas arba pasibaigęs kodas.',
  'nothing-to-confirm': () =>
    'Nėra veiksmo, kurį reikėtų patvirtinti. Pradėkite iš naujo.',
};

/** One message's words. */
export const adminMessageText = (
  message: AdminMessage,
  names: Names = {},
): string => MESSAGE_TEXT[message](names);

/** The labels sportbet's forms give each posted field, in the posted names. */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  event: 'Turo pavadinimas',
  eventDay: 'Turo diena',
  stage: 'Turo etapas',
  rate: 'Koeficientas',
  gameDateTime: 'Data ir laikas',
  homeTeamID: 'Šeimininkai',
  awayTeamID: 'Svečiai',
  eventID: 'Etapas',
  name: 'Pavadinimas',
  slug: 'Slug (URL)',
  standings_deadline_round: 'Eigos prognozės užsidaro nuo turo',
  status: 'Statusas',
  start_date: 'Pradžia',
  end_date: 'Pabaiga',
  description: 'Aprašymas',
  is_public: 'Viešas',
  survival_game: 'Išlikimas',
  teamID: 'Komanda',
  team: 'Komanda',
  teamName: 'Pavadinimas',
  teamCount: 'Komandų kiekis',
  place: 'Vieta',
  finalPlace: 'Finalo vieta',
};

/**
 * What each problem the domain's form checks name comes to. A `whole`
 * one is a sentence of its own (sportbet's, or the owner's R-91's); the
 * others follow their field's label.
 */
const PROBLEM_TEXT: Readonly<
  Record<string, { readonly text: string; readonly whole?: true }>
> = {
  required: { text: 'privalomas laukas' },
  'not-an-integer': { text: 'turi būti sveikasis skaičius' },
  'below-minimum': { text: 'per maža reikšmė' },
  'above-maximum': { text: 'per didelė reikšmė' },
  'unknown-stage': { text: 'nežinomas etapas' },
  'not-an-id': { text: 'neteisingas pasirinkimas' },
  'bad-time': { text: 'neteisingas laikas' },
  'nonexistent-time': {
    text: 'Šis laikas Vilniuje neegzistuoja (laikrodžio persukimas).',
    whole: true,
  },
  'ambiguous-time': {
    text: 'Šis laikas Vilniuje dviprasmiškas (laikrodžio persukimas).',
    whole: true,
  },
  'too-long': { text: 'per ilgas tekstas' },
  'bad-slug': {
    text: 'leidžiamos tik mažosios raidės a-z, skaitmenys ir brūkšnelis',
  },
  'unknown-status': { text: 'neteisinga reikšmė' },
  'not-a-date': { text: 'neteisinga data' },
  'before-start': { text: 'pabaigos data negali būti ankstesnė už pradžios' },
  'not-a-boolean': { text: 'neteisinga reikšmė' },
  'survival-with-draws': {
    text: 'Išlikimo žaidimas galimas tik turnyrams be lygiųjų.',
    whole: true,
  },
  'bad-place': { text: 'turi būti sveikasis skaičius nuo 1' },
  'bad-final-place': { text: 'turi būti tuščia, 1 arba 2' },
};

/** One refused field as a line: "Turo diena: privalomas laukas", with its row ("Eilutė 3: ...") for the facts form. */
export function problemLine({ field, problem, row }: FormProblem): string {
  const known = PROBLEM_TEXT[problem];
  const text = known?.text ?? problem;
  const body =
    known?.whole === true ? text : `${FIELD_LABEL[field] ?? field}: ${text}`;
  return row === undefined ? body : `Eilutė ${String(row + 1)}: ${body}`;
}

/**
 * sportbet's `alert alert-success` (`Session::get('info')`) or `alert
 * alert-danger` (`Session::get('error')`) on the admin pages, and its
 * `$errors->all()` list for a form Laravel refused field by field.
 */
export function AdminAlert({
  flash,
}: {
  flash: Extract<Flash, { kind: 'admin' | 'admin-invalid' }>;
}): JSX.Element {
  if (flash.kind === 'admin-invalid') {
    return (
      <Alert tone="bad" icon="exclamation-circle">
        <ul className="m-0 list-none p-0 text-[0.83rem]">
          {flash.problems.map((problem) => (
            <li
              key={`${problem.field}-${String(problem.row)}-${problem.problem}`}
            >
              {problemLine(problem)}
            </li>
          ))}
        </ul>
      </Alert>
    );
  }
  const tone = ADMIN_MESSAGES[flash.message] === 'info' ? 'ok' : 'bad';
  return (
    <Alert
      tone={tone}
      icon={tone === 'ok' ? 'check-circle-fill' : 'exclamation-circle'}
    >
      {adminMessageText(flash.message, flash)}
    </Alert>
  );
}
