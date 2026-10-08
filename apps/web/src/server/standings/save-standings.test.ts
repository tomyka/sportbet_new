import { describe, expect, it } from 'vitest';
import { readStandingsAnswer } from '../../components/standings/standings-answer';
import {
  busyAnswer,
  refusedAnswer,
  throttledAnswer,
} from '../request/save-answers';
import {
  reorderValidationAnswer,
  rowRefusalAnswer,
  standingsValidationAnswer,
} from './save-standings';
import { STANDINGS_TEXTS } from './texts';

// The protocol's point: what the server answers is what the ladder reads.
describe('every answer the standings saves build, as the ladder reads it', () => {
  it("field errors: the first field's message", () => {
    const answer = standingsValidationAnswer([
      { field: 'place', problem: 'bad-place' },
      { field: 'playOffs', problem: 'bad-tick' },
    ]);
    expect(readStandingsAnswer(answer.status, answer.body)).toEqual({
      kind: 'refused',
      message: 'Vieta turi būti teigiamas skaičius.',
    });
  });

  it("a refused order: Laravel's 422 under order", () => {
    const answer = reorderValidationAnswer();
    expect(answer).toEqual({
      status: 422,
      body: {
        message: 'Eilė neteisinga.',
        errors: { order: ['Eilė neteisinga.'] },
      },
    });
    expect(readStandingsAnswer(answer.status, answer.body)).toEqual({
      kind: 'refused',
      message: 'Eilė neteisinga.',
    });
  });

  it('a refusal, too many saves and a lock waited too long: their own text', () => {
    for (const answer of [
      refusedAnswer(STANDINGS_TEXTS.mismatch),
      throttledAnswer(1),
      busyAnswer(),
    ]) {
      expect(readStandingsAnswer(answer.status, answer.body)).toEqual({
        kind: 'refused',
        message: answer.body.message,
      });
    }
  });

  it('saved: 200 {success: true}', () => {
    expect(readStandingsAnswer(200, { success: true })).toEqual({
      kind: 'saved',
    });
  });
});

describe("rowRefusalAnswer (predictStandingsRow's refusals, as sportbet answers them)", () => {
  const field = (name: string, message: string) => ({
    status: 422,
    body: { message, errors: { [name]: [message] } },
  });

  it('a place outside the table: a 422 on groupPosition', () => {
    expect(rowRefusalAnswer('place-out-of-table')).toEqual(
      field('groupPosition', 'Tokios vietos lentelėje nėra.'),
    );
  });

  it('a conflict or the chain (R-78): one message under teamID', () => {
    expect(rowRefusalAnswer('place-taken')).toEqual(
      field('teamID', 'Ši vieta jau užimta kitos komandos.'),
    );
    expect(rowRefusalAnswer('play-offs-full')).toEqual(
      field('teamID', '1/4 etape jau pažymėta 8 komandų.'),
    );
    expect(rowRefusalAnswer('final-four-full')).toEqual(
      field('teamID', '1/2 etape jau pažymėta 4 komandų.'),
    );
    expect(rowRefusalAnswer('final-place-taken')).toEqual(
      field('teamID', 'Ši finalo vieta jau užimta kitos komandos.'),
    );
    expect(rowRefusalAnswer('final-four-without-play-offs')).toEqual(
      field(
        'teamID',
        'Komanda, pažymėta 1/2 etape, turi būti pažymėta ir 1/4 etape.',
      ),
    );
    expect(rowRefusalAnswer('final-place-without-final-four')).toEqual(
      field(
        'teamID',
        'Finalo vietą galima nurodyti tik komandai, pažymėtai 1/2 etape.',
      ),
    );
  });

  it('not yours and closed: {success: false, message}', () => {
    expect(rowRefusalAnswer('not-yours')).toEqual({
      status: 422,
      body: { success: false, message: 'Šios prognozės išsaugoti negalima.' },
    });
    expect(rowRefusalAnswer('closed')).toEqual({
      status: 422,
      body: { success: false, message: 'Prognozių laikas baigėsi.' },
    });
  });

  it('each reads back as its own message', () => {
    const answer = rowRefusalAnswer('final-four-without-play-offs');
    expect(readStandingsAnswer(answer.status, answer.body)).toEqual({
      kind: 'refused',
      message: STANDINGS_TEXTS.finalFourWithoutPlayOffs,
    });
  });
});

describe("standingsValidationAnswer (Laravel's 422 for UpdatePredictionStandingRequest)", () => {
  it("each field under sportbet's name; the message the first, then Laravel's count", () => {
    expect(
      standingsValidationAnswer([
        { field: 'place', problem: 'bad-place' },
        { field: 'finalPlace', problem: 'bad-final-place' },
      ]),
    ).toEqual({
      status: 422,
      body: {
        message: 'Vieta turi būti teigiamas skaičius. (and 1 more error)',
        errors: {
          groupPosition: ['Vieta turi būti teigiamas skaičius.'],
          final: ['Finalo vieta turi būti 1 arba 2.'],
        },
      },
    });
  });

  it('every field and problem has its own text', () => {
    expect(
      standingsValidationAnswer([
        { field: 'team', problem: 'not-an-id' },
        { field: 'playOffs', problem: 'bad-tick' },
        { field: 'finalFour', problem: 'bad-tick' },
      ]).body,
    ).toEqual({
      message: 'Šios prognozės išsaugoti negalima. (and 2 more errors)',
      errors: {
        teamID: ['Šios prognozės išsaugoti negalima.'],
        quarterfinal: ['Žymė turi būti 0 arba 1.'],
        semifinal: ['Žymė turi būti 0 arba 1.'],
      },
    });
  });
});
