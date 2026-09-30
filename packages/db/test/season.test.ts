import { sportbetRules, TeamOutcomes } from '@sportbet/domain';
import {
  at,
  roundNo,
  score,
  teamOutcome,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listTeams,
  loadSeason,
  loadTeamOutcomes,
  saveGames,
  saveTeamOutcomes,
  saveTournament,
} from '../src';
import { useTestDatabase } from '../src/testing';
import {
  G10,
  G7,
  G8,
  G9,
  GAMES,
  OTHER,
  ROUNDS,
  saveWorld,
  TEAMS,
  TOURNAMENT,
} from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('season repository', () => {
  it('reads back the rounds and games it saved, through Round.stored and Game.stored', async () => {
    await saveGames(db, TOURNAMENT, GAMES);
    const season = await loadSeason(db, TOURNAMENT);
    expect(season.rounds).toEqual(ROUNDS.map(({ round }) => round));
    expect(season.games).toEqual(GAMES);
    // R-21: on for the whole of its end date, UTC.
    expect(season.endsAt).toBe(at('2027-05-24T00:00:00Z'));
    expect(season.standingsDeadlineRound).toBe(5);
  });

  it('reads a season with no end date from a tournament with none (R-21)', async () => {
    const withoutEndDate = { ...TOURNAMENT, endsOn: null };
    await saveTournament(db, withoutEndDate);
    await saveGames(db, withoutEndDate, GAMES);
    const season = await loadSeason(db, withoutEndDate);
    expect(season.endsAt).toBeNull();
    expect(season.games).toEqual(GAMES);
  });

  it("reads an admin's standings deadline round from the tournament", async () => {
    const withDeadline = { ...TOURNAMENT, standingsDeadlineRound: roundNo(6) };
    await saveTournament(db, withDeadline);
    expect((await loadSeason(db, withDeadline)).standingsDeadlineRound).toBe(6);
  });

  it('updates a game saved again, by id', async () => {
    await saveGames(db, TOURNAMENT, GAMES);
    const scored = unwrap(G9.withResult(score(81, 77), sportbetRules));
    await saveGames(db, TOURNAMENT, [scored]);
    expect((await loadSeason(db, TOURNAMENT)).games).toEqual([
      G7,
      G8,
      scored,
      G10,
    ]);
  });

  it("reads another tournament's rounds and games as its own only", async () => {
    await saveTournament(db, OTHER);
    await saveGames(db, TOURNAMENT, GAMES);
    const other = await loadSeason(db, OTHER);
    expect([other.rounds, other.games]).toEqual([[], []]);
  });
});

describe('team repository', () => {
  it('lists the teams it saved, by id', async () => {
    expect(await listTeams(db, TOURNAMENT)).toEqual(TEAMS);
  });

  it("reads back stored outcomes - a shared place, football's final place 3 - with the tournament's final-table flag", async () => {
    const outcomes = unwrap(
      TeamOutcomes.stored(
        [
          teamOutcome('11', {
            place: 1,
            playOffs: true,
            finalFour: true,
            finalPlace: 1,
          }),
          teamOutcome('12', { place: 1, playOffs: true, finalPlace: 3 }),
          teamOutcome('13'),
          teamOutcome('14', { place: 4 }),
        ],
        true,
      ),
    );
    await saveTournament(db, { ...TOURNAMENT, standingsTableFinal: true });
    await saveTeamOutcomes(db, TOURNAMENT, outcomes);
    expect(
      await loadTeamOutcomes(db, { ...TOURNAMENT, standingsTableFinal: true }),
    ).toEqual(outcomes);
  });

  it('refuses an outcome for a team of another tournament, saving none', async () => {
    await saveTournament(db, OTHER);
    const outcomes = unwrap(
      TeamOutcomes.stored([teamOutcome('11', { place: 1 })], false),
    );
    await expect(saveTeamOutcomes(db, OTHER, outcomes)).rejects.toThrow(
      /team 11 is not a team of tournament 4/,
    );
    expect((await loadTeamOutcomes(db, TOURNAMENT)).teams).toEqual([]);
  });
});
