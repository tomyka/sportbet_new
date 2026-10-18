import { describe, expect, it } from 'vitest';
import {
  chartColour,
  chartColourInvariant,
  normalizeChartColour,
} from './chart-colour';

describe('chartColourInvariant', () => {
  it.each(chartColourInvariant.accepts)('accepts $label', ({ value }) => {
    expect(chartColourInvariant.schema.safeParse(value).success).toBe(true);
  });

  it.each(chartColourInvariant.refuses)('refuses $label', ({ value }) => {
    expect(chartColourInvariant.schema.safeParse(value).success).toBe(false);
  });

  it('refuses what could break out of an attribute or a style, and what CSS reads another way', () => {
    const refused = chartColourInvariant.refuses.map(({ value }) => value);
    expect(refused).toEqual(
      expect.arrayContaining([
        '',
        'd96c6c',
        '#D96C6C',
        '#fff',
        '#d96c6c26',
        'red',
        '#d96c6c"',
        '#d96c6c;x',
        '#d96c6g',
        '#d96c6c\n',
      ]),
    );
  });
});

describe('chartColour', () => {
  it('makes a colour of exactly the stored form', () => {
    expect(chartColour('#d96c6c')).toEqual({ ok: true, value: '#d96c6c' });
  });

  it('refuses anything else, and anything that is no text', () => {
    expect(chartColour('#D96C6C')).toEqual({ ok: false, refusal: 'invalid' });
    expect(chartColour(' #d96c6c')).toEqual({ ok: false, refusal: 'invalid' });
    expect(chartColour(null)).toEqual({ ok: false, refusal: 'invalid' });
    expect(chartColour(0xd96c6c)).toEqual({ ok: false, refusal: 'invalid' });
  });
});

describe('normalizeChartColour', () => {
  it('trims and lower-cases, as a colour code a person typed would be read', () => {
    expect(normalizeChartColour('  #D96C6C\t')).toEqual({
      ok: true,
      value: '#d96c6c',
    });
  });

  it('keeps an already normal colour as it is', () => {
    expect(normalizeChartColour('#735656')).toEqual({
      ok: true,
      value: '#735656',
    });
  });

  it('refuses an empty code, a name, a short or an alpha form, never repairing it', () => {
    for (const code of ['', '   ', 'red', '#fff', '#d96c6c26', 'd96c6c']) {
      expect(normalizeChartColour(code)).toEqual({
        ok: false,
        refusal: 'invalid',
      });
    }
  });
});
