import { expect, test } from '@playwright/test';
import { savininkasContext } from './support/savininkas';

// (Runs after predictions.spec.ts, which saves the session it reuses.)
// The points chart fills the page in a real browser, as sportbet's did
// (Chart.js in a `.ch-wrap` of 100vh - 190px, in a fluid container): the SVG
// takes the content width and a viewport-based height, with a floor on a
// phone, and the page never scrolls sideways. jsdom has no layout, so only a
// browser can say.

const SIZES = [
  { width: 1280, height: 800, ip: '192.0.2.147' },
  { width: 2400, height: 1200, ip: '192.0.2.148' },
  { width: 390, height: 844, ip: '192.0.2.149' },
] as const;

/** The plot's height: the viewport less 17rem, never under 22rem (chart-interaction.tsx). */
const plotHeight = (viewport: number): number =>
  Math.max(22 * 16, viewport - 17 * 16);

for (const size of SIZES) {
  test(`the chart fills the page at ${String(size.width)}x${String(size.height)}`, async ({
    browser,
  }) => {
    const context = await savininkasContext(browser, size, size.ip);
    const page = await context.newPage();
    await page.goto('/summary/chart');
    await expect(page.getByTestId('chart-plot')).toBeVisible();

    const box = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="chart-plot"] svg');
      const container = document.querySelector('main > div');
      if (svg === null || container === null) throw new Error('no chart');
      const style = getComputedStyle(container);
      const rect = svg.getBoundingClientRect();
      return {
        svgWidth: rect.width,
        svgHeight: rect.height,
        viewBox: svg.getAttribute('viewBox'),
        contentWidth:
          container.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });

    expect(box.svgWidth).toBeGreaterThanOrEqual(box.contentWidth * 0.9);
    expect(box.svgWidth).toBeLessThanOrEqual(box.contentWidth);
    expect(
      Math.abs(box.svgHeight - plotHeight(size.height)),
    ).toBeLessThanOrEqual(1);
    // One unit is one pixel, so the text keeps its size at any width.
    expect(box.viewBox).toBe(
      `0 0 ${String(Math.round(box.svgWidth))} ${String(Math.round(box.svgHeight))}`,
    );
    expect(box.pageWidth).toBeLessThanOrEqual(box.viewportWidth);

    // Pointing near the plot's right edge opens the last game's tooltip, at
    // any size (the stack's tournament may have no scored game yet).
    const games = await page.getByTestId('chart-hit').count();
    await page.getByTestId('chart-plot').hover({
      position: { x: box.svgWidth - 40, y: 100 },
    });
    await expect(page.getByRole('tooltip')).toHaveCount(Math.min(1, games));

    await context.close();
  });
}
