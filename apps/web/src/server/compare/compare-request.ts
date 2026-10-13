import {
  idFromText,
  playerId,
  type CompareRefusal,
  type Comparison,
  type IdTextRefusal,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { PLAYER_HOME } from '../../components/shell/shell-paths';

/**
 * The player a compare URL names: its userID read as every id typed into a
 * URL is (idFromText: digits, no leading 0, within Postgres' integer).
 */
export function otherPlayerOf(
  userID: string,
): Result<PlayerId, IdTextRefusal | 'empty'> {
  const typed = idFromText(userID);
  return typed.ok ? playerId(String(typed.value)) : typed;
}

/**
 * The comparison, or the way sportbet's CompareController leaves: oneself
 * goes to the game page, and a player outside the tournament's listed
 * players is a 404.
 */
export function comparisonOrLeave(
  result: Result<Comparison, CompareRefusal>,
): Comparison {
  if (result.ok) return result.value;
  if (result.refusal === 'self') redirect(PLAYER_HOME);
  notFound();
}
