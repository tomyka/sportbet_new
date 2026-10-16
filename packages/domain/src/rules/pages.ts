// The pages slice 18 describes: /rules, /help and the one survival sentence
// they share with the survival page. Re-exported by the package's index.
export { helpPage, type HelpFacts, type HelpPage } from './help-page';
export {
  rulesPage,
  type BracketRow,
  type MarginExample,
  type OddsExample,
  type PlaceExample,
  type RulesFacts,
  type RulesPage,
  type SerijaExample,
} from './rules-page';
export { SURVIVAL_REPEAT_RULE } from '../survival/survival-rule-text';
