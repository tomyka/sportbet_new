import {
  at,
  makeGame,
  makeRound,
  roundNo,
  standingsDeadlineExamples,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { saveGames, saveRounds, loadSeason } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { loadTournamentCatalogue } from '../src/tournament/catalogue';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { TEAMS, TOURNAMENT } from './world';

const { db } = useTestDatabase();

/** The index-th game's teams: two of the world's four, a new pair each time. */
const pairOf = (index: number) => ({
  home: TEAMS[index % TEAMS.length]?.id ?? '11',
  away: TEAMS[(index + 1) % TEAMS.length]?.id ?? '12',
});

// ST-2 is held twice: Season.standingsDeadline in the domain, and its SQL
// rendering (standings-deadline-sql.ts) where the catalogue sums a
// tournament up without loading its season. Every domain example is saved
// and both are asked, as describeInvariantCheck does for a CHECK.
describe('the standings deadline in SQL agrees with Season.standingsDeadline (ST-2)', () => {
  it.each(standingsDeadlineExamples)(
    'standings deadline: $label',
    async ({ rounds, games, deadlineRound, deadline }) => {
      const tournament = {
        ...TOURNAMENT,
        standingsDeadlineRound:
          deadlineRound === null ? null : roundNo(deadlineRound),
      };
      await saveTournament(db, tournament);
      await saveTeams(db, tournament, TEAMS);
      await saveRounds(
        db,
        tournament,
        rounds.map((number) => ({
          id: 100 + number,
          name: `${String(number)} turas`,
          round: makeRound({ number }),
        })),
      );
      await saveGames(
        db,
        tournament,
        games.map((game, index) =>
          makeGame({
            id: index + 1,
            round: game.round,
            // A round holds each pairing once: each game its own pair.
            home: pairOf(index).home,
            away: pairOf(index).away,
            tipOff: game.tipOff,
          }),
        ),
      );
      const expected = deadline === null ? null : at(deadline);
      const season = await loadSeason(db, tournament);
      expect(season.standingsDeadline()).toBe(expected);
      const [listed] = await loadTournamentCatalogue(db);
      expect(listed?.window.standingsDeadline).toBe(expected);
    },
  );
});
