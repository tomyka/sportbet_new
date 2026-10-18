import { expect, test, type Page } from '@playwright/test';
import { savininkasContext } from './support/savininkas';

// The points chart's line colours in a real browser. Tailwind drops a theme
// variable no utility uses, and the chart reads --color-series-N only by name
// (chart-svg.tsx), so the shipped stylesheet once held series 1 and 2 only and
// most lines were drawn with no colour (jsdom tests never compile the CSS).
// At phone, desktop and wide widths and at a device scale factor of 0.5
// (zoomed out), 1 and 2: every line the chart draws has a real, distinct
// stroke, and all ten series tokens resolve in the page's stylesheet, which
// holds for any number of players.

const SIZES = [
  { width: 1280, height: 800, scale: 1, ip: '192.0.2.141' },
  { width: 2400, height: 1200, scale: 0.5, ip: '192.0.2.142' },
  { width: 390, height: 844, scale: 2, ip: '192.0.2.143' },
  { width: 1280, height: 800, scale: 0.5, ip: '192.0.2.144' },
  { width: 390, height: 844, scale: 1, ip: '192.0.2.145' },
  { width: 2400, height: 1200, scale: 2, ip: '192.0.2.146' },
] as const;

const SERIES = Array.from({ length: 10 }, (_, index) => index + 1);

const REAL_COLOUR = /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/;

/** What the browser computes for a path stroked with each series token, drawn into the page. */
async function seriesStrokes(page: Page): Promise<string[]> {
  return page.evaluate((series) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    const strokes = series.map((n) => {
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      path.setAttribute('stroke', `var(--color-series-${String(n)})`);
      svg.append(path);
      return getComputedStyle(path).stroke;
    });
    svg.remove();
    return strokes;
  }, SERIES);
}

for (const size of SIZES) {
  test(`every chart line has its own real colour at ${String(size.width)}x${String(size.height)}, scale ${String(size.scale)}`, async ({
    browser,
  }) => {
    const context = await savininkasContext(
      browser,
      { width: size.width, height: size.height },
      size.ip,
      size.scale,
    );
    const page = await context.newPage();
    await page.goto('/summary/chart');
    await expect(
      page.getByText('Taškų dinamika', { exact: true }),
    ).toBeVisible();

    // The legend's dot of every player, and a line for every scored game's
    // worth of points (the stack's tournament may have none yet).
    const dots = page.getByTestId('chart-dot');
    expect(await dots.count()).toBeGreaterThan(0);
    const dotColours = await dots.evaluateAll((spans) =>
      spans.map((span) => getComputedStyle(span).backgroundColor),
    );
    for (const colour of dotColours) expect(colour).toMatch(REAL_COLOUR);
    const firstDots = dotColours.slice(0, SERIES.length);
    expect(new Set(firstDots).size).toBe(firstDots.length);

    const drawn = await page
      .getByTestId('chart-line')
      .evaluateAll((paths) =>
        paths.map((path) => getComputedStyle(path).stroke),
      );
    for (const stroke of drawn) expect(stroke).toMatch(REAL_COLOUR);
    const first = drawn.slice(0, SERIES.length);
    expect(new Set(first).size).toBe(first.length);

    const strokes = await seriesStrokes(page);
    for (const stroke of strokes) expect(stroke).toMatch(REAL_COLOUR);
    expect(new Set(strokes).size).toBe(SERIES.length);

    await context.close();
  });
}
