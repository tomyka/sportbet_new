import { describe, expect, it } from 'vitest';
import { FINISHED, RUNNING } from '../../components/admin/tournament-fixtures';
import { readTournamentForm } from './tournaments';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const POSTED = {
  name: ' Euroleague 2027/28 ',
  slug: 'euroleague-2027-28',
  status: 'upcoming',
  standings_deadline_round: '',
  start_date: '2027-10-01',
  end_date: '2028-05-30',
  description: '',
  is_public: '1',
};

describe('the tournament form (adminStore, adminUpdate)', () => {
  it("reads sportbet's fields, trimmed; an empty deadline round is the format's own, an absent switch is off", () => {
    expect(readTournamentForm(form(POSTED), null)).toEqual({
      ok: true,
      value: {
        name: 'Euroleague 2027/28',
        slug: 'euroleague-2027-28',
        standingsDeadlineRound: null,
        status: 'upcoming',
        startsOn: '2027-10-01',
        endsOn: '2028-05-30',
        description: null,
        isPublic: true,
        survival: false,
      },
    });
  });

  it("lists every refused field in the form's order", () => {
    expect(
      readTournamentForm(
        form({ ...POSTED, name: '', slug: 'Bad Slug', end_date: '2027-09-01' }),
        null,
      ),
    ).toEqual({
      ok: false,
      errors: [
        { field: 'name', problem: 'required' },
        { field: 'slug', problem: 'bad-slug' },
        { field: 'end_date', problem: 'before-start' },
      ],
    });
  });

  it('offers a stored finished only while it stays (R-55)', () => {
    const finished = { ...POSTED, status: 'finished' };
    expect(readTournamentForm(form(finished), FINISHED).ok).toBe(true);
    expect(
      readTournamentForm(form(finished), {
        ...RUNNING,
        profile: { ...RUNNING.profile, status: 'upcoming' },
      }),
    ).toEqual({
      ok: false,
      errors: [{ field: 'status', problem: 'unknown-status' }],
    });
    expect(readTournamentForm(form(finished), null)).toEqual({
      ok: false,
      errors: [{ field: 'status', problem: 'unknown-status' }],
    });
  });
});
