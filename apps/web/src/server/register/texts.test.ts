import { describe, expect, it } from 'vitest';
import { problemTexts } from './texts';

// The owner's six texts for what sportbet answers in Laravel's English
// (spec, "Owner answers"), and 4b's for the address.
describe('the registration form refusals', () => {
  it('names each refused field in Lithuanian', () => {
    expect(
      problemTexts({
        username: 'required',
        name: 'required',
        email: 'required',
      }),
    ).toEqual({
      username: 'Įveskite vartotojo vardą.',
      name: 'Įveskite vardą.',
      email: 'Įveskite el. pašto adresą.',
    });
    expect(problemTexts({ email: 'not-an-email' })).toEqual({
      email: 'Įveskite teisingą el. pašto adresą.',
    });
  });

  it('a username of only characters Laravel does not trim is missing: the same text (plan decision 14)', () => {
    expect(problemTexts({ username: 'blank' })).toEqual({
      username: 'Įveskite vartotojo vardą.',
    });
  });

  it('says the same for every answer over 255 characters', () => {
    expect(
      problemTexts({
        username: 'too-long',
        name: 'too-long',
        surname: 'too-long',
        email: 'too-long',
      }),
    ).toEqual({
      username: 'Per ilgas: daugiausia 255 simboliai.',
      name: 'Per ilgas: daugiausia 255 simboliai.',
      surname: 'Per ilgas: daugiausia 255 simboliai.',
      email: 'Per ilgas: daugiausia 255 simboliai.',
    });
  });

  it('says nothing when nothing is refused', () => {
    expect(problemTexts({})).toEqual({});
  });
});
