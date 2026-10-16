// The pages slice 18 describes: /rules and /help, and the facts of the
// tournament they describe. Re-exported by the package's index.
export { helpPage, type HelpPage } from './help-page';
export { rulesPage, type RulesPage } from './rules-page';
export {
  NO_TOURNAMENT_FACTS,
  tournamentFacts,
  tournamentFactsSchema,
  type TournamentFacts,
} from './tournament-facts';
