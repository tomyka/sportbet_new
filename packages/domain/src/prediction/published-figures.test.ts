import { describe, expect, it } from 'vitest';
import { publishedMatchFigures } from './published-figures';

describe('publishedMatchFigures', () => {
  const figures = publishedMatchFigures();

  it('the margin examples, as ScoringRules scores them (R-42, MS-6), in hundredths', () => {
    expect(
      figures.marginExamples.every(
        ({ actual }) => actual.home === 88 && actual.away === 79,
      ),
    ).toBe(true);
    expect(
      figures.marginExamples.map(
        ({
          predicted,
          miss,
          pointsHundredths,
          bonusHundredths,
          exactScore,
        }) => ({
          call: `${String(predicted.home)}:${String(predicted.away)}`,
          miss,
          pointsHundredths,
          bonusHundredths,
          exactScore,
        }),
      ),
    ).toEqual([
      {
        call: '88:79',
        miss: 0,
        pointsHundredths: 5_000,
        bonusHundredths: 5_000,
        exactScore: true,
      },
      {
        call: '92:83',
        miss: 0,
        pointsHundredths: 5_000,
        bonusHundredths: 2_000,
        exactScore: false,
      },
      {
        call: '85:80',
        miss: 4,
        pointsHundredths: 4_600,
        bonusHundredths: 0,
        exactScore: false,
      },
      {
        call: '79:88',
        miss: 18,
        pointsHundredths: 3_200,
        bonusHundredths: 0,
        exactScore: false,
      },
      {
        call: '60:115',
        miss: 64,
        pointsHundredths: -1_400,
        bonusHundredths: 0,
        exactScore: false,
      },
    ]);
  });

  // The oracle: CrowdOdds::stored(CrowdOdds::of(30, n)) and
  // PointsFormat::winnerPoints of sportbet at 1618164, evaluated with PHP.
  it('the odds examples are sportbet: shares 93, 50, 33, 10, 3; odds 0.10, 1.00, 1.59, 3.32, 4.91; winner points 55, 100, 129.5, 216, 295.5', () => {
    expect(
      figures.oddsExamples.map(
        ({ chose, total, share, oddsHundredths, winnerPointsHundredths }) => [
          chose,
          total,
          share,
          oddsHundredths,
          winnerPointsHundredths,
        ],
      ),
    ).toEqual([
      [28, 30, 93, 10, 5_500],
      [15, 30, 50, 100, 10_000],
      [10, 30, 33, 159, 12_950],
      [3, 30, 10, 332, 21_600],
      [1, 30, 3, 491, 29_550],
    ]);
  });
});
