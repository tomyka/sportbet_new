import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { team } from '../testing';
import {
  PLACEHOLDER_TEAMS_MAX,
  PLACEHOLDER_TEAMS_MIN,
  placeholderTeams,
  teamRenameEntry,
} from './team-admin';

const none = { existing: 0, finished: false } as const;

describe('placeholderTeams (TeamController::insertTeams, issue 281)', () => {
  it('placeholder teams: team1 to teamN', () => {
    expect(placeholderTeams('3', none)).toEqual({
      ok: true,
      value: ['team1', 'team2', 'team3'],
    });
  });

  it('placeholder teams: 2 to 64 are accepted', () => {
    expect([PLACEHOLDER_TEAMS_MIN, PLACEHOLDER_TEAMS_MAX]).toEqual([2, 64]);
    const smallest = placeholderTeams('2', none);
    expect(smallest.ok && smallest.value).toEqual(['team1', 'team2']);
    const largest = placeholderTeams('64', none);
    expect(largest.ok && largest.value).toHaveLength(64);
    expect(largest.ok && largest.value.at(-1)).toBe('team64');
  });

  it.each([
    ['', 'required'],
    ['ten', 'not-an-integer'],
    ['2.5', 'not-an-integer'],
    ['1', 'below-minimum'],
    ['0', 'below-minimum'],
    ['-4', 'below-minimum'],
    ['65', 'above-maximum'],
    ['1000000', 'above-maximum'],
  ] as const)('placeholder teams: the count %j is %s', (count, problem) => {
    expect(placeholderTeams(count, none)).toEqual(refuse(problem));
  });

  it('placeholder teams: a tournament that has teams is refused', () => {
    expect(placeholderTeams('20', { existing: 1, finished: false })).toEqual(
      refuse('teams-exist'),
    );
  });

  it('placeholder teams: a finished tournament is refused (R-110)', () => {
    expect(placeholderTeams('20', { existing: 0, finished: true })).toEqual(
      refuse('tournament-finished'),
    );
  });

  it('placeholder teams: the count is read before the tournament', () => {
    expect(placeholderTeams('x', { existing: 3, finished: true })).toEqual(
      refuse('not-an-integer'),
    );
  });
});

describe('teamRenameEntry (updateTeamDetails)', () => {
  it('team rename: an id and a name', () => {
    expect(teamRenameEntry({ teamID: '12', teamName: 'Zalgiris' })).toEqual({
      ok: true,
      value: { team: team('12'), name: 'Zalgiris' },
    });
  });

  it.each([
    ['', 'required'],
    ['x', 'not-an-id'],
    ['0', 'not-an-id'],
  ] as const)('team rename: the id %j is %s', (teamID, problem) => {
    expect(teamRenameEntry({ teamID, teamName: 'Zalgiris' })).toEqual({
      ok: false,
      errors: [{ field: 'teamID', problem }],
    });
  });

  it('team rename: a blank name is required', () => {
    expect(teamRenameEntry({ teamID: '12', teamName: '' })).toEqual({
      ok: false,
      errors: [{ field: 'teamName', problem: 'required' }],
    });
  });

  it('team rename: every failing field is listed, the id first', () => {
    expect(teamRenameEntry({ teamID: '', teamName: '' })).toEqual({
      ok: false,
      errors: [
        { field: 'teamID', problem: 'required' },
        { field: 'teamName', problem: 'required' },
      ],
    });
  });
});
