import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// sportbet's CssTokenGuardTest, for the rebuilt look (spec 4a, "Styling";
// decision 13): a colour exists only as a token in app/tokens.css - light
// as the base, dark where it changes - and every other source file uses the
// token utilities (`bg-rail`, `text-accent`) or `var(--color-...)`.

const SRC = import.meta.dirname;
const TOKEN_FILE = join(SRC, 'app', 'tokens.css');

/**
 * The files that write colours themselves: the mails' layout and templates.
 * An inbox reads no stylesheet and no token, so they inline the colours of
 * sportbet's own mail templates (emails/login-code.blade.php,
 * emails/registration-code.blade.php, emails/prediction-reminder.blade.php),
 * and only those.
 */
const INBOX_FILES = ['mail-frame.ts', 'reminder-mail.ts'].map((name) =>
  join(SRC, 'server', 'mail', name),
);
const INBOX_COLOURS = [
  '#111',
  '#198754',
  '#1a1a2e',
  '#555',
  '#888',
  '#aaa',
  '#bbb',
  '#eee',
  '#f0f0f0',
  '#f8f8f8',
  '#fff',
  'rgba(0,0,0,.08)',
];

/** sportbet's colour tokens (custom.css :28-161), without the `sb-` prefix. */
const TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'card',
  'border',
  'border-strong',
  'text',
  'muted',
  'dim',
  'on-accent',
  'accent',
  'accent-hover',
  'accent-tint',
  'accent-tint-solid',
  'ok',
  'ok-tint',
  'warn',
  'warn-hover',
  'warn-tint',
  'bad',
  'bad-tint',
  'on-state',
  'on-warn',
  'on-rail',
  'rail',
  'rail-dim',
  'rail-line',
  'rail-row',
  'rail-accent',
  'rail-raised',
  'rail-wash-sm',
  'rail-wash-md',
  'rail-wash-lg',
  'rail-accent-wash',
  'ink',
  'on-ink',
  'crest-plate',
  'crest-plate-line',
  'scrim',
  'shadow',
  'shadow-strong',
  'medal-1',
  'medal-2',
  'medal-3',
  'medal-4',
  'on-medal',
  'on-medal-4',
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
  'series-9',
  'series-10',
];

/**
 * The ones sportbet gives no light override: they never change shade. The
 * medal colours are its fixed literals (custom.css .standing-pos-badge,
 * .pos-1 to .pos-4: "fixed medal identity, not a themed surface").
 */
const STEADY = [
  'on-accent',
  'on-warn',
  'ink',
  'on-ink',
  'crest-plate',
  'scrim',
  'medal-1',
  'medal-2',
  'medal-3',
  'medal-4',
  'on-medal',
  'on-medal-4',
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
  'series-9',
  'series-10',
];

/** Every other token changes between themes, so it has a dark value too. */
const FLIPPING = TOKENS.filter((token) => !STEADY.includes(token));

const COLOUR_LITERAL =
  /^(?:#[0-9a-f]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (?:0|1|0\.\d+)\))$/i;

const HEX = /#[0-9a-f]{3,8}\b/i;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const PALETTE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|shadow|accent|caret|divide|placeholder)(?:-[trblxyse])?-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)\b/;
const PER_THEME = /\bdark:|\[data-theme/;
const TOKEN_DECLARATION = /--color-[a-z0-9-]+\s*:/;

/** The body of the first `{ ... }` block after `opening`. */
function block(css: string, opening: string): string {
  const start = css.indexOf(opening);
  if (start < 0) throw new Error(`tokens.css has no "${opening}" block`);
  return css.slice(start + opening.length, css.indexOf('}', start));
}

function declarations(body: string): { name: string; value: string }[] {
  return [...body.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)].flatMap(
    ([, name, value]) =>
      name === undefined || value === undefined ? [] : [{ name, value }],
  );
}

/** Every .ts, .tsx and .css file under src, except tests and tokens.css. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const isSource =
      /\.(?:ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name);
    return isSource && path !== TOKEN_FILE ? [path] : [];
  });
}

describe('the tokens', () => {
  const css = readFileSync(TOKEN_FILE, 'utf8');
  const light = declarations(block(css, '@theme static {'));
  const dark = declarations(block(css, ":root[data-theme='dark'] {"));

  it("are sportbet's, every one, with light as the base", () => {
    expect(light.map(({ name }) => name).sort()).toEqual([...TOKENS].sort());
  });

  it('give every token that changes between themes its dark value, and only those', () => {
    expect(dark.map(({ name }) => name).sort()).toEqual([...FLIPPING].sort());
  });

  it('are colour literals, so no token borrows another theme through var()', () => {
    const notLiteral = [...light, ...dark].filter(
      ({ value }) => !COLOUR_LITERAL.test(value),
    );
    expect(notLiteral).toEqual([]);
  });

  it('are the whole file: nothing but the two blocks and comments', () => {
    const rest = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@theme static \{[^}]*\}/, '')
      .replace(/:root\[data-theme='dark'\] \{[^}]*\}/, '');
    expect(rest.trim()).toBe('');
  });
});

describe('every other source file', () => {
  const files = sourceFiles(SRC)
    .filter((path) => !INBOX_FILES.includes(path))
    .map((path) => ({
      path: relative(SRC, path),
      text: readFileSync(path, 'utf8'),
    }));
  const offending = (pattern: RegExp) =>
    files.filter(({ text }) => pattern.test(text)).map(({ path }) => path);

  it('is looked at, globals.css included', () => {
    expect(files.map(({ path }) => path)).toContain(join('app', 'globals.css'));
  });

  it('writes no hex colour', () => {
    expect(offending(HEX)).toEqual([]);
  });

  it('writes no rgb(), hsl() or other colour function', () => {
    expect(offending(COLOUR_FUNCTION)).toEqual([]);
  });

  it('uses no Tailwind palette colour', () => {
    expect(offending(PALETTE)).toEqual([]);
  });

  it('is not styled per theme: no dark: variant, no data-theme selector', () => {
    expect(offending(PER_THEME)).toEqual([]);
  });

  it('declares no colour token of its own', () => {
    expect(offending(TOKEN_DECLARATION)).toEqual([]);
  });
});

describe('the mails', () => {
  it("inline sportbet's mail colours, and no other", () => {
    const colour = new RegExp(String.raw`#[0-9a-f]{3,8}\b|rgba\([^)]*\)`, 'gi');
    const colours = new Set(
      INBOX_FILES.flatMap(
        (file) => readFileSync(file, 'utf8').match(colour) ?? [],
      ),
    );
    expect([...colours].sort()).toEqual([...INBOX_COLOURS].sort());
  });
});
