import { saveSurvivalPick, type Db } from '@sportbet/db';
import { at, player, roundNo, team } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { throttle } from '../sign-in/throttle';
import {
  formRefusalAnswer,
  pickRefusalAnswer,
  saveSurvivalPickFromForm,
} from './save-survival';

vi.mock('@sportbet/db', () => ({ saveSurvivalPick: vi.fn() }));
vi.mock('../sign-in/throttle', () => ({ throttle: vi.fn() }));

const refused = (message: string) => ({
  status: 422,
  body: { success: false, message },
});

describe("the form's refusals (updatePredictionSurvivalUser's match(true))", () => {
  it('no team, a team that is not an id, a round that is not one: one message each', () => {
    expect(formRefusalAnswer('no-team')).toEqual(
      refused('Nepasirinkta komanda.'),
    );
    expect(formRefusalAnswer('bad-team')).toEqual(
      refused('Ši komanda nepasiekiama.'),
    );
    expect(formRefusalAnswer('bad-round')).toEqual(
      refused('Turas pasikeitė - perkraukite puslapį.'),
    );
  });
});

describe("the pick's refusals (SurvivalPick::decide), sportbet's texts", () => {
  it.each([
    ['unknown-team', 'Ši komanda nepasiekiama.'],
    ['no-current-round', 'Šiuo metu nėra raundo, kuriam būtų galima rinktis.'],
    ['round-changed', 'Turas pasikeitė - perkraukite puslapį.'],
    ['round-has-no-survival', 'Šiame ture išlikimo žaidimo nėra.'],
    ['round-already-scored', 'Šis turas jau užskaitytas.'],
    ['team-not-playing', 'Ši komanda šiame ture nežaidžia.'],
    ['team-already-started', 'Šios komandos rungtynės jau prasidėjo.'],
    [
      'pick-locked',
      'Tavo pasirinktos komandos rungtynės jau prasidėjo - šio turo pasirinkimo keisti nebegalima.',
    ],
    [
      'team-used-in-run',
      'Šią komandą jau rinkaisi - kiekvieną komandą galima rinktis tik kartą, kol išnaudosi visas.',
    ],
  ] as const)('%s: "%s"', (refusal, text) => {
    expect(pickRefusalAnswer(refusal)).toEqual(refused(text));
  });
});

/**
 * No database at all: the throttle and the save are stubbed, so nothing
 * here may touch it, and any use throws (a stub returning nothing, typed
 * as the database).
 */
const untouchable = vi.fn<() => Db>()();

const now = at('2027-03-01T12:00:00Z');

describe('saveSurvivalPickFromForm', () => {
  it('a refused form answers before the throttle: it does not count', async () => {
    vi.mocked(throttle).mockClear();
    expect(
      await saveSurvivalPickFromForm(untouchable, {
        player: player('1'),
        fields: { team: '', round: '1' },
        now,
      }),
    ).toEqual(refused('Nepasirinkta komanda.'));
    expect(throttle).not.toHaveBeenCalled();
    expect(saveSurvivalPick).not.toHaveBeenCalled();
  });

  it('too many saves: 429, nothing saved', async () => {
    vi.mocked(throttle).mockResolvedValueOnce({ allowed: false, minutes: 1 });
    vi.mocked(saveSurvivalPick).mockClear();
    const answer = await saveSurvivalPickFromForm(untouchable, {
      player: player('1'),
      fields: { team: '9005', round: '1' },
      now,
    });
    expect(answer.status).toBe(429);
    expect(saveSurvivalPick).not.toHaveBeenCalled();
  });

  it('accepted: 200 {success: true}, judged under the ruled rules', async () => {
    vi.mocked(throttle).mockResolvedValueOnce({ allowed: true });
    vi.mocked(saveSurvivalPick).mockResolvedValueOnce({
      ok: true,
      value: { round: roundNo(1), team: team('9005') },
    });
    expect(
      await saveSurvivalPickFromForm(untouchable, {
        player: player('1'),
        fields: { team: '9005', round: '1' },
        now,
      }),
    ).toEqual({ status: 200, body: { success: true } });
    const [, save] = vi.mocked(saveSurvivalPick).mock.lastCall ?? [];
    expect(save?.rules.name).toBe('ruled');
    expect(save?.entry).toEqual({ team: '9005', shownRound: 1 });
  });

  it("a refusal: sportbet's text", async () => {
    vi.mocked(throttle).mockResolvedValueOnce({ allowed: true });
    vi.mocked(saveSurvivalPick).mockResolvedValueOnce({
      ok: false,
      refusal: 'team-used-in-run',
    });
    expect(
      await saveSurvivalPickFromForm(untouchable, {
        player: player('1'),
        fields: { team: '9005', round: '' },
        now,
      }),
    ).toEqual(
      refused(
        'Šią komandą jau rinkaisi - kiekvieną komandą galima rinktis tik kartą, kol išnaudosi visas.',
      ),
    );
  });

  it('a lock waited for past 5 s (55P03): 503 "Pasirinkimas neišsaugotas. Bandykite dar kartą."', async () => {
    vi.mocked(throttle).mockResolvedValueOnce({ allowed: true });
    vi.mocked(saveSurvivalPick).mockRejectedValueOnce(
      new Error('lock', { cause: { code: '55P03' } }),
    );
    expect(
      await saveSurvivalPickFromForm(untouchable, {
        player: player('1'),
        fields: { team: '9005', round: '1' },
        now,
      }),
    ).toEqual({
      status: 503,
      body: {
        success: false,
        message: 'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
      },
    });
  });
});
