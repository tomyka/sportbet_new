import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

// Tailwind 4 drops a theme variable no utility class uses, and the chart
// reads --color-series-3 to 10 only by name in a string (chart-svg.tsx), so
// the built stylesheet once held series 1 and 2 only and most lines had no
// colour. tokens.css declares its block `@theme static`, which keeps every
// variable; this compiles the file as the build does and holds it to that.

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

const declared = [
  ...css
    .slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme')))
    .matchAll(/--color-([a-z0-9-]+):/g),
].flatMap(([, name]) => (name === undefined ? [] : [name]));

/** The custom properties the built stylesheet declares, when only `bg-rail` is used. */
async function built(source: string): Promise<Set<string>> {
  const compiled = await compile(`@tailwind utilities;\n${source}`);
  const out = compiled.build(['bg-rail']);
  return new Set(
    [...out.matchAll(/(--color-[a-z0-9-]+):/g)].flatMap(([, name]) =>
      name === undefined ? [] : [name],
    ),
  );
}

describe('the built stylesheet', () => {
  it('declares every colour token of tokens.css, used by a utility or not', async () => {
    const present = await built(css);
    const missing = declared.filter((name) => !present.has(`--color-${name}`));
    expect(declared).toContain('series-10');
    expect(missing).toEqual([]);
  });

  it('would lose the series tokens if the theme block were not static', async () => {
    const present = await built(css.replace('@theme static {', '@theme {'));
    expect(present.has('--color-series-3')).toBe(false);
    expect(present.has('--color-rail')).toBe(true);
  });
});
