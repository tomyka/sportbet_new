import type { JSX } from 'react';
import type { Flash } from '../../../server/flash';
import type { Imported, ImportProblem } from '../../../server/import/problem';
import { Alert } from '../../hub/alert';

type FeedProblem = Extract<
  ImportProblem,
  {
    readonly kind:
      | 'bad-season'
      | 'unreachable'
      | 'http-error'
      | 'not-json'
      | 'no-games'
      | 'malformed';
  }
>;

const FEED_KINDS: readonly string[] = [
  'bad-season',
  'unreachable',
  'http-error',
  'not-json',
  'no-games',
  'malformed',
];

const isFeedProblem = (problem: ImportProblem): problem is FeedProblem =>
  FEED_KINDS.includes(problem.kind);

/** A season code that is none, and what the feed answered (sportbet's exceptions, lang/lt.json). */
function feedText(problem: FeedProblem): string {
  switch (problem.kind) {
    case 'bad-season':
      return 'Netinkamas sezono kodas.';
    case 'unreachable':
      return 'Nepavyko pasiekti Euroleague serverio. Bandykite dar kartą po kelių minučių.';
    case 'http-error':
      return `Euroleague serveris grąžino klaidą (${String(problem.status)}). Patikrinkite sezono kodą ${problem.season}.`;
    case 'not-json':
      return 'Euroleague atsakymo nepavyko perskaityti.';
    case 'no-games':
      return 'Euroleague atsakyme nėra rungtynių. Patikrinkite sezono kodą.';
    case 'malformed':
      return `Euroleague atsakymas netinkamas: rungtynėse nr. ${String(problem.number)} trūksta lauko ${problem.field}.`;
  }
}

/** What the plan and the apply refuse (R-93, R-94, R-110, and sportbet's importer). */
function planText(problem: Exclude<ImportProblem, FeedProblem>): string {
  switch (problem.kind) {
    case 'tournament-finished':
      return 'Turnyras baigtas - keisti negalima.';
    case 'duplicate-team-names':
      return `Turnyre yra dvi vienodai vadinamos komandos: ${problem.team}. Pervadinkite vieną iš jų ir bandykite dar kartą.`;
    case 'unmatched-teams':
      return `Šios komandos yra tvarkaraštyje, bet ne turnyre: ${problem.teams.join(', ')}. Pervadinkite jas turnyre taip pat, kaip vadinasi tvarkaraštyje, ir bandykite dar kartą. Niekas nebuvo importuota.`;
    case 'round-not-regular':
      return `Turas ${String(problem.round)} jau yra ir nėra reguliariojo sezono.`;
    case 'duplicate-fixture':
      return `Euroleague atsakyme rungtynės kartojasi: ${String(problem.round)} turas, ${problem.home} - ${problem.away}.`;
    case 'plan-changed':
      return 'Tvarkaraštis arba turnyras pasikeitė po peržiūros - peržiūrėkite dar kartą.';
    case 'no-tournament':
      return 'Turnyro nebėra.';
  }
}

/**
 * Why the import did nothing, in sportbet's words where it had them (the
 * exceptions its feed and importer threw, lang/lt.json); the rest are this
 * slice's, for the owner to reword (R-93, R-94, R-110).
 */
export function importProblemText(problem: ImportProblem): string {
  return isFeedProblem(problem) ? feedText(problem) : planText(problem);
}

/** sportbet's "Importuota: ..." flash, without its crest count; R-96's crestless teams follow when there are any. */
export function importedText(result: Imported): string {
  const counts = `Importuota: ${String(result.teams)} komandų, ${String(result.rounds)} turų, ${String(result.games)} naujų rungtynių, ${String(result.moved)} perkeltų, ${String(result.skipped)} neperkeltų. Spėjimų eilutės sukurtos ${String(result.players)} žaidėjams.`;
  return result.withoutCrest.length === 0
    ? counts
    : `${counts} Komandos be logotipo: ${result.withoutCrest.join(', ')}.`;
}

/** The import screen's one-time message: sportbet's `alert-success` for a result, `alert-danger` for a refusal. */
export function ImportAlert({
  flash,
}: {
  flash: Extract<Flash, { kind: 'imported' | 'import-refused' }>;
}): JSX.Element {
  return flash.kind === 'imported' ? (
    <Alert tone="ok" icon="check-circle-fill">
      {importedText(flash.result)}
    </Alert>
  ) : (
    <Alert tone="bad" icon="exclamation-circle">
      {importProblemText(flash.problem)}
    </Alert>
  );
}
