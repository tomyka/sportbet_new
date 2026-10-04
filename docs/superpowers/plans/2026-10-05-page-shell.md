# Page Shell (Slice 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page of the new app sits in sportbet's shell - rail from 992px, phone bar below, bottom tabs for a player, cookie banner - rebuilt in Tailwind 4 on sportbet's colour tokens in both themes, Lithuanian only, with no script, stylesheet or font from another origin; the guest shell is live on staging and the player shell is built and tested, unused until 4b.

**Architecture:** `apps/web/src/app/tokens.css` holds sportbet's colour tokens as Tailwind 4 theme variables (light on `:root` through `@theme`, dark on `:root[data-theme='dark']`), and a token guard test keeps every other colour out of the source. The shell lives in `apps/web/src/components/shell/`: pure components told everything through one `ShellView` (built per request in the root layout - the guest view in 4a), reading one list of navigation entries (`NAV_ENTRIES`, only "Turnyrai" in 4a) filtered per view and surface. Client components only where the browser is needed: the current-page link, the badge tip, the league switcher, the phone menu and the cookie banner. An inline theme script sets `data-theme` before the first paint; Inter is self-hosted by `next/font`; AdSense loads after "Sutinku" only where `ADSENSE_CLIENT` is set (production).

**Tech Stack:** Next.js 16.3.6 (App Router), React 19.3, Tailwind CSS 4.3.3 with `@tailwindcss/postcss` 4.3.3, `next/font/google` (Inter), `next/image`, Bootstrap Icons 1.11.1's SVG paths (inline, no package), Zod 4.6, Vitest 5 with Testing Library and jsdom (component), Vitest against the standalone build (feature), Playwright 1.63 (E2E and the look sign-off script).

**Spec:** `docs/superpowers/specs/2026-10-05-page-shell-design.md`. **Decision:** 13 (`docs/decisions.md`). **Issue:** #15 (part of #1). **Reference:** sportbet (`D:\Projects\sportbet`) at `1ac955f`, the commit production runs.

---

## Conventions for every task

- Work on `main` (trunk-based, `CLAUDE.md`). Each task names the teammate role that owns its folders (`docs/agent-team.md`): `web-dev` edits `apps/web` only, `devops` the `Dockerfile`, `qa` test files only, the lead the docs. `qa` reviews every task against the issue's criteria and sportbet's behaviour, `architect` against `CLAUDE.md` and the spec; **only the lead commits**, once both have passed the task. A teammate's last step is "hand to the lead": the files changed, the commands run and their results, and the commit message below. Every commit message references `#15` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 17.
- Shell snippets are Git Bash on Windows, run from the repository root `D:\Projects\sportbet_new`. The feature suite needs Docker running and a fresh `pnpm build`.
- Every verify step runs `pnpm format` first; the code below is written as Prettier leaves it (single quotes, `.prettierrc`), but a line Prettier rewraps is not a failure - `pnpm format:check` must pass after `pnpm format`.
- "sportbet" means the old app at `1ac955f`. Read any of its files with `git -C /d/Projects/sportbet show 1ac955f:<path>`. Every Lithuanian text below is copied from sportbet's shell partials (their `lang/lt.json` values); none is invented. Every class list names the `custom.css` rule it transcribes.
- **Colours:** no hex, `rgb()`, `hsl()` or other colour literal anywhere in `apps/web/src` except `src/app/tokens.css`; no Tailwind palette class (`bg-orange-500`), no `dark:` variant, no `[data-theme` selector outside that file (Task 1's guard enforces it from then on). A component uses token utilities only: `bg-rail`, `text-on-rail`, `border-rail-line`, or `var(--color-...)` inside an arbitrary value.
- **Classes:** a link's idle and current classes are applied one or the other, never layered (`nav-link.tsx`), so two utilities never compete for one property; a variant (`hover:`, `lg:`, `max-sm:`) may restate a property its base sets.
- Code rules (`CLAUDE.md`): pages only load data and return one component; markup lives in components, each with a component test; no `any`, no `as` other than `as const`, no `!`; a skipped or focused test is a lint error; invisible characters in tests are written as escapes.
- Component test runs below use `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts <file>`; the whole suite is `pnpm test:component`.

## File map

```
apps/web/package.json                         + tailwindcss, @tailwindcss/postcss (4.3.3); look:signoff script
apps/web/postcss.config.mjs                   Tailwind's PostCSS plugin (new)
apps/web/vitest.component.config.ts           also runs src/**/*.test.ts
apps/web/tsconfig.json                        includes look/
apps/web/src/test-setup.ts                    + next/navigation's usePathname mocked to '/'
apps/web/src/token-guard.test.ts              sportbet's CssTokenGuardTest, for Tailwind (new)
apps/web/src/app/tokens.css                   every colour token, light base, dark override (new)
apps/web/src/app/globals.css                  Tailwind, the tokens, Bootstrap's breakpoints, Inter, link base (new)
apps/web/src/app/layout.tsx                   lang="lt", Inter, theme script, favicons, the shell around every page
apps/web/src/env.ts                           + ADSENSE_CLIENT (optional, ca-pub- and 16 digits)
apps/web/src/components/{home-view,not-found-view,tournament-details}.tsx   no <main> of their own (the shell has it)
apps/web/src/components/{home-view,not-found-view,tournament-details,tournament-list,back-to-list}.tsx (+ tests)   in Lithuanian (Task 12b)
apps/web/e2e/tournaments.spec.ts              the Lithuanian texts (Task 14)
apps/web/src/components/shell/
  theme-script.tsx        THEME_SCRIPT, ThemeScript                      (+ test)
  icon.tsx                IconName, Icon: Bootstrap Icons 1.11.1 paths   (+ test)
  shell-view.ts           ShellView and its parts, guestView             (+ test)
  nav-entries.ts          NavEntry, NAV_ENTRIES, entriesFor, inGroup, privacyHref (+ test)
  shell-paths.ts          sportbet's URLs the player shell reaches outside the entries
  nav-styles.ts           class lists shared by several parts (from custom.css)
  nav-link.tsx            NavLink: a link that knows it is the current page (client) (+ test)
  nav-badge.tsx           badgeLabel, NavBadge with its tip (client)      (+ test)
  league-switcher.tsx     LeagueSwitcher: rail card or bottom-tab drop-up (client) (+ test)
  rail-tournament.tsx     RailTournament                                 (+ test)
  rail-account.tsx        RailAccount                                    (+ test)
  brand.tsx               RailBrand, PhoneBrand                          (+ test)
  rail-nav.tsx            RailNav                                        (+ test)
  guest-rail.tsx          GuestRail                                      (+ test)
  player-rail.tsx         PlayerRail                                     (+ test)
  phone-menu.tsx          PhoneMenu: the bar's toggle and panel (client) (+ test)
  phone-header.tsx        PhoneHeader, its menu panel                    (+ test)
  bottom-tabs.tsx         BottomTabs                                     (+ test)
  cookie-consent.tsx      CONSENT_KEY, CookieConsent (client)            (+ test)
  shell.tsx               Shell                                          (+ test)
apps/web/tests/support/shell-views.ts         JONAS, playerView: the player views 4b will build, for tests
apps/web/tests/feature/routes.test.ts         + the shell, Lithuanian, nothing from elsewhere
apps/web/tests/feature/startup.test.ts        + a bad ADSENSE_CLIENT stops the server
apps/web/public/img/{logo.png,logo.svg,favicon.png,favicon-180.png,favicon.svg,favicon-512.png}, apps/web/public/favicon.ico   sportbet's, byte for byte
apps/web/e2e/shell.spec.ts                    the guest shell at 390 and 1280 (new)
apps/web/look/signoff.ts                      sportbet.lt and staging side by side (new)
.gitignore                                    + look-signoff/
Dockerfile                                    copies apps/web/public into the web image
README.md, CLAUDE.md, docs/phase-2-inventory.md, docs/agent-team.md   the records
```

## Design decisions this plan makes

None is a game rule; each is how the spec is held, and each departs from its letter only where the framework showed it had to:

1. **The shell is in the root layout, and the view is built there per request.** The code rules say a page only loads data and returns one component, so the frame cannot be each page's; the layout calls `await connection()` (per request, never prerendered: `ADSENSE_CLIENT` is read when the page is served, not baked in at build, where it is unset) and passes `guestView()` to `Shell`. The spec's "every page builds the guest view" holds as "every request". For 4b: Next does not re-render a layout on a client-side navigation, so the player's view (badges, current league) refreshes on a full load only; 4b decides how it refreshes (sportbet refreshed badges through `/nav/missing`, slice 6).
2. **One more client component than the spec lists: `NavLink`.** The layout cannot know the current path, so a link marks itself current (`aria-current="page"`, sportbet's `active` class) from `usePathname()`. Everything else the spec lists as client is client (badge tip, league drop-up, phone menu, cookie banner); the rest is server markup.
3. **An entry says where and when it shows.** `NavEntry` carries its audience (`guest` / `player`), its block (`main`, `summary`, `league`, `info` - sportbet's rail and menu blocks), its surfaces (`rail`, `menu`, `tabs`, `pills`), its badge, and `shownWhen(view)` for a flag (`nav.survival` and the rest). `entriesFor(view, surface)` filters once in `Shell`; the parts render what they are given. 4a lists only "Turnyrai" (`/`, guest, rail), so the flag, badge and block behaviour is tested through fixture entries - the same way each later slice's entries will flow.
4. **Token names.** `--sb-<name>` becomes `--color-<name>` (utilities `bg-rail`, `text-on-rail`); Tailwind's default palette, radii and breakpoints are cleared (`--color-*: initial` and the like), so a palette class does not even exist. `--sb-radius` and `--sb-radius-sm` become `--radius-md` (8px) and `--radius-sm` (4px): Tailwind 4's bare `--radius` is deprecated. Breakpoints are Bootstrap 5.0's (576, 768, 992, 1200, 1400), since sportbet's shell switches at 992px and trims below 576px and 360px.
5. **Badge tips** are a small client portal into `<body>` on hover (sportbet's Bootstrap tooltip with `data-bs-container="body"`, there because both navigations clip their overflow), drawn on `bg-ink` / `text-on-ink` at 90% (Bootstrap's own tooltip is black and white; sportbet never re-skinned it); no arrow.
6. **The player shell's own links and forms use sportbet's URLs** (`shell-paths.ts`): profile `/userProfile`, admin `/admin`, "Keisti turnyrą" `/tournaments/exit`, sign-out a POST to `/logout` (a hidden form per place, as sportbet has), league switch a POST to `/leagues/switch` with `leagueID`. None is served in 4a and none renders before 4b switches the player shell on; each is served by the slice that owns it (4b sign-out, 5 tournaments, leagues, 14 admin, 17 profile). The spec's rule holds for them too: the shell never links to a page that does not exist, so 4b lists each player link only once its page exists, through the same entries mechanism (moving profile, admin and the tournament exit behind the same "listed once its page exists" check as `NAV_ENTRIES`); 4a builds and tests them, unused.
7. **Both brands lead to `/`.** sportbet sends a signed-in player to `/main`, which arrives with its own slice; the brand follows then.
8. **The logo** is sportbet's `logo.png` (1024 x 1024, 1.5 MB), served through `next/image` from the app itself (`/_next/image`, resized to the 26px and 32px it is drawn at) rather than the full file sportbet sends to every phone. Same origin, so "nothing from elsewhere" holds.
9. **Left out, as the spec and decision 13 say:** the locale switch (rail and phone bar), "Prisijungti" and the sign-in dialog (4b), "Lyderiai", "Taisyklės", "Pagalba", "Jaunimo linija", "Privatumas" (their pages arrive with their slices), the Material Icons match glyph (with the predictions pages), the rehearsal banner, `/nav/missing`. Without `/privacy` (slice 18) the cookie banner says only its first sentence, "Naudojame slapukus reklamai ir statistikai.", and links nothing; the link comes with the page, through `privacyHref`. No ad runs before then: ads run only on production, which runs the new app only after `/privacy` exists.
10. **`ADSENSE_CLIENT` is validated** (`ca-pub-` and 16 digits): a bad value stops the server at start, like a bad `DATABASE_URL`. Production must set `ADSENSE_CLIENT=ca-pub-7290396604686794` at switch-over (README).
11. **The cookie banner is in the markup from the server, hidden** (`data-state="unread"`), and shown or kept hidden once the browser has read the stored answer - sportbet's `display:none` until its script ran. `data-state` (`unread` / `asking` / `answered`) is what E2E waits on.
12. **Test hooks:** the shell's four parts carry `data-testid` (`rail`, `phone-header`, `bottom-tabs`, `cookie-consent`), plus `rail-context` for the tournament card; sportbet's tests found the same parts by their `sb-*` classes, which no longer exist.

---

### Task 0 (lead): The gate

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-05-page-shell-design.md
grep -n "## 13. The old look, rebuilt" docs/decisions.md
git -C /d/Projects/sportbet cat-file -t 1ac955f
git rev-parse --short HEAD
```

Expected: `0`; `34618f2 docs: slice 4a spec, and decision 13 - the old look rebuilt, Lithuanian only (#15)`; one line; `commit`; the gate's commit (with this plan committed on top of `34618f2`) - note it, Task 17 reviews from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Done`; `3`; component `4 passed (4)` files and `5 passed (5)` tests; feature passes (note its counts - Task 12 adds 3 tests and Task 11 adds 1).

---

### Task 1 (web-dev): Tailwind 4, sportbet's tokens and the token guard

**Files:**
- Modify: `apps/web/package.json`, `pnpm-lock.yaml` (through `pnpm add`)
- Create: `apps/web/postcss.config.mjs`, `apps/web/src/app/tokens.css`, `apps/web/src/app/globals.css`
- Modify: `apps/web/vitest.component.config.ts`, `apps/web/src/app/layout.tsx`
- Test: `apps/web/src/token-guard.test.ts`

- [ ] **Step 1: Add Tailwind, pinned**

```bash
pnpm --filter @sportbet/web add -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3
grep -n '"tailwindcss"\|"@tailwindcss/postcss"' apps/web/package.json
```

Expected: `"@tailwindcss/postcss": "4.3.3",` and `"tailwindcss": "4.3.3",` in `devDependencies` (exact: `saveExact` is on in `pnpm-workspace.yaml`). Neither package has an install script, so `onlyBuiltDependencies` needs nothing.

- [ ] **Step 2: Run the component suite over `.ts` files too**

In `apps/web/vitest.component.config.ts`, replace:

```ts
    include: ['src/**/*.test.tsx'],
```

with:

```ts
    include: ['src/**/*.test.{ts,tsx}'],
```

- [ ] **Step 3: Write the failing guard**

Create `apps/web/src/token-guard.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// sportbet's CssTokenGuardTest, for the rebuilt look (spec 4a, "Styling";
// decision 13): a colour exists only as a token in app/tokens.css - light
// as the base, dark where it changes - and every other source file uses the
// token utilities (`bg-rail`, `text-accent`) or `var(--color-...)`.

const SRC = fileURLToPath(new URL('.', import.meta.url));
const TOKEN_FILE = join(SRC, 'app', 'tokens.css');

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
];

/** The six sportbet gives no light override: they never change shade. */
const STEADY = ['on-accent', 'on-warn', 'ink', 'on-ink', 'crest-plate', 'scrim'];

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
  const light = declarations(block(css, '@theme {'));
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
      .replace(/@theme \{[^}]*\}/, '')
      .replace(/:root\[data-theme='dark'\] \{[^}]*\}/, '');
    expect(rest.trim()).toBe('');
  });
});

describe('every other source file', () => {
  const files = sourceFiles(SRC).map((path) => ({
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
```

- [ ] **Step 4: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/token-guard.test.ts`
Expected: FAIL - the file cannot be collected: `ENOENT: no such file or directory` for `src/app/tokens.css`.

- [ ] **Step 5: The tokens**

Create `apps/web/src/app/tokens.css` (values transcribed from sportbet's `public/css/custom.css` at `1ac955f`, `:root` at :28-161 and `:root[data-theme="light"]` at :163-211; sportbet's base is dark and light its override, here the other way round):

```css
/*
 * sportbet's colour tokens (public/css/custom.css at 1ac955f, :28-211):
 * the only place in apps/web a colour is written. Names are sportbet's
 * without `sb-`, as Tailwind theme variables, so `--color-rail` is the
 * `bg-rail` / `text-rail` / `border-rail` utilities.
 *
 * Light is the base and dark the override: a visitor sees light unless
 * they chose dark (localStorage 'sb-theme', theme-script.tsx). sportbet
 * keeps it the other way round; the values are the same.
 *
 * A token with no dark value never changes shade (sportbet gives it no
 * light override): on-accent, on-warn, ink, on-ink, crest-plate, scrim.
 * Every other token needs a value in both blocks. Colours drawn ON the
 * rail come from the rail family (rail-*, on-rail), never from text,
 * muted or accent, which flip on the page's schedule (sportbet's
 * --sb-on-rail comment). src/token-guard.test.ts holds all of this.
 */
@theme {
  --color-*: initial;

  /* ground */
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-surface-2: #f4f6f8;
  --color-card: #ffffff;

  /* line */
  --color-border: #dfe3e8;
  --color-border-strong: #c6cdd5;

  /* text */
  --color-text: #0e1216;
  --color-muted: #5b6570;
  --color-dim: #8a94a0;
  /* near-black on either orange: white fails WCAG AA there */
  --color-on-accent: #0e1216;

  /* accent */
  --color-accent: #ff7a00;
  --color-accent-hover: #e56d00;
  --color-accent-tint: #fff1e2;
  --color-accent-tint-solid: #fff1e2;

  /* state, apart from the accent on purpose */
  --color-ok: #2e9d68;
  --color-ok-tint: #e6f5ee;
  --color-warn: #c88a16;
  --color-warn-hover: #a6740f;
  --color-warn-tint: #fdf3e0;
  --color-bad: #d13b3b;
  --color-bad-tint: #fcecec;
  --color-on-state: #ffffff;
  --color-on-warn: #0e1216;

  /* chrome: the rail, the phone bar and its menu, the bottom tabs */
  --color-on-rail: #0e1216;
  --color-rail: #f4f6f8;
  --color-rail-dim: #5b6570;
  --color-rail-line: #e4e8ec;
  --color-rail-row: #ffffff;
  --color-rail-accent: #b35600;
  --color-rail-raised: #ffffff;
  --color-rail-wash-sm: rgba(14, 18, 22, 0.04);
  --color-rail-wash-md: rgba(14, 18, 22, 0.08);
  --color-rail-wash-lg: rgba(14, 18, 22, 0.14);
  --color-rail-accent-wash: rgba(255, 122, 0, 0.18);

  /* surfaces that stay dark in both themes */
  --color-ink: #0a0d10;
  --color-on-ink: #ffffff;

  /* the plate a team crest is drawn on, and the "spent" scrim over it */
  --color-crest-plate: #ffffff;
  --color-crest-plate-line: rgba(14, 18, 22, 0.1);
  --color-scrim: rgba(14, 18, 22, 0.62);

  /* shadow */
  --color-shadow: rgba(0, 0, 0, 0.08);
  --color-shadow-strong: rgba(0, 0, 0, 0.18);

  /* shape: sportbet's --sb-radius-sm and --sb-radius (Tailwind's bare
     --radius is deprecated, so the 8px one is rounded-md) */
  --radius-*: initial;
  --radius-sm: 4px;
  --radius-md: 8px;
}

:root[data-theme='dark'] {
  --color-bg: #0e1216;
  --color-surface: #171c22;
  --color-surface-2: #1f252c;
  --color-card: #171c22;
  --color-border: #2b333b;
  --color-border-strong: #3b454f;
  --color-text: #ffffff;
  --color-muted: #98a2ad;
  --color-dim: #6e7883;
  --color-accent: #ff8a1f;
  --color-accent-hover: #ff9a3d;
  --color-accent-tint: rgba(255, 138, 31, 0.15);
  --color-accent-tint-solid: #322417;
  --color-ok: #31b47a;
  --color-ok-tint: rgba(49, 180, 122, 0.16);
  --color-warn: #e0a32c;
  --color-warn-hover: #e8b354;
  --color-warn-tint: rgba(224, 163, 44, 0.16);
  --color-bad: #e04d4d;
  --color-bad-tint: rgba(224, 77, 77, 0.15);
  --color-on-state: #0e1216;
  --color-on-rail: #ffffff;
  --color-rail: #0a0d10;
  --color-rail-dim: #8a94a0;
  --color-rail-line: #1c232a;
  --color-rail-row: #1c232a;
  --color-rail-accent: #ff8a1f;
  --color-rail-raised: #1f252c;
  --color-rail-wash-sm: rgba(255, 255, 255, 0.06);
  --color-rail-wash-md: rgba(255, 255, 255, 0.12);
  --color-rail-wash-lg: rgba(255, 255, 255, 0.2);
  --color-rail-accent-wash: rgba(255, 138, 31, 0.25);
  --color-crest-plate-line: rgba(255, 255, 255, 0);
  --color-shadow: rgba(0, 0, 0, 0.24);
  --color-shadow-strong: rgba(0, 0, 0, 0.45);
}
```

- [ ] **Step 6: Tailwind's entry and PostCSS**

Create `apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';
@import './tokens.css';

/* Bootstrap 5.0's breakpoints, which sportbet's shell is laid out on: the
   rail from 992px (lg), the phone bar's trims below 576px (max-sm). */
@theme {
  --breakpoint-*: initial;
  --breakpoint-sm: 576px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 992px;
  --breakpoint-xl: 1200px;
  --breakpoint-xxl: 1400px;
}

/* Inter (next/font in layout.tsx) with sportbet's fallbacks. */
@theme inline {
  --font-sans:
    var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI',
    sans-serif;
}

/* sportbet's base (custom.css :336-343 over Bootstrap 5.0's reboot): links
   in the accent, underlined. Every shell link sets its own colour and
   no-underline; a utility always wins over this layer. */
@layer base {
  a {
    color: var(--color-accent);
    text-decoration: underline;
  }

  a:hover {
    color: var(--color-accent-hover);
  }
}
```

Create `apps/web/postcss.config.mjs`:

```js
// Tailwind 4 through PostCSS, as Next reads it (globals.css).
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

- [ ] **Step 7: Load it**

Replace the whole of `apps/web/src/app/layout.tsx` (Task 2 adds the font, the theme script and the language; Task 12 the shell):

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = { title: 'sportbet' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* sportbet's .sb-layout and body */}
      <body className="flex min-h-screen flex-col bg-bg font-sans text-text">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Run the guard, then everything it touches**

```bash
pnpm format
pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/token-guard.test.ts 2>&1 | grep -E "Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm build 2>&1 | grep -c "build: Done"
grep -rl -- "--color-bg" apps/web/.next/static | grep -c "\.css$"
grep -rlE "data-theme=.?dark" apps/web/.next/static | grep -c "\.css$"
```

Expected: `10 passed (10)`; component `5 passed (5)` files and `15 passed (15)` tests; `ok`; `3`; at least `1` CSS file carrying `--color-bg`, and at least `1` carrying the dark override.

- [ ] **Step 9: Hand to the lead**

Commit message:

```
feat(web): Tailwind 4 on sportbet's colour tokens, with the token guard (#15)

tokens.css holds every --sb-* colour as a Tailwind theme variable, light
as the base and dark under [data-theme='dark']; the palette, radii and
breakpoints are sportbet's only. The guard (sportbet's CssTokenGuardTest)
keeps every other colour out of src.
```

---

### Task 2 (web-dev): Inter, the theme script, Lithuanian, the favicons

**Files:**
- Create: `apps/web/src/components/shell/theme-script.tsx`
- Test: `apps/web/src/components/shell/theme-script.test.tsx`
- Create: `apps/web/public/img/logo.png`, `logo.svg`, `favicon.png`, `favicon-180.png`, `favicon.svg`, `favicon-512.png`; `apps/web/public/favicon.ico` (copied)
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/shell/theme-script.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_SCRIPT, ThemeScript } from './theme-script';

// The script runs in <head> before the first paint, so it is tested by
// running it, as the browser does.
function runScript(): void {
  window.eval(THEME_SCRIPT);
}

const theme = () => document.documentElement.getAttribute('data-theme');

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ThemeScript', () => {
  it('is inline, with nothing to fetch', () => {
    expect(renderToStaticMarkup(<ThemeScript />)).toBe(
      `<script>${THEME_SCRIPT}</script>`,
    );
  });

  it('leaves a first-time visitor on light', () => {
    runScript();
    expect(theme()).toBeNull();
  });

  it('turns the page dark for a visitor who chose dark', () => {
    localStorage.setItem('sb-theme', 'dark');
    runScript();
    expect(theme()).toBe('dark');
  });

  it('keeps light for any other stored value', () => {
    localStorage.setItem('sb-theme', 'light');
    runScript();
    expect(theme()).toBeNull();
  });

  it('keeps light, without an error, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(runScript).not.toThrow();
    expect(theme()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/theme-script.test.tsx`
Expected: FAIL - `Failed to resolve import "./theme-script"`.

- [ ] **Step 3: The script**

Create `apps/web/src/components/shell/theme-script.tsx`:

```tsx
/**
 * Runs inline in <head>, before the first paint (layout.tsx): dark only
 * when the visitor chose it - localStorage 'sb-theme' is 'dark', as
 * sportbet stores it - and light otherwise, also when storage is blocked
 * and throws. Choosing the theme is a profile setting (slice 17), not part
 * of the shell.
 */
export const THEME_SCRIPT =
  "(function(){try{if(localStorage.getItem('sb-theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()";

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/theme-script.test.tsx`
Expected: PASS, `5 passed (5)`.

- [ ] **Step 5: Copy sportbet's images, byte for byte**

```bash
mkdir -p apps/web/public/img
for f in logo.png logo.svg favicon.png favicon-180.png favicon.svg favicon-512.png; do
  git -C /d/Projects/sportbet show "1ac955f:public/img/$f" > "apps/web/public/img/$f"
done
git -C /d/Projects/sportbet show 1ac955f:public/favicon.ico > apps/web/public/favicon.ico
for f in apps/web/public/img/* apps/web/public/favicon.ico; do echo "$(git hash-object "$f") $f"; done
```

Expected (each object id equals sportbet's blob at `1ac955f`):

```
206f6687a3ae596e01282824961dd8fdd50d428c apps/web/public/img/logo.svg
83d908880e8dbcbf4a11247e567e60caead1ea01 apps/web/public/img/favicon-180.png
a2462d8a42de19996d7dd2ad7fc2b06fdd427781 apps/web/public/img/favicon-512.png
5dc0dbb9d3fa5458edc248c942fda1b3194be4c4 apps/web/public/img/favicon.png
4a74e92aaceaf5b9788a5acb7d091b46ebac0683 apps/web/public/img/favicon.svg
cfc0a7a03d249d3520b6ace9e05428ccd52e6ed9 apps/web/public/img/logo.png
e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 apps/web/public/favicon.ico
```

(The order of the `img` lines may differ. sportbet's `favicon.ico` is empty, and so is this one.)

- [ ] **Step 6: The layout: Lithuanian, Inter, the script, the favicons**

Replace the whole of `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { ThemeScript } from '../components/shell/theme-script';
import './globals.css';

// Inter as sportbet loads it (400-800), downloaded at build and served by
// the app itself: no request to Google at run time. latin-ext carries
// Lithuanian's letters.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SportBet',
  icons: {
    icon: { url: '/img/favicon.png', type: 'image/png' },
    apple: '/img/favicon-180.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="lt" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      {/* sportbet's .sb-layout and body */}
      <body className="flex min-h-screen flex-col bg-bg font-sans text-text">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Verify**

```bash
pnpm format
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm build 2>&1 | grep -c "build: Done"
ls apps/web/.next/static/media | grep -c "\.woff2$"
```

Expected: `6 passed (6)` files, `20 passed (20)` tests; `ok`; `3`; at least `1` self-hosted Inter file.

- [ ] **Step 8: Hand to the lead**

Commit message:

```
feat(web): Lithuanian pages in Inter, themed before the first paint (#15)

<html lang="lt">; Inter 400-800 self-hosted through next/font; an inline
script turns the page dark only when localStorage 'sb-theme' says so;
sportbet's logo and favicons copied byte for byte.
```

---

### Task 3 (web-dev): The icons, as inline SVG

**Files:**
- Create: `apps/web/src/components/shell/icon.tsx`
- Test: `apps/web/src/components/shell/icon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/shell/icon.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './icon';

const NAMES: readonly IconName[] = [
  'arrow-left-right',
  'box-arrow-right',
  'check2',
  'cookie',
  'database-gear',
  'globe2',
  'list',
  'person-fill',
  'trophy',
];

describe('Icon', () => {
  it.each(NAMES)(
    'draws %s as a 1em glyph in the text colour, hidden from screen readers',
    (name) => {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('data-icon')).toBe(name);
      expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(svg?.getAttribute('width')).toBe('1em');
      expect(svg?.getAttribute('fill')).toBe('currentColor');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    },
  );

  it("keeps the even-odd fill of the glyphs Bootstrap Icons draws with it", () => {
    const { container } = render(<Icon name="list" />);
    expect(container.querySelector('path')?.getAttribute('fill-rule')).toBe(
      'evenodd',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/icon.test.tsx`
Expected: FAIL - `Failed to resolve import "./icon"`.

- [ ] **Step 3: The icons**

Create `apps/web/src/components/shell/icon.tsx` (the paths are `bootstrap-icons@1.11.1/icons/<name>.svg`, MIT, copied exactly):

```tsx
/**
 * The Bootstrap Icons 1.11.1 glyphs the shell draws, as inline SVG (the
 * package's paths, MIT licence) in place of sportbet's `bi bi-*` icon font
 * from a CDN. Drawn like the font: 1em square, in the text colour, on the
 * text's baseline. A slice whose entry needs another icon copies its paths
 * from bootstrap-icons@1.11.1/icons/<name>.svg and adds it here.
 */
export type IconName =
  | 'arrow-left-right'
  | 'box-arrow-right'
  | 'check2'
  | 'cookie'
  | 'database-gear'
  | 'globe2'
  | 'list'
  | 'person-fill'
  | 'trophy';

interface IconPath {
  readonly d: string;
  readonly evenOdd?: true;
}

const ICONS: Readonly<Record<IconName, readonly IconPath[]>> = {
  'arrow-left-right': [
    {
      evenOdd: true,
      d: 'M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5z',
    },
  ],
  'box-arrow-right': [
    {
      evenOdd: true,
      d: 'M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z',
    },
    {
      evenOdd: true,
      d: 'M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z',
    },
  ],
  check2: [
    {
      d: 'M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z',
    },
  ],
  cookie: [
    {
      d: 'M6 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm4.5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-.5 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    },
    {
      d: 'M8 0a7.963 7.963 0 0 0-4.075 1.114c-.162.067-.31.162-.437.28A8 8 0 1 0 8 0Zm3.25 14.201a1.5 1.5 0 0 0-2.13.71A7.014 7.014 0 0 1 8 15a6.967 6.967 0 0 1-3.845-1.15 1.5 1.5 0 1 0-2.005-2.005A6.967 6.967 0 0 1 1 8c0-1.953.8-3.719 2.09-4.989a1.5 1.5 0 1 0 2.469-1.574A6.985 6.985 0 0 1 8 1c1.42 0 2.742.423 3.845 1.15a1.5 1.5 0 1 0 2.005 2.005A6.967 6.967 0 0 1 15 8c0 .596-.074 1.174-.214 1.727a1.5 1.5 0 1 0-1.025 2.25 7.033 7.033 0 0 1-2.51 2.224Z',
    },
  ],
  'database-gear': [
    {
      d: 'M12.096 6.223A4.92 4.92 0 0 0 13 5.698V7c0 .289-.213.654-.753 1.007a4.493 4.493 0 0 1 1.753.25V4c0-1.007-.875-1.755-1.904-2.223C11.022 1.289 9.573 1 8 1s-3.022.289-4.096.777C2.875 2.245 2 2.993 2 4v9c0 1.007.875 1.755 1.904 2.223C4.978 15.71 6.427 16 8 16c.536 0 1.058-.034 1.555-.097a4.525 4.525 0 0 1-.813-.927C8.5 14.992 8.252 15 8 15c-1.464 0-2.766-.27-3.682-.687C3.356 13.875 3 13.373 3 13v-1.302c.271.202.58.378.904.525C4.978 12.71 6.427 13 8 13h.027a4.552 4.552 0 0 1 0-1H8c-1.464 0-2.766-.27-3.682-.687C3.356 10.875 3 10.373 3 10V8.698c.271.202.58.378.904.525C4.978 9.71 6.427 10 8 10c.262 0 .52-.008.774-.024a4.525 4.525 0 0 1 1.102-1.132C9.298 8.944 8.666 9 8 9c-1.464 0-2.766-.27-3.682-.687C3.356 7.875 3 7.373 3 7V5.698c.271.202.58.378.904.525C4.978 6.711 6.427 7 8 7s3.022-.289 4.096-.777ZM3 4c0-.374.356-.875 1.318-1.313C5.234 2.271 6.536 2 8 2s2.766.27 3.682.687C12.644 3.125 13 3.627 13 4c0 .374-.356.875-1.318 1.313C10.766 5.729 9.464 6 8 6s-2.766-.27-3.682-.687C3.356 4.875 3 4.373 3 4Z',
    },
    {
      d: 'M11.886 9.46c.18-.613 1.048-.613 1.229 0l.043.148a.64.64 0 0 0 .921.382l.136-.074c.561-.306 1.175.308.87.869l-.075.136a.64.64 0 0 0 .382.92l.149.045c.612.18.612 1.048 0 1.229l-.15.043a.64.64 0 0 0-.38.921l.074.136c.305.561-.309 1.175-.87.87l-.136-.075a.64.64 0 0 0-.92.382l-.045.149c-.18.612-1.048.612-1.229 0l-.043-.15a.64.64 0 0 0-.921-.38l-.136.074c-.561.305-1.175-.309-.87-.87l.075-.136a.64.64 0 0 0-.382-.92l-.148-.045c-.613-.18-.613-1.048 0-1.229l.148-.043a.64.64 0 0 0 .382-.921l-.074-.136c-.306-.561.308-1.175.869-.87l.136.075a.64.64 0 0 0 .92-.382l.045-.148ZM14 12.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    },
  ],
  globe2: [
    {
      d: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855-.143.268-.276.56-.395.872.705.157 1.472.257 2.282.287V1.077zM4.249 3.539c.142-.384.304-.744.481-1.078a6.7 6.7 0 0 1 .597-.933A7.01 7.01 0 0 0 3.051 3.05c.362.184.763.349 1.198.49zM3.509 7.5c.036-1.07.188-2.087.436-3.008a9.124 9.124 0 0 1-1.565-.667A6.964 6.964 0 0 0 1.018 7.5h2.49zm1.4-2.741a12.344 12.344 0 0 0-.4 2.741H7.5V5.091c-.91-.03-1.783-.145-2.591-.332zM8.5 5.09V7.5h2.99a12.342 12.342 0 0 0-.399-2.741c-.808.187-1.681.301-2.591.332zM4.51 8.5c.035.987.176 1.914.399 2.741A13.612 13.612 0 0 1 7.5 10.91V8.5H4.51zm3.99 0v2.409c.91.03 1.783.145 2.591.332.223-.827.364-1.754.4-2.741H8.5zm-3.282 3.696c.12.312.252.604.395.872.552 1.035 1.218 1.65 1.887 1.855V11.91c-.81.03-1.577.13-2.282.287zm.11 2.276a6.696 6.696 0 0 1-.598-.933 8.853 8.853 0 0 1-.481-1.079 8.38 8.38 0 0 0-1.198.49 7.01 7.01 0 0 0 2.276 1.522zm-1.383-2.964A13.36 13.36 0 0 1 3.508 8.5h-2.49a6.963 6.963 0 0 0 1.362 3.675c.47-.258.995-.482 1.565-.667zm6.728 2.964a7.009 7.009 0 0 0 2.275-1.521 8.376 8.376 0 0 0-1.197-.49 8.853 8.853 0 0 1-.481 1.078 6.688 6.688 0 0 1-.597.933zM8.5 11.909v3.014c.67-.204 1.335-.82 1.887-1.855.143-.268.276-.56.395-.872A12.63 12.63 0 0 0 8.5 11.91zm3.555-.401c.57.185 1.095.409 1.565.667A6.963 6.963 0 0 0 14.982 8.5h-2.49a13.36 13.36 0 0 1-.437 3.008zM14.982 7.5a6.963 6.963 0 0 0-1.362-3.675c-.47.258-.995.482-1.565.667.248.92.4 1.938.437 3.008h2.49zM11.27 2.461c.177.334.339.694.482 1.078a8.368 8.368 0 0 0 1.196-.49 7.01 7.01 0 0 0-2.275-1.52c.218.283.418.597.597.932zm-.488 1.343a7.765 7.765 0 0 0-.395-.872C9.835 1.897 9.17 1.282 8.5 1.077V4.09c.81-.03 1.577-.13 2.282-.287z',
    },
  ],
  list: [
    {
      evenOdd: true,
      d: 'M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z',
    },
  ],
  'person-fill': [
    {
      d: 'M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3Zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    },
  ],
  trophy: [
    {
      d: 'M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5c0 .538-.012 1.05-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33.076 33.076 0 0 1 2.5.5zm.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935zm10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935zM3.504 1c.007.517.026 1.006.056 1.469.13 2.028.457 3.546.87 4.667C5.294 9.48 6.484 10 7 10a.5.5 0 0 1 .5.5v2.61a1 1 0 0 1-.757.97l-1.426.356a.5.5 0 0 0-.179.085L4.5 15h7l-.638-.479a.501.501 0 0 0-.18-.085l-1.425-.356a1 1 0 0 1-.757-.97V10.5A.5.5 0 0 1 9 10c.516 0 1.706-.52 2.57-2.864.413-1.12.74-2.64.87-4.667.03-.463.049-.952.056-1.469H3.504z',
    },
  ],
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      className="inline-block shrink-0 align-[-0.125em]"
    >
      {ICONS[name].map((path) => (
        <path
          key={path.d}
          d={path.d}
          fillRule={path.evenOdd ? 'evenodd' : undefined}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/icon.test.tsx`
Expected: PASS, `10 passed (10)`.

- [ ] **Step 5: Check the paths against the package** (no dependency is added; this only proves the copy)

```bash
cd "$TEMP" && rm -rf bi-check && mkdir bi-check && cd bi-check && npm pack bootstrap-icons@1.11.1 >/dev/null 2>&1 && tar xzf bootstrap-icons-1.11.1.tgz
for name in arrow-left-right box-arrow-right check2 cookie database-gear globe2 list person-fill trophy; do
  grep -o ' d="[^"]*"' "package/icons/$name.svg" | sed 's/^ d="//; s/"$//' | while read -r d; do
    grep -qF "d: '$d'" /d/Projects/sportbet_new/apps/web/src/components/shell/icon.tsx && echo ok || echo "MISSING $name"
  done
done | sort | uniq -c
cd /d/Projects/sportbet_new && rm -rf "$TEMP/bi-check"
```

Expected: `     12 ok` and no `MISSING` line (twelve paths over the nine icons).

- [ ] **Step 6: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `7 passed (7)` files, `30 passed (30)` tests.

Commit message:

```
feat(web): the shell's icons as inline SVG from Bootstrap Icons 1.11.1 (#15)

Nine glyphs, their paths copied exactly, drawn like sportbet's icon font
(1em, currentColor, on the baseline) with no CDN.
```

---

### Task 4 (web-dev): What the shell is told, and what it links to

**Files:**
- Create: `apps/web/src/components/shell/shell-view.ts`, `apps/web/src/components/shell/nav-entries.ts`, `apps/web/src/components/shell/shell-paths.ts`, `apps/web/tests/support/shell-views.ts`
- Test: `apps/web/src/components/shell/shell-view.test.ts`, `apps/web/src/components/shell/nav-entries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/shell/shell-view.test.ts`:

```ts
import { expect, it } from 'vitest';
import { guestView } from './shell-view';

it('tells the shell a guest has no player, tournament, flags, badges or leagues', () => {
  expect(guestView()).toEqual({
    player: null,
    tournament: null,
    nav: { survival: false, summary: false, survivalSummary: false },
    badges: { results: 0, standings: 0, survival: 0, invites: 0 },
    leagues: null,
  });
});
```

Create `apps/web/tests/support/shell-views.ts`:

```ts
import {
  guestView,
  type ShellPlayer,
  type ShellView,
} from '../../src/components/shell/shell-view';

/** A signed-in player as 4b will describe one to the shell. */
export const JONAS: ShellPlayer = {
  name: 'Jonas P.',
  initials: 'JP',
  isAdmin: false,
};

/**
 * A signed-in player's view: in a tournament, in one league, no flags and
 * no badges. Each test overrides what it is about.
 */
export function playerView(overrides: Partial<ShellView> = {}): ShellView {
  return {
    ...guestView(),
    player: JONAS,
    tournament: { name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' },
    leagues: { current: 'Vieša', others: [] },
    ...overrides,
  };
}
```

Create `apps/web/src/components/shell/nav-entries.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playerView } from '../../../tests/support/shell-views';
import {
  NAV_ENTRIES,
  entriesFor,
  inGroup,
  privacyHref,
  type NavEntry,
} from './nav-entries';
import { guestView } from './shell-view';

// What later slices will list, to test the filtering 4a's one entry
// cannot show. Paths are illustrative.
const SURVIVAL: NavEntry = {
  label: 'Išlikimas',
  href: '/predictionSurvival',
  icon: 'trophy',
  audience: 'player',
  group: 'main',
  surfaces: ['rail', 'menu', 'tabs'],
  badge: 'survival',
  shownWhen: (view) => view.nav.survival,
};
const SUMMARY: NavEntry = {
  label: 'Prognozės',
  href: '/summary/results',
  icon: 'globe2',
  audience: 'player',
  group: 'summary',
  surfaces: ['rail', 'menu'],
  shownWhen: (view) => view.nav.summary,
};
const SURVIVAL_SUMMARY: NavEntry = {
  label: 'Išlikimas',
  href: '/summary/survivals',
  icon: 'globe2',
  audience: 'player',
  group: 'summary',
  surfaces: ['rail', 'menu'],
  shownWhen: (view) => view.nav.summary && view.nav.survivalSummary,
};
const PRIVACY: NavEntry = {
  label: 'Privatumas',
  href: '/privacy',
  icon: 'globe2',
  audience: 'guest',
  group: 'info',
  surfaces: ['rail'],
};
const FIXTURE: readonly NavEntry[] = [
  ...NAV_ENTRIES,
  SURVIVAL,
  SUMMARY,
  SURVIVAL_SUMMARY,
  PRIVACY,
];

const hrefsOf = (entries: readonly NavEntry[]) =>
  entries.map(({ href }) => href);

describe('NAV_ENTRIES', () => {
  it('lists only Turnyrai in 4a, for a guest, on the rail', () => {
    expect(NAV_ENTRIES).toEqual([
      {
        label: 'Turnyrai',
        href: '/',
        icon: 'globe2',
        audience: 'guest',
        group: 'main',
        surfaces: ['rail'],
      },
    ]);
  });

  it('links only to pages that exist, so the shell never leads to a 404', () => {
    const missing = NAV_ENTRIES.filter(
      ({ href }) =>
        !existsSync(
          new URL(
            `../../app${href === '/' ? '' : href}/page.tsx`,
            import.meta.url,
          ),
        ),
    );
    expect(missing).toEqual([]);
  });
});

describe('entriesFor', () => {
  it("gives a guest the guest entries and a player the player's", () => {
    expect(hrefsOf(entriesFor(guestView(), 'rail', FIXTURE))).toEqual([
      '/',
      '/privacy',
    ]);
    expect(
      hrefsOf(
        entriesFor(
          playerView({
            nav: { survival: true, summary: false, survivalSummary: false },
          }),
          'rail',
          FIXTURE,
        ),
      ),
    ).toEqual(['/predictionSurvival']);
  });

  it('draws an entry only on its surfaces', () => {
    const view = playerView({
      nav: { survival: true, summary: true, survivalSummary: true },
    });
    expect(hrefsOf(entriesFor(view, 'tabs', FIXTURE))).toEqual([
      '/predictionSurvival',
    ]);
    expect(entriesFor(guestView(), 'pills', FIXTURE)).toEqual([]);
  });

  it('shows survival only in a tournament with a survival game', () => {
    const off = playerView();
    const on = playerView({
      nav: { survival: true, summary: false, survivalSummary: false },
    });
    expect(entriesFor(off, 'menu', FIXTURE)).toEqual([]);
    expect(entriesFor(on, 'menu', FIXTURE)).toEqual([SURVIVAL]);
  });

  it("shows the summary once there is one, and its survival line only with both flags", () => {
    const summaryOnly = playerView({
      nav: { survival: false, summary: true, survivalSummary: false },
    });
    const both = playerView({
      nav: { survival: false, summary: true, survivalSummary: true },
    });
    const survivalSummaryAlone = playerView({
      nav: { survival: false, summary: false, survivalSummary: true },
    });
    expect(entriesFor(summaryOnly, 'rail', FIXTURE)).toEqual([SUMMARY]);
    expect(entriesFor(both, 'rail', FIXTURE)).toEqual([
      SUMMARY,
      SURVIVAL_SUMMARY,
    ]);
    expect(entriesFor(survivalSummaryAlone, 'rail', FIXTURE)).toEqual([]);
  });

  it('defaults to NAV_ENTRIES', () => {
    expect(entriesFor(guestView(), 'rail')).toEqual(NAV_ENTRIES);
  });
});

describe('inGroup', () => {
  it("keeps one block's entries, in their order", () => {
    expect(inGroup(FIXTURE, 'summary')).toEqual([SUMMARY, SURVIVAL_SUMMARY]);
    expect(inGroup(FIXTURE, 'league')).toEqual([]);
  });
});

describe('privacyHref', () => {
  it('is the privacy page once it is listed, and nothing before', () => {
    expect(privacyHref()).toBeNull();
    expect(privacyHref(FIXTURE)).toBe('/privacy');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/shell-view.test.ts src/components/shell/nav-entries.test.ts`
Expected: FAIL - `Failed to resolve import "./shell-view"` and `"./nav-entries"`.

- [ ] **Step 3: The view**

Create `apps/web/src/components/shell/shell-view.ts`:

```ts
/**
 * What the shell is told about the request (spec 4a, "What the shell is
 * told"): one typed view, built on the server per request and passed down.
 * No shell component reads a session or the database. In 4a every request
 * gets the guest view; 4b builds a player's from the request context, and
 * the rules behind the nav flags (sportbet's NavVisibility) are 4b's.
 */
export interface ShellView {
  readonly player: ShellPlayer | null;
  readonly tournament: ShellTournament | null;
  readonly nav: ShellNav;
  readonly badges: ShellBadges;
  readonly leagues: ShellLeagues | null;
}

export interface ShellPlayer {
  /** As the rail shows it: first name and the surname's initial ("Jonas P."). */
  readonly name: string;
  /** The rail's avatar ("JP"). */
  readonly initials: string;
  readonly isAdmin: boolean;
}

export interface ShellTournament {
  readonly name: string;
  readonly slug: string;
}

/** Which conditional entries show (sportbet's session navShow* flags). */
export interface ShellNav {
  readonly survival: boolean;
  readonly summary: boolean;
  readonly survivalSummary: boolean;
}

/** What is outstanding behind each badged entry; 0 hides the badge. */
export interface ShellBadges {
  readonly results: number;
  readonly standings: number;
  readonly survival: number;
  readonly invites: number;
}

export type BadgeKind = keyof ShellBadges;

export interface ShellLeague {
  readonly id: number;
  readonly name: string;
}

/** The player's leagues in this tournament: the current one by name (sportbet shows "Lyga" when none is), and the others. */
export interface ShellLeagues {
  readonly current: string;
  readonly others: readonly ShellLeague[];
}

/** A visitor who is not signed in: everything off. */
export function guestView(): ShellView {
  return {
    player: null,
    tournament: null,
    nav: { survival: false, summary: false, survivalSummary: false },
    badges: { results: 0, standings: 0, survival: 0, invites: 0 },
    leagues: null,
  };
}
```

- [ ] **Step 4: The entries**

Create `apps/web/src/components/shell/nav-entries.ts`:

```ts
import type { IconName } from './icon';
import type { BadgeKind, ShellView } from './shell-view';

/** Where an entry is drawn: the desktop rail, the phone's menu panel, the phone's bottom tabs, or the guest phone bar's pills. */
export type NavSurface = 'rail' | 'menu' | 'tabs' | 'pills';

/**
 * The block an entry sits in, as sportbet's rail and phone menu group them
 * (partials/rail, rail-guest, header): `main` is the rail's first block
 * and the menu's "Spėjimai"; `summary` is "Suvestinė"; `league` and
 * `info` follow the rail's separator, and are the menu's "Lyga" and
 * "Informacija".
 */
export type NavGroup = 'main' | 'summary' | 'league' | 'info';

export interface NavEntry {
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly audience: 'guest' | 'player';
  readonly group: NavGroup;
  readonly surfaces: readonly NavSurface[];
  readonly badge?: BadgeKind;
  /** When it shows, besides its audience: e.g. survival only in a tournament with a survival game. */
  readonly shownWhen?: (view: ShellView) => boolean;
}

/**
 * Every navigation entry, in sportbet's order. An entry is listed only once
 * its page exists in this app, so the shell never links to a 404 (spec 4a,
 * "Navigation entries"; nav-entries.test.ts checks every href has a page).
 * Each slice adds its own; "Prisijungti" arrives with 4b.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    label: 'Turnyrai',
    href: '/',
    icon: 'globe2',
    audience: 'guest',
    group: 'main',
    surfaces: ['rail'],
  },
];

/** The entries this view shows on this surface. */
export function entriesFor(
  view: ShellView,
  surface: NavSurface,
  entries: readonly NavEntry[] = NAV_ENTRIES,
): readonly NavEntry[] {
  const audience = view.player === null ? 'guest' : 'player';
  return entries.filter(
    (entry) =>
      entry.audience === audience &&
      entry.surfaces.includes(surface) &&
      (entry.shownWhen?.(view) ?? true),
  );
}

export function inGroup(
  entries: readonly NavEntry[],
  group: NavGroup,
): readonly NavEntry[] {
  return entries.filter((entry) => entry.group === group);
}

const PRIVACY_PATH = '/privacy';

/** The privacy page, once it is listed: the cookie banner links to it (sportbet's partials/cookie-consent). */
export function privacyHref(
  entries: readonly NavEntry[] = NAV_ENTRIES,
): string | null {
  return entries.some(({ href }) => href === PRIVACY_PATH)
    ? PRIVACY_PATH
    : null;
}
```

- [ ] **Step 5: The player shell's other URLs**

Create `apps/web/src/components/shell/shell-paths.ts`:

```ts
// sportbet's URLs the player shell reaches outside the navigation entries
// (routes/web.php and routes/auth.php at 1ac955f). Nothing renders them
// before 4b switches the player shell on; each is served by the slice that
// owns it, at the same URL and method as sportbet.

/** The rail's name link and the menu's "Profilis" (slice 17). */
export const PROFILE_PATH = '/userProfile';

/** "Administravimas" / "Admin", for an admin only (slices 13, 14). */
export const ADMIN_PATH = '/admin';

/** "Keisti turnyrą": leave the tournament the menu is scoped to (slice 5). */
export const TOURNAMENT_EXIT_PATH = '/tournaments/exit';

/** "Atsijungti": a POST, from a hidden form in each place (4b). */
export const SIGN_OUT_PATH = '/logout';

/** A league in the switcher: a POST with `leagueID` (the leagues slice). */
export const LEAGUE_SWITCH_PATH = '/leagues/switch';
```

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/shell-view.test.ts src/components/shell/nav-entries.test.ts`
Expected: PASS, `10 passed (10)` (1 + 9).

- [ ] **Step 7: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `9 passed (9)` files, `40 passed (40)` tests.

Commit message:

```
feat(web): ShellView, the guest view and the navigation entries (#15)

One typed view tells the shell everything; entries say their audience,
block, surfaces, badge and flag, and are listed only once their page
exists - Turnyrai alone in 4a.
```

---

### Task 5 (web-dev): The current-page link, the badge and the shared classes

**Files:**
- Modify: `apps/web/src/test-setup.ts`
- Create: `apps/web/src/components/shell/nav-styles.ts`, `apps/web/src/components/shell/nav-link.tsx`, `apps/web/src/components/shell/nav-badge.tsx`
- Test: `apps/web/src/components/shell/nav-link.test.tsx`, `apps/web/src/components/shell/nav-badge.test.tsx`

- [ ] **Step 1: Every component test is on `/` unless it says otherwise**

Replace the whole of `apps/web/src/test-setup.ts`:

```ts
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The shell's links ask the router which page is current (nav-link.tsx).
// Every component test is on '/' unless it says otherwise with
// vi.mocked(usePathname).mockReturnValueOnce(...).
vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/') }));

afterEach(cleanup);
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/components/shell/nav-link.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { expect, it, vi } from 'vitest';
import { NavLink } from './nav-link';

const CLASSES = { base: 'base', idle: 'idle', current: 'current' };

it('marks the link to the current page, with its current classes only', () => {
  render(
    <NavLink href="/" {...CLASSES}>
      Turnyrai
    </NavLink>,
  );
  const link = screen.getByRole('link', { name: 'Turnyrai' });
  expect(link.getAttribute('href')).toBe('/');
  expect(link.getAttribute('aria-current')).toBe('page');
  expect(link.className).toBe('base current');
});

it('leaves a link to another page idle', () => {
  vi.mocked(usePathname).mockReturnValueOnce('/tournament/euroleague-2026-27');
  render(
    <NavLink href="/" {...CLASSES}>
      Turnyrai
    </NavLink>,
  );
  const link = screen.getByRole('link', { name: 'Turnyrai' });
  expect(link.getAttribute('aria-current')).toBeNull();
  expect(link.className).toBe('base idle');
});
```

Create `apps/web/src/components/shell/nav-badge.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavBadge } from './nav-badge';
import type { BadgeKind } from './shell-view';

// sportbet's NavPredictionBadgeTest, for the markup: the badge is always
// rendered, hidden when there is nothing to do, addressed by data-missing,
// and carries its sentence.

const badgeOf = (container: HTMLElement, kind: BadgeKind) =>
  container.querySelector(`[data-missing="${kind}"]`);

describe('NavBadge', () => {
  it('is rendered but hidden when there is nothing to do', () => {
    const { container } = render(
      <NavBadge kind="results" count={0} placement="rail" />,
    );
    expect(badgeOf(container, 'results')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows a mark when there is something to do', () => {
    const { container } = render(
      <NavBadge kind="results" count={2} placement="rail" />,
    );
    const badge = badgeOf(container, 'results');
    expect(badge?.hasAttribute('hidden')).toBe(false);
    expect(badge?.textContent).toBe('!');
  });

  it.each([
    ['results', 'Pateikti ne visi dienos rungtynių spėjimai.'],
    ['standings', 'Pateikti ne visi eigos spėjimai.'],
    ['survival', 'Vis dar nepasirinkote komandos Išlikimo žaidime.'],
  ] as const)('carries the %s sentence', (kind, sentence) => {
    render(<NavBadge kind={kind} count={1} placement="rail" />);
    expect(screen.getByRole('img', { name: sentence })).toBeDefined();
  });

  it('counts the pending invites in its sentence', () => {
    render(<NavBadge kind="invites" count={3} placement="menu" />);
    expect(
      screen.getByRole('img', { name: 'Nepatvirtinti kvietimai į lygas: 3' }),
    ).toBeDefined();
  });

  it('shows its sentence as a tip on hover, outside the navigation', () => {
    render(
      <nav>
        <NavBadge kind="standings" count={1} placement="tab" />
      </nav>,
    );
    const badge = screen.getByRole('img', {
      name: 'Pateikti ne visi eigos spėjimai.',
    });

    fireEvent.mouseEnter(badge);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Pateikti ne visi eigos spėjimai.');
    expect(tip.parentElement).toBe(document.body);

    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/nav-link.test.tsx src/components/shell/nav-badge.test.tsx`
Expected: FAIL - `Failed to resolve import "./nav-link"` and `"./nav-badge"`.

- [ ] **Step 4: The shared classes**

Create `apps/web/src/components/shell/nav-styles.ts`:

```ts
// Class lists more than one shell part draws, transcribed from sportbet's
// public/css/custom.css at 1ac955f (each names its rule). A link's `idle`
// and `current` lists are applied one or the other (nav-link.tsx), never
// layered, so no two utilities compete for one property.

/** .sb-rail with d-none d-lg-flex: the desktop rail, from 992px. */
export const RAIL =
  'sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-rail-line bg-rail py-[14px] lg:flex';

/** .sb-rail-link; `caps` is every rail link but the player's own name (.sb-rail-link--you). */
export const RAIL_LINK = {
  base: 'flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-[0.92rem] font-semibold no-underline',
  caps: 'tracking-[0.04em] uppercase',
  idle: 'border-transparent text-rail-dim hover:bg-rail-row hover:text-on-rail',
  current: 'border-rail-accent bg-rail-row text-on-rail',
};

/** .sb-rail-label */
export const RAIL_LABEL =
  'px-4 pb-[5px] text-[0.7rem] tracking-[0.16em] text-rail-dim uppercase';

/** .sb-rail-sep */
export const RAIL_SEP = 'mx-4 my-2.5 h-px bg-rail-line';

/** .sb-rail-card: the tournament and league card, in the rail and the phone menu. */
export const RAIL_CARD =
  'rounded-sm border border-rail-line bg-rail-raised px-2.5 py-[9px]';

/** .sb-rail-card-label */
export const RAIL_CARD_LABEL =
  'mb-[3px] block text-[0.62rem] font-bold tracking-[0.14em] text-rail-dim uppercase';

/** .sb-mobile-collapse .sb-nav-link: a link in the phone menu. */
export const MENU_LINK = {
  base: 'inline-flex items-center gap-1 rounded-[6px] px-2.5 py-[7px] text-[0.82rem] font-semibold whitespace-nowrap text-on-rail no-underline transition-[color,background-color] duration-150',
  idle: 'hover:bg-rail-wash-md',
  current: 'bg-rail-wash-lg',
};

/** .sb-tab: a bottom tab. */
export const TAB = {
  base: 'relative flex flex-1 flex-col items-center gap-0.5 py-1 no-underline transition-colors duration-150',
  idle: 'text-rail-dim hover:text-on-rail',
  current: 'text-rail-accent',
};
```

- [ ] **Step 5: The link**

Create `apps/web/src/components/shell/nav-link.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A navigation link that knows whether it leads to the current page
 * (sportbet's `active`), which only the browser's address can tell: the
 * shell sits in the root layout, which neither knows the path nor
 * re-renders on navigation. `idle` and `current` are separate class lists,
 * applied one or the other.
 */
export function NavLink({
  href,
  base,
  idle,
  current,
  children,
}: {
  href: string;
  base: string;
  idle: string;
  current: string;
  children: ReactNode;
}) {
  const isCurrent = usePathname() === href;
  return (
    <Link
      href={href}
      className={`${base} ${isCurrent ? current : idle}`}
      aria-current={isCurrent ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 6: The badge**

Create `apps/web/src/components/shell/nav-badge.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { BadgeKind } from './shell-view';

/** Where the badge sits, and so which side its tip opens on (sportbet's data-bs-placement: right, left, top). */
export type BadgePlacement = 'rail' | 'menu' | 'tab';

/** sportbet's sentences (lang/lt.json), one per badge. */
export function badgeLabel(kind: BadgeKind, count: number): string {
  switch (kind) {
    case 'results':
      return 'Pateikti ne visi dienos rungtynių spėjimai.';
    case 'standings':
      return 'Pateikti ne visi eigos spėjimai.';
    case 'survival':
      return 'Vis dar nepasirinkote komandos Išlikimo žaidime.';
    case 'invites':
      return `Nepatvirtinti kvietimai į lygas: ${String(count)}`;
  }
}

// .sb-nav-badge, and where each navigation puts it (.sb-rail-link
// .sb-nav-badge, .sb-tab .sb-nav-badge).
const BADGE =
  'inline-grid flex-none place-items-center rounded-full bg-bad leading-none font-extrabold tracking-normal text-on-state normal-case';
const AT: Record<BadgePlacement, string> = {
  rail: 'ml-auto size-[17px] text-[0.68rem] shadow-[0_0_0_3px_var(--color-bad-tint)]',
  menu: 'size-[17px] text-[0.68rem] shadow-[0_0_0_3px_var(--color-bad-tint)]',
  tab: 'absolute top-0 left-1/2 size-[14px] translate-x-[6px] -translate-y-[3px] text-[0.58rem] shadow-[0_0_0_2px_var(--color-rail)]',
};

// Bootstrap 5.0's tooltip, which sportbet never re-skinned: near-black at
// 90%, white text, 200px wide at most.
const TIP =
  'pointer-events-none fixed z-[1080] max-w-[200px] rounded-sm bg-ink px-2 py-1 text-center text-[0.875rem] leading-normal font-normal tracking-normal text-on-ink normal-case opacity-90';
const TIP_SHIFT: Record<BadgePlacement, string> = {
  rail: '-translate-y-1/2',
  menu: '-translate-x-full -translate-y-1/2',
  tab: '-translate-x-1/2 -translate-y-full',
};
const GAP = 6;

interface TipAt {
  readonly left: number;
  readonly top: number;
}

function tipAt(box: DOMRect, placement: BadgePlacement): TipAt {
  switch (placement) {
    case 'rail':
      return { left: box.right + GAP, top: box.top + box.height / 2 };
    case 'menu':
      return { left: box.left - GAP, top: box.top + box.height / 2 };
    case 'tab':
      return { left: box.left + box.width / 2, top: box.top - GAP };
  }
}

/**
 * The outstanding-prediction mark (sportbet issue 163): always rendered,
 * `hidden` when there is nothing to do (issue 166), addressed by
 * `data-missing`. Its sentence is its accessible name and, on hover, a tip
 * drawn into <body> - both navigations clip their overflow, which is why
 * sportbet's tooltip had data-bs-container="body".
 */
export function NavBadge({
  kind,
  count,
  placement,
}: {
  kind: BadgeKind;
  count: number;
  placement: BadgePlacement;
}) {
  const [tip, setTip] = useState<TipAt | null>(null);
  const label = badgeLabel(kind, count);
  return (
    <>
      <span
        className={`${BADGE} ${AT[placement]}`}
        data-missing={kind}
        hidden={count === 0}
        role="img"
        aria-label={label}
        onMouseEnter={(event) => {
          setTip(tipAt(event.currentTarget.getBoundingClientRect(), placement));
        }}
        onMouseLeave={() => {
          setTip(null);
        }}
      >
        !
      </span>
      {tip === null
        ? null
        : createPortal(
            <span
              role="tooltip"
              className={`${TIP} ${TIP_SHIFT[placement]}`}
              style={{ left: tip.left, top: tip.top }}
            >
              {label}
            </span>,
            document.body,
          )}
    </>
  );
}
```

- [ ] **Step 7: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/nav-link.test.tsx src/components/shell/nav-badge.test.tsx`
Expected: PASS, `9 passed (9)` (2 + 7).

- [ ] **Step 8: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `11 passed (11)` files, `49 passed (49)` tests.

Commit message:

```
feat(web): the current-page link and the navigation badge (#15)

NavLink marks the current page from the address; NavBadge is always
rendered, hidden at 0, addressed by data-missing, and shows sportbet's
sentence as a tip drawn into <body>.
```

---

### Task 6 (web-dev): The league switcher

**Files:**
- Create: `apps/web/src/components/shell/league-switcher.tsx`
- Test: `apps/web/src/components/shell/league-switcher.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/shell/league-switcher.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueSwitcher } from './league-switcher';
import type { ShellLeagues } from './shell-view';

const LEAGUES: ShellLeagues = {
  current: 'Vieša',
  others: [
    { id: 7, name: 'Draugai' },
    { id: 9, name: 'Darbas' },
  ],
};

const toggle = () => screen.getByRole('button', { name: 'Vieša' });

describe('LeagueSwitcher in the rail', () => {
  it('shows the current league, closed', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('opens on a click, listing every league with the current one ticked', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const current = screen.getByText('Vieša', {
      selector: '[aria-current="true"]',
    });
    expect(current.querySelector('[data-icon="check2"]')).not.toBeNull();
  });

  it("switches by posting the league's id to /leagues/switch", () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    const button = screen.getByRole('button', { name: 'Draugai' });
    expect(button.getAttribute('type')).toBe('submit');
    const form = button.closest('form');
    expect(form?.getAttribute('action')).toBe('/leagues/switch');
    expect(form?.getAttribute('method')).toBe('post');
    expect(
      form?.querySelector('input[name="leagueID"]')?.getAttribute('value'),
    ).toBe('7');
  });

  it('closes on Escape', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('closes on a click outside it', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    fireEvent.click(document.body);
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('LeagueSwitcher as a bottom tab', () => {
  it('drops up the other leagues only, under a trophy', () => {
    const { container } = render(
      <LeagueSwitcher leagues={LEAGUES} variant="tab" />,
    );
    expect(container.querySelector('[data-icon="trophy"]')).not.toBeNull();
    fireEvent.click(toggle());
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Draugai' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Darbas' })).toBeDefined();
    expect(screen.queryByText('Vieša', { selector: 'li *' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/league-switcher.test.tsx`
Expected: FAIL - `Failed to resolve import "./league-switcher"`.

- [ ] **Step 3: The switcher**

Create `apps/web/src/components/shell/league-switcher.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { TAB } from './nav-styles';
import { LEAGUE_SWITCH_PATH } from './shell-paths';
import type { ShellLeague, ShellLeagues } from './shell-view';

// Bootstrap 5.0's .dropdown-menu and .dropdown-item as sportbet re-skins
// them (custom.css :265-270).
const MENU =
  'absolute right-0 z-[1000] list-none rounded-sm border border-border bg-card py-2';
const ITEM = 'block w-full px-4 py-1 text-left text-base whitespace-nowrap';
const ITEM_IDLE =
  'cursor-pointer border-none bg-transparent text-text hover:bg-surface-2';
const ITEM_CURRENT = 'bg-accent text-on-accent';

/**
 * The player's leagues in this tournament, to switch between: in the
 * rail's card, every league with the current one ticked (sportbet's
 * partials/league-switcher), or as the phone's last bottom tab, a drop-up
 * of the others (partials/bottom-nav). Opens on a click; closes on a click
 * outside it or Escape.
 */
export function LeagueSwitcher({
  leagues,
  variant,
}: {
  leagues: ShellLeagues;
  variant: 'rail' | 'tab';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        root.current?.contains(event.target) !== true
      )
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen(!open);
  };

  if (variant === 'tab') {
    return (
      <div ref={root} className="relative flex flex-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className={`${TAB.base} ${TAB.idle} cursor-pointer border-none bg-transparent`}
        >
          <span className="text-[1.2rem] leading-none">
            <Icon name="trophy" />
          </span>
          <span className="max-w-[60px] truncate text-[0.62rem]">
            {leagues.current}
          </span>
        </button>
        <ul hidden={!open} className={`${MENU} bottom-full mb-1 min-w-[10rem]`}>
          {leagues.others.map((league) => (
            <li key={league.id}>
              <SwitchTo league={league} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="block max-w-full cursor-pointer truncate rounded-sm border-none bg-transparent py-1 pr-2.5 text-left text-[0.82rem] font-semibold text-on-rail hover:bg-rail-wash-md"
      >
        {leagues.current}
      </button>
      <ul
        hidden={!open}
        className={`${MENU} top-full mt-0.5 max-w-[212px] min-w-[180px]`}
      >
        <li>
          <span aria-current="true" className={`${ITEM} ${ITEM_CURRENT}`}>
            <span className="mr-1">
              <Icon name="check2" />
            </span>
            {leagues.current}
          </span>
        </li>
        {leagues.others.map((league) => (
          <li key={league.id}>
            <SwitchTo league={league} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwitchTo({ league }: { league: ShellLeague }) {
  return (
    <form method="post" action={LEAGUE_SWITCH_PATH}>
      <input type="hidden" name="leagueID" value={String(league.id)} />
      <button type="submit" className={`${ITEM} ${ITEM_IDLE}`}>
        {league.name}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/league-switcher.test.tsx`
Expected: PASS, `6 passed (6)`.

- [ ] **Step 5: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `12 passed (12)` files, `55 passed (55)` tests.

Commit message:

```
feat(web): the league switcher, for the rail card and the bottom tab (#15)

Every league with the current one ticked in the rail, the others as a
drop-up tab; each posts leagueID to sportbet's /leagues/switch.
```

---

### Task 7 (web-dev): The rail's tournament card and account section

**Files:**
- Create: `apps/web/src/components/shell/rail-tournament.tsx`, `apps/web/src/components/shell/rail-account.tsx`
- Test: `apps/web/src/components/shell/rail-tournament.test.tsx`, `apps/web/src/components/shell/rail-account.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/shell/rail-tournament.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RailTournament } from './rail-tournament';

it('names the tournament in full, with the way out of it', () => {
  render(
    <RailTournament
      tournament={{ name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' }}
    />,
  );
  expect(screen.getByText('Turnyras')).toBeDefined();
  expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
  ).toBe('/tournaments/exit');
});
```

Create `apps/web/src/components/shell/rail-account.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { JONAS } from '../../../tests/support/shell-views';
import { RailAccount } from './rail-account';

// sportbet's RailNavigationTest, the account footer (issue 135): a labelled
// section of plain links, its own sign-out form, admin only for an admin.

it("is a labelled section with the player's profile, under their initials", () => {
  render(<RailAccount player={JONAS} />);
  expect(screen.getByText('Paskyra')).toBeDefined();
  const profile = screen.getByRole('link', { name: 'Profilis: Jonas P.' });
  expect(profile.getAttribute('href')).toBe('/userProfile');
  expect(profile.textContent).toContain('JP');
});

it('signs out through its own form', () => {
  render(<RailAccount player={JONAS} />);
  const signOut = screen.getByRole('button', { name: 'Atsijungti' });
  expect(signOut.getAttribute('type')).toBe('submit');
  expect(signOut.getAttribute('form')).toBe('logout-form-rail');
  const form = document.getElementById('logout-form-rail');
  expect(form?.getAttribute('action')).toBe('/logout');
  expect(form?.getAttribute('method')).toBe('post');
});

it('offers administration to an admin only', () => {
  const { unmount } = render(<RailAccount player={JONAS} />);
  expect(screen.queryByRole('link', { name: 'Administravimas' })).toBeNull();
  unmount();

  render(<RailAccount player={{ ...JONAS, isAdmin: true }} />);
  expect(
    screen.getByRole('link', { name: 'Administravimas' }).getAttribute('href'),
  ).toBe('/admin');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/rail-tournament.test.tsx src/components/shell/rail-account.test.tsx`
Expected: FAIL - `Failed to resolve import "./rail-tournament"` and `"./rail-account"`.

- [ ] **Step 3: The tournament card's content**

Create `apps/web/src/components/shell/rail-tournament.tsx`:

```tsx
import { Icon } from './icon';
import { RAIL_CARD_LABEL } from './nav-styles';
import { TOURNAMENT_EXIT_PATH } from './shell-paths';
import type { ShellTournament } from './shell-view';

/**
 * The tournament the menu is scoped to: label, full name - wrapped, never
 * clipped (sportbet #69) - and the way out of it. Drawn inside a rail card
 * by the rail and by the phone menu (sportbet's partials/rail-tournament).
 * The way out is a plain link: a GET that changes the session must never
 * be prefetched, as next/link would.
 */
export function RailTournament({
  tournament,
}: {
  tournament: ShellTournament;
}) {
  return (
    <>
      <span className={RAIL_CARD_LABEL}>Turnyras</span>
      <span className="block text-[0.82rem] leading-[1.3] font-bold wrap-anywhere text-on-rail">
        {tournament.name}
      </span>
      <a
        href={TOURNAMENT_EXIT_PATH}
        className="mt-[7px] inline-flex items-center gap-[5px] rounded-sm text-[0.72rem] font-bold tracking-[0.04em] text-rail-accent no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="arrow-left-right" /> Keisti turnyrą
      </a>
    </>
  );
}
```

- [ ] **Step 4: The account section**

Create `apps/web/src/components/shell/rail-account.tsx`:

```tsx
import { Icon } from './icon';
import { NavLink } from './nav-link';
import { RAIL_LABEL, RAIL_LINK } from './nav-styles';
import { ADMIN_PATH, PROFILE_PATH, SIGN_OUT_PATH } from './shell-paths';
import type { ShellPlayer } from './shell-view';

const SIGN_OUT_FORM = 'logout-form-rail';

/**
 * The signed-in rail's foot (sportbet's partials/rail-account, issue 135):
 * a labelled "Paskyra" section of plain links - the player's own name,
 * administration for an admin, and sign-out, which submits this rail's own
 * hidden form (a POST, served by 4b).
 */
export function RailAccount({ player }: { player: ShellPlayer }) {
  return (
    <>
      <div className="mt-auto border-t border-rail-line pt-3">
        <div className={RAIL_LABEL}>Paskyra</div>
        <nav className="flex flex-col">
          <NavLink
            href={PROFILE_PATH}
            base={`${RAIL_LINK.base} tracking-normal normal-case`}
            idle={RAIL_LINK.idle}
            current={RAIL_LINK.current}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[0.6rem] font-bold tracking-[-0.2px] text-on-accent"
            >
              {player.initials}
            </span>
            <span className="sr-only">{'Profilis: '}</span>
            <span className="truncate">{player.name}</span>
          </NavLink>
          {player.isAdmin ? (
            <NavLink
              href={ADMIN_PATH}
              base={`${RAIL_LINK.base} ${RAIL_LINK.caps}`}
              idle={RAIL_LINK.idle}
              current={RAIL_LINK.current}
            >
              <Icon name="database-gear" /> Administravimas
            </NavLink>
          ) : null}
          <button
            type="submit"
            form={SIGN_OUT_FORM}
            className={`${RAIL_LINK.base} ${RAIL_LINK.caps} ${RAIL_LINK.idle} w-full cursor-pointer bg-transparent text-left`}
          >
            <Icon name="box-arrow-right" /> Atsijungti
          </button>
        </nav>
      </div>
      <form id={SIGN_OUT_FORM} action={SIGN_OUT_PATH} method="post" hidden />
    </>
  );
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/rail-tournament.test.tsx src/components/shell/rail-account.test.tsx`
Expected: PASS, `4 passed (4)` (1 + 3).

- [ ] **Step 6: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `14 passed (14)` files, `59 passed (59)` tests.

Commit message:

```
feat(web): the rail's tournament card and account section (#15)

The tournament named in full with "Keisti turnyrą"; "Paskyra" with the
player's name, administration for an admin, and sign-out through the
rail's own form.
```

---

### Task 8 (web-dev): The brands and both rails

**Files:**
- Create: `apps/web/src/components/shell/brand.tsx`, `apps/web/src/components/shell/rail-nav.tsx`, `apps/web/src/components/shell/guest-rail.tsx`, `apps/web/src/components/shell/player-rail.tsx`
- Test: `apps/web/src/components/shell/brand.test.tsx`, `apps/web/src/components/shell/rail-nav.test.tsx`, `apps/web/src/components/shell/guest-rail.test.tsx`, `apps/web/src/components/shell/player-rail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/shell/brand.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PhoneBrand, RailBrand } from './brand';

it("the rail's brand leads to the tournaments, with the app's own logo", () => {
  const { container } = render(<RailBrand />);
  expect(
    screen.getByRole('link', { name: 'SportBet' }).getAttribute('href'),
  ).toBe('/');
  expect(container.querySelector('img')?.getAttribute('src')).toContain(
    '%2Fimg%2Flogo.png',
  );
});

it("the phone's brand names itself in the logo's text alternative", () => {
  render(<PhoneBrand />);
  const logo = screen.getByRole('img', { name: 'SportBet' });
  expect(logo.closest('a')?.getAttribute('href')).toBe('/');
});
```

Create `apps/web/src/components/shell/rail-nav.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { NavEntry } from './nav-entries';
import { RailNav } from './rail-nav';
import { guestView } from './shell-view';

const ENTRIES: readonly NavEntry[] = [
  {
    label: 'Turnyrai',
    href: '/',
    icon: 'globe2',
    audience: 'guest',
    group: 'main',
    surfaces: ['rail'],
  },
  {
    label: 'Lygos',
    href: '/leagues',
    icon: 'trophy',
    audience: 'player',
    group: 'league',
    surfaces: ['rail'],
    badge: 'invites',
  },
];

it('links each entry under its icon, the current page marked', () => {
  render(<RailNav entries={ENTRIES} badges={guestView().badges} />);
  const turnyrai = screen.getByRole('link', { name: 'Turnyrai' });
  expect(turnyrai.getAttribute('href')).toBe('/');
  expect(turnyrai.getAttribute('aria-current')).toBe('page');
  expect(turnyrai.querySelector('[data-icon="globe2"]')).not.toBeNull();
  expect(
    screen.getByRole('link', { name: 'Lygos' }).getAttribute('aria-current'),
  ).toBeNull();
});

it("gives a badged entry its badge, shown by the view's count", () => {
  const { container } = render(
    <RailNav
      entries={ENTRIES}
      badges={{ ...guestView().badges, invites: 2 }}
    />,
  );
  const badge = container.querySelector('[data-missing="invites"]');
  expect(badge?.closest('a')?.getAttribute('href')).toBe('/leagues');
  expect(badge?.hasAttribute('hidden')).toBe(false);
});
```

Create `apps/web/src/components/shell/guest-rail.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GuestRail } from './guest-rail';
import { NAV_ENTRIES, type NavEntry } from './nav-entries';
import { guestView } from './shell-view';

// sportbet's RailNavigationTest and ShellNoRailLayoutTest, for a guest.

const PRIVACY: NavEntry = {
  label: 'Privatumas',
  href: '/privacy',
  icon: 'globe2',
  audience: 'guest',
  group: 'info',
  surfaces: ['rail'],
};

it('is the rail, under the brand', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  const rail = screen.getByTestId('rail');
  expect(rail.tagName).toBe('ASIDE');
  expect(
    within(rail).getByRole('link', { name: 'SportBet' }).getAttribute('href'),
  ).toBe('/');
});

it('lists the guest entries', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  expect(
    screen.getByRole('link', { name: 'Turnyrai' }).getAttribute('href'),
  ).toBe('/');
});

it('has no account section and nothing to sign out of', () => {
  render(<GuestRail view={guestView()} entries={NAV_ENTRIES} />);
  expect(screen.queryByText('Paskyra')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Atsijungti' })).toBeNull();
});

it('puts the information entries after a separator, below the main block', () => {
  render(<GuestRail view={guestView()} entries={[...NAV_ENTRIES, PRIVACY]} />);
  const navs = screen.getAllByRole('navigation');
  expect(navs).toHaveLength(2);
  const [main, info] = navs;
  expect(main?.textContent?.trim()).toBe('Turnyrai');
  expect(info?.textContent?.trim()).toBe('Privatumas');
});
```

Create `apps/web/src/components/shell/player-rail.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JONAS, playerView } from '../../../tests/support/shell-views';
import type { NavEntry } from './nav-entries';
import { PlayerRail } from './player-rail';
import { guestView, type ShellView } from './shell-view';

// sportbet's RailNavigationTest and NavPredictionBadgeTest, for a player.
// The entries are what later slices will list; the filtering by flag is
// entriesFor's (nav-entries.test.ts).

const entry = (
  label: string,
  href: string,
  group: NavEntry['group'],
  badge?: NavEntry['badge'],
): NavEntry => ({
  label,
  href,
  icon: 'trophy',
  audience: 'player',
  group,
  surfaces: ['rail'],
  ...(badge === undefined ? {} : { badge }),
});

const ENTRIES: readonly NavEntry[] = [
  entry('Spėjimai', '/results', 'main', 'results'),
  entry('Prognozės', '/summary/results', 'summary'),
  entry('Lygos', '/leagues', 'league', 'invites'),
  entry('Taisyklės', '/rules', 'info'),
];

function renderRail(
  view: ShellView = playerView(),
  entries: readonly NavEntry[] = ENTRIES,
) {
  return render(<PlayerRail view={view} player={JONAS} entries={entries} />);
}

const follows = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

describe('PlayerRail', () => {
  it('names the tournament above the navigation, with the way out (#69)', () => {
    renderRail();
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByText('Eurolyga 2026-27')).toBeDefined();
    expect(
      within(card)
        .getByRole('link', { name: 'Keisti turnyrą' })
        .getAttribute('href'),
    ).toBe('/tournaments/exit');
    expect(follows(card, screen.getByRole('link', { name: 'Spėjimai' }))).toBe(
      true,
    );
  });

  it("offers the player's leagues in the same card", () => {
    renderRail();
    const card = screen.getByTestId('rail-context');
    expect(within(card).getByText('Lyga')).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Vieša' })).toBeDefined();
  });

  it('has no card for a player with no tournament and no league', () => {
    renderRail(playerView({ tournament: null, leagues: null }));
    expect(screen.queryByTestId('rail-context')).toBeNull();
  });

  it("lists its entries in sportbet's blocks, the summary under its label", () => {
    renderRail();
    const label = screen.getByText('Suvestinė');
    const link = (name: string) => screen.getByRole('link', { name });
    expect(follows(link('Spėjimai'), label)).toBe(true);
    expect(follows(label, link('Prognozės'))).toBe(true);
    expect(follows(link('Prognozės'), link('Lygos'))).toBe(true);
    expect(follows(link('Lygos'), link('Taisyklės'))).toBe(true);
  });

  it('has no summary label when there is no summary to show', () => {
    renderRail(
      playerView(),
      ENTRIES.filter(({ group }) => group !== 'summary'),
    );
    expect(screen.queryByText('Suvestinė')).toBeNull();
  });

  it('badges only the entry with something to do', () => {
    const { container } = renderRail(
      playerView({ badges: { ...guestView().badges, results: 2 } }),
    );
    expect(
      container
        .querySelector('[data-missing="results"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(
      container
        .querySelector('[data-missing="invites"]')
        ?.hasAttribute('hidden'),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/brand.test.tsx src/components/shell/rail-nav.test.tsx src/components/shell/guest-rail.test.tsx src/components/shell/player-rail.test.tsx`
Expected: FAIL - `Failed to resolve import "./brand"`, `"./rail-nav"`, `"./guest-rail"`, `"./player-rail"`.

- [ ] **Step 3: The brands**

Create `apps/web/src/components/shell/brand.tsx`:

```tsx
import Image from 'next/image';
import Link from 'next/link';

// sportbet's mark (public/img/logo.png, 1024 x 1024 and 1.5 MB), served
// resized by next/image from the app itself.
const LOGO = { src: '/img/logo.png', width: 1024, height: 1024 };

/**
 * The brand at the top of the rail (.sb-rail-brand). Both brands lead to
 * the tournaments: sportbet sends a signed-in player to /main, which
 * arrives with its own slice. The hover colour is sportbet's base a:hover,
 * which its rail brand never overrode.
 */
export function RailBrand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 px-4 pb-4 text-[1.22rem] font-extrabold tracking-[0.02em] text-on-rail uppercase no-underline hover:text-accent-hover"
    >
      <Image
        src={LOGO.src}
        width={LOGO.width}
        height={LOGO.height}
        sizes="26px"
        alt=""
        className="h-[26px] w-auto"
      />
      <span>
        Sport<i className="text-rail-accent not-italic">Bet</i>
      </span>
    </Link>
  );
}

/** The brand on the phone bar (.sb-topnav .sb-brand): a smaller mark below 576px, no wordmark below 360px (sportbet issue 130). */
export function PhoneBrand() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-1.5 text-[1.1rem] font-extrabold tracking-[-0.3px] text-on-rail no-underline"
    >
      <Image
        src={LOGO.src}
        width={LOGO.width}
        height={LOGO.height}
        sizes="32px"
        alt="SportBet"
        className="h-8 w-auto max-sm:h-7"
      />
      <span className="max-[360px]:hidden">
        Sport<span className="text-rail-accent">Bet</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: A block of rail links**

Create `apps/web/src/components/shell/rail-nav.tsx`:

```tsx
import { Icon } from './icon';
import { NavBadge } from './nav-badge';
import type { NavEntry } from './nav-entries';
import { NavLink } from './nav-link';
import { RAIL_LINK } from './nav-styles';
import type { ShellBadges } from './shell-view';

/** One block of rail links (.sb-rail-nav), each with its badge if it has one. */
export function RailNav({
  entries,
  badges,
}: {
  entries: readonly NavEntry[];
  badges: ShellBadges;
}) {
  return (
    <nav className="flex flex-col">
      {entries.map((entry) => (
        <NavLink
          key={entry.href}
          href={entry.href}
          base={`${RAIL_LINK.base} ${RAIL_LINK.caps}`}
          idle={RAIL_LINK.idle}
          current={RAIL_LINK.current}
        >
          <Icon name={entry.icon} /> {entry.label}
          {entry.badge === undefined ? null : (
            <NavBadge
              kind={entry.badge}
              count={badges[entry.badge]}
              placement="rail"
            />
          )}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: The guest rail**

Create `apps/web/src/components/shell/guest-rail.tsx`:

```tsx
import { RailBrand } from './brand';
import { inGroup, type NavEntry } from './nav-entries';
import { RAIL, RAIL_SEP } from './nav-styles';
import { RailNav } from './rail-nav';
import type { ShellView } from './shell-view';

/**
 * A guest's rail (sportbet's partials/rail-guest): the brand, the public
 * entries, and after a separator the information pages. sportbet's
 * language switch is gone (decision 13); its "Prisijungti" foot arrives
 * with 4b.
 */
export function GuestRail({
  view,
  entries,
}: {
  view: ShellView;
  entries: readonly NavEntry[];
}) {
  const info = inGroup(entries, 'info');
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand />
      <RailNav entries={inGroup(entries, 'main')} badges={view.badges} />
      {info.length === 0 ? null : (
        <>
          <div className={RAIL_SEP} />
          <RailNav entries={info} badges={view.badges} />
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 6: The player rail**

Create `apps/web/src/components/shell/player-rail.tsx`:

```tsx
import { RailBrand } from './brand';
import { LeagueSwitcher } from './league-switcher';
import { inGroup, type NavEntry } from './nav-entries';
import {
  RAIL,
  RAIL_CARD,
  RAIL_CARD_LABEL,
  RAIL_LABEL,
  RAIL_SEP,
} from './nav-styles';
import { RailAccount } from './rail-account';
import { RailNav } from './rail-nav';
import { RailTournament } from './rail-tournament';
import type { ShellPlayer, ShellView } from './shell-view';

/**
 * A signed-in player's rail (sportbet's partials/rail): the brand; the
 * card naming the tournament and league the menu is scoped to, above the
 * menu it scopes (#69); the main block; "Suvestinė" when there is a
 * summary; the league and information entries after a separator; and the
 * account section at the foot.
 */
export function PlayerRail({
  view,
  player,
  entries,
}: {
  view: ShellView;
  player: ShellPlayer;
  entries: readonly NavEntry[];
}) {
  const { tournament, leagues } = view;
  const summary = inGroup(entries, 'summary');
  const rest = [...inGroup(entries, 'league'), ...inGroup(entries, 'info')];
  return (
    <aside data-testid="rail" className={RAIL}>
      <RailBrand />
      {tournament === null && leagues === null ? null : (
        <div
          data-testid="rail-context"
          className="mb-2 border-b border-rail-line px-4 pb-3.5"
        >
          <div className={RAIL_CARD}>
            {tournament === null ? null : (
              <RailTournament tournament={tournament} />
            )}
            {leagues === null ? null : (
              <div
                className={
                  tournament === null
                    ? ''
                    : 'mt-[9px] border-t border-rail-line pt-[9px]'
                }
              >
                <span className={RAIL_CARD_LABEL}>Lyga</span>
                <LeagueSwitcher leagues={leagues} variant="rail" />
              </div>
            )}
          </div>
        </div>
      )}
      <RailNav entries={inGroup(entries, 'main')} badges={view.badges} />
      {summary.length === 0 ? null : (
        <>
          <div className={RAIL_SEP} />
          <div className={RAIL_LABEL}>Suvestinė</div>
          <RailNav entries={summary} badges={view.badges} />
        </>
      )}
      {rest.length === 0 ? null : (
        <>
          <div className={RAIL_SEP} />
          <RailNav entries={rest} badges={view.badges} />
        </>
      )}
      <RailAccount player={player} />
    </aside>
  );
}
```

- [ ] **Step 7: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/brand.test.tsx src/components/shell/rail-nav.test.tsx src/components/shell/guest-rail.test.tsx src/components/shell/player-rail.test.tsx`
Expected: PASS, `14 passed (14)` (2 + 2 + 4 + 6).

- [ ] **Step 8: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `18 passed (18)` files, `73 passed (73)` tests.

Commit message:

```
feat(web): the guest rail and the player rail (#15)

sportbet's rails from 992px: the brand, the tournament and league card
above the menu, the main block, "Suvestinė", the league and information
block, and the account foot for a player.
```

---

### Task 9 (web-dev): The phone bar and its menu

**Files:**
- Create: `apps/web/src/components/shell/phone-menu.tsx`, `apps/web/src/components/shell/phone-header.tsx`
- Test: `apps/web/src/components/shell/phone-menu.test.tsx`, `apps/web/src/components/shell/phone-header.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/shell/phone-menu.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PhoneMenu } from './phone-menu';

function renderMenu() {
  render(
    <PhoneMenu bar="" brand={<span>SportBet</span>}>
      <a
        href="/elsewhere"
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        Kitur
      </a>
    </PhoneMenu>,
  );
  const button = screen.getByRole('button', { name: 'Atidaryti meniu' });
  const panel = document.getElementById('sbNavMobile');
  return { button, panel };
}

it('starts closed, its toggle naming the panel it opens', () => {
  const { button, panel } = renderMenu();
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(button.getAttribute('aria-controls')).toBe('sbNavMobile');
  expect(panel?.hidden).toBe(true);
});

it('opens and closes on its toggle', () => {
  const { button, panel } = renderMenu();
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(panel?.hidden).toBe(false);
  fireEvent.click(button);
  expect(panel?.hidden).toBe(true);
});

it('closes when a link in it is followed', () => {
  const { button, panel } = renderMenu();
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('link', { name: 'Kitur' }));
  expect(panel?.hidden).toBe(true);
});
```

Create `apps/web/src/components/shell/phone-header.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JONAS, playerView } from '../../../tests/support/shell-views';
import type { NavEntry } from './nav-entries';
import { PhoneHeader } from './phone-header';
import { guestView, type ShellView } from './shell-view';

// sportbet's partials/header: a guest's pills, or a player's menu panel
// with the tournament card and the same blocks as the rail, under the
// menu's own labels.

const PILL: NavEntry = {
  label: 'Jaunimo linija',
  href: '/charity',
  icon: 'globe2',
  audience: 'guest',
  group: 'info',
  surfaces: ['pills'],
};

const menuEntry = (
  label: string,
  href: string,
  group: NavEntry['group'],
  badge?: NavEntry['badge'],
): NavEntry => ({
  label,
  href,
  icon: 'trophy',
  audience: 'player',
  group,
  surfaces: ['menu'],
  ...(badge === undefined ? {} : { badge }),
});

const MENU: readonly NavEntry[] = [
  menuEntry('Rungtynių spėjimai', '/results', 'main', 'results'),
  menuEntry('Prognozės', '/summary/results', 'summary'),
  menuEntry('Taisyklės', '/rules', 'info'),
];

function openMenu(view: ShellView = playerView()) {
  const rendered = render(<PhoneHeader view={view} pills={[]} menu={MENU} />);
  fireEvent.click(screen.getByRole('button', { name: 'Atidaryti meniu' }));
  return rendered;
}

describe("a guest's phone bar", () => {
  it('carries the brand, leading to the tournaments', () => {
    render(<PhoneHeader view={guestView()} pills={[]} menu={[]} />);
    const bar = screen.getByTestId('phone-header');
    expect(
      within(bar)
        .getByRole('img', { name: 'SportBet' })
        .closest('a')
        ?.getAttribute('href'),
    ).toBe('/');
  });

  it('carries its pills, named even where the label is hidden', () => {
    render(<PhoneHeader view={guestView()} pills={[PILL]} menu={[]} />);
    expect(
      screen.getByRole('link', { name: 'Jaunimo linija' }).getAttribute('href'),
    ).toBe('/charity');
  });

  it('has no menu', () => {
    render(<PhoneHeader view={guestView()} pills={[PILL]} menu={[]} />);
    expect(
      screen.queryByRole('button', { name: 'Atidaryti meniu' }),
    ).toBeNull();
  });
});

describe("a player's phone bar", () => {
  it('opens a menu with the tournament card', () => {
    openMenu();
    expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
    ).toBe('/tournaments/exit');
  });

  it("lists the entries under the menu's labels, and no empty block", () => {
    openMenu();
    expect(screen.getByText('Spėjimai')).toBeDefined();
    expect(screen.getByText('Suvestinė')).toBeDefined();
    expect(screen.getByText('Informacija')).toBeDefined();
    expect(screen.queryByText('Lyga')).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Rungtynių spėjimai' })
        .getAttribute('href'),
    ).toBe('/results');
  });

  it('ends with the account: the profile and sign-out through its own form', () => {
    openMenu();
    expect(screen.getByText('Paskyra')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Profilis' }).getAttribute('href'),
    ).toBe('/userProfile');
    expect(
      screen
        .getByRole('button', { name: 'Atsijungti' })
        .getAttribute('form'),
    ).toBe('logout-form-m');
    expect(
      document.getElementById('logout-form-m')?.getAttribute('action'),
    ).toBe('/logout');
  });

  it('offers Admin to an admin only', () => {
    const { unmount } = openMenu();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    unmount();

    openMenu(playerView({ player: { ...JONAS, isAdmin: true } }));
    expect(
      screen.getByRole('link', { name: 'Admin' }).getAttribute('href'),
    ).toBe('/admin');
  });

  it('badges a menu entry with something to do', () => {
    const { container } = openMenu(
      playerView({ badges: { ...guestView().badges, results: 1 } }),
    );
    expect(
      container
        .querySelector('[data-missing="results"]')
        ?.hasAttribute('hidden'),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/phone-menu.test.tsx src/components/shell/phone-header.test.tsx`
Expected: FAIL - `Failed to resolve import "./phone-menu"` and `"./phone-header"`.

- [ ] **Step 3: The menu's toggle and panel**

Create `apps/web/src/components/shell/phone-menu.tsx`:

```tsx
'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './icon';

const PANEL_ID = 'sbNavMobile';

/**
 * The signed-in phone bar with its toggle, and the panel it opens below
 * (sportbet's .sb-toggler and #sbNavMobile collapse). Following a link in
 * the panel closes it, as the page load that followed did on sportbet.
 */
export function PhoneMenu({
  bar,
  brand,
  children,
}: {
  bar: string;
  brand: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a') !== null)
      setOpen(false);
  };
  return (
    <>
      <div className={bar}>
        {brand}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Atidaryti meniu"
            aria-controls={PANEL_ID}
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
            className="cursor-pointer border-none bg-transparent px-1.5 py-1 text-[1.6rem] leading-none text-rail-dim hover:text-on-rail focus:outline-none"
          >
            <Icon name="list" />
          </button>
        </div>
      </div>
      <div
        id={PANEL_ID}
        hidden={!open}
        onClick={closeOnLink}
        className="w-full border-t border-rail-wash-md bg-rail pb-2"
      >
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 4: The phone bar**

Create `apps/web/src/components/shell/phone-header.tsx`:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PhoneBrand } from './brand';
import { Icon } from './icon';
import { NavBadge } from './nav-badge';
import { inGroup, type NavEntry } from './nav-entries';
import { NavLink } from './nav-link';
import { MENU_LINK, RAIL_CARD } from './nav-styles';
import { PhoneMenu } from './phone-menu';
import { RailTournament } from './rail-tournament';
import { ADMIN_PATH, PROFILE_PATH, SIGN_OUT_PATH } from './shell-paths';
import type { ShellPlayer, ShellView } from './shell-view';

/** .sb-topnav, trimmed below 576px (sportbet issue 130). */
const BAR =
  'mx-auto flex h-12 w-full max-w-[1280px] items-center gap-0.5 px-5 max-sm:px-3';

/** .sb-nav-pill.sb-nav-pill--ghost: an icon, its label from 576px. */
const PILL =
  'rounded-full border-2 border-transparent px-5 py-1.5 text-[0.875rem] leading-[1.4] font-medium whitespace-nowrap text-muted no-underline transition-[background-color,color] duration-150 hover:text-accent max-sm:px-3';

const SIGN_OUT_FORM = 'logout-form-m';

/**
 * The phone's top bar, below 992px (sportbet's partials/header, .sb-navbar):
 * a guest gets the brand and their pills; a player gets the brand and the
 * menu.
 */
export function PhoneHeader({
  view,
  pills,
  menu,
}: {
  view: ShellView;
  pills: readonly NavEntry[];
  menu: readonly NavEntry[];
}) {
  const { player } = view;
  return (
    <nav
      data-testid="phone-header"
      className="bg-rail shadow-[0_1px_8px_var(--color-shadow-strong)] lg:hidden"
    >
      {player === null ? (
        <div className={BAR}>
          <PhoneBrand />
          <div className="ml-auto flex items-center gap-1">
            {pills.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                aria-label={entry.label}
                className={PILL}
              >
                <span className="text-[0.75rem]">
                  <Icon name={entry.icon} />
                </span>
                <span className="hidden sm:inline"> {entry.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <PhoneMenu bar={BAR} brand={<PhoneBrand />}>
          <MenuPanel view={view} player={player} entries={menu} />
        </PhoneMenu>
      )}
    </nav>
  );
}

/** The panel's groups, in sportbet's order. */
function MenuPanel({
  view,
  player,
  entries,
}: {
  view: ShellView;
  player: ShellPlayer;
  entries: readonly NavEntry[];
}) {
  return (
    <>
      {view.tournament === null ? null : (
        <MenuGroup>
          <div className={RAIL_CARD}>
            <RailTournament tournament={view.tournament} />
          </div>
        </MenuGroup>
      )}
      <MenuEntries
        label="Spėjimai"
        entries={inGroup(entries, 'main')}
        view={view}
      />
      <MenuEntries
        label="Suvestinė"
        entries={inGroup(entries, 'summary')}
        view={view}
      />
      <MenuEntries
        label="Informacija"
        entries={inGroup(entries, 'info')}
        view={view}
      />
      <MenuEntries
        label="Lyga"
        entries={inGroup(entries, 'league')}
        view={view}
      />
      <MenuGroup label="Paskyra">
        <NavLink
          href={PROFILE_PATH}
          base={MENU_LINK.base}
          idle={MENU_LINK.idle}
          current={MENU_LINK.current}
        >
          <Icon name="person-fill" /> Profilis
        </NavLink>
        {player.isAdmin ? (
          <NavLink
            href={ADMIN_PATH}
            base={MENU_LINK.base}
            idle={MENU_LINK.idle}
            current={MENU_LINK.current}
          >
            <Icon name="database-gear" /> Admin
          </NavLink>
        ) : null}
        <button
          type="submit"
          form={SIGN_OUT_FORM}
          className={`${MENU_LINK.base} ${MENU_LINK.idle} cursor-pointer border-none bg-transparent text-left`}
        >
          <Icon name="box-arrow-right" /> Atsijungti
        </button>
        <form id={SIGN_OUT_FORM} action={SIGN_OUT_PATH} method="post" hidden />
      </MenuGroup>
    </>
  );
}

function MenuEntries({
  label,
  entries,
  view,
}: {
  label: string;
  entries: readonly NavEntry[];
  view: ShellView;
}) {
  if (entries.length === 0) return null;
  return (
    <MenuGroup label={label}>
      {entries.map((entry) => (
        <NavLink
          key={entry.href}
          href={entry.href}
          base={MENU_LINK.base}
          idle={MENU_LINK.idle}
          current={MENU_LINK.current}
        >
          <Icon name={entry.icon} /> {entry.label}
          {entry.badge === undefined ? null : (
            <NavBadge
              kind={entry.badge}
              count={view.badges[entry.badge]}
              placement="menu"
            />
          )}
        </NavLink>
      ))}
    </MenuGroup>
  );
}

/** .sb-mobile-group with its .sb-mobile-label; a line between groups. */
function MenuGroup({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-rail-wash-sm px-4 pt-2.5 pb-1 first:border-t-0">
      {label === undefined ? null : (
        <div className="px-0.5 pb-1 text-[0.65rem] font-bold tracking-[0.6px] text-rail-dim uppercase">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/phone-menu.test.tsx src/components/shell/phone-header.test.tsx`
Expected: PASS, `11 passed (11)` (3 + 8).

- [ ] **Step 6: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `20 passed (20)` files, `84 passed (84)` tests.

Commit message:

```
feat(web): the phone bar, with a guest's pills or a player's menu (#15)

Below 992px: the brand, and either the guest pills or the menu toggle
opening sportbet's panel - the tournament card, "Spėjimai", "Suvestinė",
"Informacija", "Lyga" and "Paskyra".
```

---

### Task 10 (web-dev): The bottom tabs

**Files:**
- Create: `apps/web/src/components/shell/bottom-tabs.tsx`
- Test: `apps/web/src/components/shell/bottom-tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/shell/bottom-tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { playerView } from '../../../tests/support/shell-views';
import { BottomTabs } from './bottom-tabs';
import type { NavEntry } from './nav-entries';
import { guestView } from './shell-view';

// sportbet's partials/bottom-nav and BottomNavLeagueTabTest (issue 144).

const TABS: readonly NavEntry[] = [
  {
    label: 'Eiga',
    href: '/',
    icon: 'globe2',
    audience: 'player',
    group: 'main',
    surfaces: ['tabs'],
    badge: 'standings',
  },
];

const trophyIn = (container: HTMLElement) =>
  container.querySelector('[data-icon="trophy"]');

describe('BottomTabs', () => {
  it('is a tab per entry, under its icon, the current page marked', () => {
    render(<BottomTabs view={playerView()} entries={TABS} />);
    const tab = screen.getByRole('link', { name: 'Eiga' });
    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(tab.querySelector('[data-icon="globe2"]')).not.toBeNull();
  });

  it("pins a tab's badge to it, shown by the view's count", () => {
    const { container } = render(
      <BottomTabs
        view={playerView({ badges: { ...guestView().badges, standings: 1 } })}
        entries={TABS}
      />,
    );
    const badge = container.querySelector('[data-missing="standings"]');
    expect(badge?.closest('a')?.getAttribute('href')).toBe('/');
    expect(badge?.hasAttribute('hidden')).toBe(false);
  });

  it('has no league tab for a player with one league', () => {
    const { container } = render(
      <BottomTabs view={playerView()} entries={TABS} />,
    );
    expect(trophyIn(container)).toBeNull();
  });

  it('has a league tab listing the other league for a player with two', () => {
    const { container } = render(
      <BottomTabs
        view={playerView({
          leagues: { current: 'Vieša', others: [{ id: 7, name: 'Draugai' }] },
        })}
        entries={TABS}
      />,
    );
    expect(trophyIn(container)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Vieša' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Draugai', hidden: true }),
    ).toBeDefined();
  });

  it('has no league tab for a player with no league', () => {
    const { container } = render(
      <BottomTabs view={playerView({ leagues: null })} entries={TABS} />,
    );
    expect(trophyIn(container)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/bottom-tabs.test.tsx`
Expected: FAIL - `Failed to resolve import "./bottom-tabs"`.

- [ ] **Step 3: The tabs**

Create `apps/web/src/components/shell/bottom-tabs.tsx`:

```tsx
import { Icon } from './icon';
import { LeagueSwitcher } from './league-switcher';
import { NavBadge } from './nav-badge';
import type { NavEntry } from './nav-entries';
import { NavLink } from './nav-link';
import { TAB } from './nav-styles';
import type { ShellView } from './shell-view';

/**
 * A signed-in player's tab bar along the phone's bottom, below 992px
 * (sportbet's partials/bottom-nav, .sb-bottom-nav): a tab per entry, and
 * the league drop-up only when there is another league to switch to
 * (issue 144: with one league it opened empty).
 */
export function BottomTabs({
  view,
  entries,
}: {
  view: ShellView;
  entries: readonly NavEntry[];
}) {
  const { leagues } = view;
  return (
    <nav
      data-testid="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-[1025] flex border-t border-rail-line bg-rail pt-1.5 pb-[env(safe-area-inset-bottom,6px)] lg:hidden"
    >
      {entries.map((entry) => (
        <NavLink
          key={entry.href}
          href={entry.href}
          base={TAB.base}
          idle={TAB.idle}
          current={TAB.current}
        >
          <span className="text-[1.2rem] leading-none">
            <Icon name={entry.icon} />
          </span>
          <span className="text-[0.62rem]">{entry.label}</span>
          {entry.badge === undefined ? null : (
            <NavBadge
              kind={entry.badge}
              count={view.badges[entry.badge]}
              placement="tab"
            />
          )}
        </NavLink>
      ))}
      {leagues !== null && leagues.others.length > 0 ? (
        <LeagueSwitcher leagues={leagues} variant="tab" />
      ) : null}
    </nav>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/bottom-tabs.test.tsx`
Expected: PASS, `5 passed (5)`.

- [ ] **Step 5: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `ok`; `21 passed (21)` files, `89 passed (89)` tests.

Commit message:

```
feat(web): the bottom tabs, with the league drop-up from two leagues (#15)
```

---

### Task 11 (web-dev): Cookie consent and `ADSENSE_CLIENT`

**Files:**
- Create: `apps/web/src/components/shell/cookie-consent.tsx`
- Test: `apps/web/src/components/shell/cookie-consent.test.tsx`
- Modify: `apps/web/src/env.ts`
- Test: `apps/web/tests/feature/startup.test.ts`

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/components/shell/cookie-consent.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY, CookieConsent } from './cookie-consent';

// sportbet's partials/cookie-consent: asked until answered, the answer in
// localStorage 'sb_cookie_consent', AdSense only after "Sutinku" - and here
// only where ADSENSE_CLIENT is set (production).

const CLIENT = 'ca-pub-7290396604686794';
const AD_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;

const banner = () => screen.getByTestId('cookie-consent');
const adScripts = () =>
  document.head.querySelectorAll<HTMLScriptElement>(
    'script[src*="adsbygoogle"]',
  );

afterEach(() => {
  localStorage.clear();
  for (const script of adScripts()) script.remove();
  vi.restoreAllMocks();
});

describe('CookieConsent', () => {
  it("is in the server's markup, hidden until the browser has read the answer", () => {
    const html = renderToStaticMarkup(
      <CookieConsent adsenseClient={CLIENT} privacyHref={null} />,
    );
    expect(html).toContain('data-state="unread"');
    expect(html).toMatch(/^<div[^>]*\shidden=""/);
  });

  it('asks a first-time visitor', () => {
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('asking');
    expect(banner().hidden).toBe(false);
    expect(banner().textContent).toContain(
      'Naudojame slapukus reklamai ir statistikai.',
    );
    expect(screen.getByRole('button', { name: 'Tik būtini' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sutinku' })).toBeDefined();
    expect(adScripts()).toHaveLength(0);
  });

  it('remembers "Sutinku", closes, and loads AdSense with the client', () => {
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    expect(banner().hidden).toBe(true);
    const [script] = adScripts();
    expect(script?.getAttribute('src')).toBe(AD_SRC);
    expect(script?.async).toBe(true);
    expect(script?.crossOrigin).toBe('anonymous');
  });

  it('loads no ad after "Sutinku" where no client is set', () => {
    render(<CookieConsent adsenseClient={null} privacyHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    expect(adScripts()).toHaveLength(0);
  });

  it('remembers "Tik būtini", closes, and loads no ad', () => {
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tik būtini' }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('declined');
    expect(banner().hidden).toBe(true);
    expect(adScripts()).toHaveLength(0);
  });

  it('does not ask a visitor who accepted, and loads their ad', () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('answered');
    expect(banner().hidden).toBe(true);
    expect(adScripts()).toHaveLength(1);
  });

  it('does not ask a visitor who declined, and loads no ad', () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('answered');
    expect(adScripts()).toHaveLength(0);
  });

  it('loads AdSense once, even if it is already on the page', () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    const existing = document.createElement('script');
    existing.src = AD_SRC;
    document.head.appendChild(existing);
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(adScripts()).toHaveLength(1);
  });

  it('asks, and still closes on an answer, when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    render(<CookieConsent adsenseClient={null} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('asking');
    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    expect(banner().hidden).toBe(true);
  });

  it('links the privacy policy once the page exists, and says nothing of it before', () => {
    const { unmount } = render(
      <CookieConsent adsenseClient={null} privacyHref={null} />,
    );
    expect(banner().textContent).not.toContain('Daugiau informacijos');
    expect(screen.queryByRole('link')).toBeNull();
    unmount();

    render(<CookieConsent adsenseClient={null} privacyHref="/privacy" />);
    expect(banner().textContent).toContain(
      'Naudojame slapukus reklamai ir statistikai. Daugiau informacijos: privatumo politika.',
    );
    expect(
      screen
        .getByRole('link', { name: 'privatumo politika' })
        .getAttribute('href'),
    ).toBe('/privacy');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/cookie-consent.test.tsx`
Expected: FAIL - `Failed to resolve import "./cookie-consent"`.

- [ ] **Step 3: The banner**

Create `apps/web/src/components/shell/cookie-consent.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from './icon';

/** Where the answer is kept, as sportbet keeps it: 'accepted' or 'declined'. */
export const CONSENT_KEY = 'sb_cookie_consent';

const ADSENSE_SRC =
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=';

/** unread: the server's render, before the browser has looked; asking: the banner is up; answered: it stays down. */
type State = 'unread' | 'asking' | 'answered';
type Answer = 'accepted' | 'declined';

function storedAnswer(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null; // storage blocked: ask, as on a first visit
  }
}

function remember(answer: Answer): void {
  try {
    localStorage.setItem(CONSENT_KEY, answer);
  } catch {
    // storage blocked: the visitor is asked again next time
  }
}

/** sportbet's loadAdsense(): once per page, and here only with a client. */
function loadAdsense(client: string | null): void {
  if (
    client === null ||
    document.querySelector('script[src*="adsbygoogle"]') !== null
  )
    return;
  const script = document.createElement('script');
  script.async = true;
  script.src = ADSENSE_SRC + client;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

// .sb-cookie-btn and its two kinds
const BUTTON =
  'cursor-pointer rounded-[6px] px-4 py-1.5 text-[0.82rem] leading-[1.4] font-semibold';

/**
 * The cookie banner (sportbet's partials/cookie-consent): up until the
 * visitor answers, the answer remembered in localStorage. "Sutinku" loads
 * AdSense, but only where ADSENSE_CLIENT is set - production - so staging
 * and the tests never load an ad. Above the bottom tabs' height below
 * 992px, as sportbet places it.
 */
export function CookieConsent({
  adsenseClient,
  privacyHref,
}: {
  adsenseClient: string | null;
  privacyHref: string | null;
}) {
  const [state, setState] = useState<State>('unread');

  useEffect(() => {
    const stored = storedAnswer();
    if (stored === 'accepted') loadAdsense(adsenseClient);
    // sportbet asks only when nothing is stored.
    setState(stored === null || stored === '' ? 'asking' : 'answered');
  }, [adsenseClient]);

  function answer(given: Answer): void {
    remember(given);
    setState('answered');
    if (given === 'accepted') loadAdsense(adsenseClient);
  }

  return (
    <div
      data-testid="cookie-consent"
      data-state={state}
      hidden={state !== 'asking'}
      className="fixed inset-x-0 bottom-0 z-[1030] flex flex-wrap items-center justify-between gap-3 bg-rail-raised px-5 py-3 text-[0.84rem] text-on-rail shadow-[0_-2px_12px_var(--color-shadow-strong)] max-lg:bottom-14"
    >
      <div>
        <Icon name="cookie" /> Naudojame slapukus reklamai ir statistikai.
        {privacyHref === null ? null : (
          <>
            {' Daugiau informacijos: '}
            <Link href={privacyHref} className="text-rail-accent underline">
              privatumo politika
            </Link>
            .
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => {
            answer('declined');
          }}
          className={`${BUTTON} border border-rail-line bg-transparent text-rail-dim hover:bg-rail-wash-lg hover:text-on-rail`}
        >
          Tik būtini
        </button>
        <button
          type="button"
          onClick={() => {
            answer('accepted');
          }}
          className={`${BUTTON} border-none bg-accent text-on-accent hover:bg-accent-hover`}
        >
          Sutinku
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/cookie-consent.test.tsx`
Expected: PASS, `10 passed (10)`.

- [ ] **Step 5: Write the failing startup test**

In `apps/web/tests/feature/startup.test.ts`, add at the end of the file:

```ts
it('refuses to start with an ADSENSE_CLIENT that is not a publisher id, naming it', async () => {
  const { code, output } = await runServerUntilExit({
    DATABASE_URL: 'postgres://sportbet@127.0.0.1:1/sportbet',
    ADSENSE_CLIENT: 'pub-7290396604686794',
  });
  expect(code).toBe(1);
  expect(output).toContain('Invalid environment');
  expect(output).toContain('ADSENSE_CLIENT');
});
```

- [ ] **Step 6: Run it to see it fail**

```bash
pnpm build 2>&1 | grep -c "build: Done"
pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/startup.test.ts 2>&1 | grep -E "Tests |server was still running"
```

Expected: `3`; the new test FAILS with `server was still running after 30 s` (the variable is not read yet, so the server starts); `1 failed | 2 passed (3)`.

- [ ] **Step 7: Parse it**

Replace the whole of `apps/web/src/env.ts`:

```ts
import { databaseEnvSchema } from '@sportbet/db';
import { z } from 'zod';

/**
 * AdSense's publisher id, set on production only (spec 4a, "Cookie consent
 * and ads"; production's is ca-pub-7290396604686794). Unset, "Sutinku" on
 * the cookie banner loads no ad: staging and every test run that way.
 */
const adsenseClientSchema = z
  .string()
  .regex(/^ca-pub-\d{16}$/, 'an AdSense publisher id: ca-pub- and 16 digits');

const envSchema = databaseEnvSchema.extend({
  ADSENSE_CLIENT: adsenseClientSchema.optional(),
});

export type Env = z.infer<typeof envSchema>;

let parsed: Env | undefined;

/** The parsed environment. Throws a ZodError naming every bad variable. */
export function env(): Env {
  parsed ??= envSchema.parse(process.env);
  return parsed;
}
```

- [ ] **Step 8: Run both to see them pass**

```bash
pnpm format
pnpm build 2>&1 | grep -c "build: Done"
pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/startup.test.ts 2>&1 | grep -E "Tests "
pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
```

Expected: `3`; `3 passed (3)`; `ok`; `22 passed (22)` files, `99 passed (99)` tests.

- [ ] **Step 9: Hand to the lead**

Commit message:

```
feat(web): the cookie banner, and AdSense only where ADSENSE_CLIENT is set (#15)

Asked until answered, the answer in localStorage 'sb_cookie_consent' as
sportbet keeps it; "Sutinku" loads AdSense only with a client, which
production alone sets. A malformed ADSENSE_CLIENT stops the server.
```

---

### Task 12 (web-dev): The shell around every page

**Files:**
- Create: `apps/web/src/components/shell/shell.tsx`
- Test: `apps/web/src/components/shell/shell.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/components/home-view.tsx`, `apps/web/src/components/not-found-view.tsx`, `apps/web/src/components/tournament-details.tsx`
- Test: `apps/web/tests/feature/routes.test.ts`

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/components/shell/shell.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JONAS, playerView } from '../../../tests/support/shell-views';
import { NAV_ENTRIES, type NavEntry } from './nav-entries';
import { Shell } from './shell';
import { guestView } from './shell-view';

// sportbet's ShellNoRailLayoutTest and RailNavigationTest, for the frame:
// a guest gets the guest rail and the plain phone bar; a player the
// player rail, the menu and the bottom tabs.

const SURVIVAL: NavEntry = {
  label: 'Išlikimas',
  href: '/predictionSurvival',
  icon: 'trophy',
  audience: 'player',
  group: 'main',
  surfaces: ['rail', 'menu', 'tabs'],
  badge: 'survival',
  shownWhen: (view) => view.nav.survival,
};

afterEach(() => {
  localStorage.clear();
});

describe('Shell', () => {
  it("frames a guest's page: the guest rail, the plain phone bar, no tabs", () => {
    render(
      <Shell view={guestView()} adsenseClient={null}>
        <h1>Turinys</h1>
      </Shell>,
    );
    expect(
      within(screen.getByTestId('rail'))
        .getByRole('link', { name: 'Turnyrai' })
        .getAttribute('href'),
    ).toBe('/');
    expect(within(screen.getByTestId('rail')).queryByText('Paskyra')).toBeNull();
    expect(screen.getByTestId('phone-header')).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Atidaryti meniu' }),
    ).toBeNull();
    expect(screen.queryByTestId('bottom-tabs')).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('heading', {
        name: 'Turinys',
      }),
    ).toBeDefined();
  });

  it("asks a guest about cookies, without a privacy link while there is no privacy page", () => {
    render(
      <Shell view={guestView()} adsenseClient={null}>
        <p />
      </Shell>,
    );
    expect(screen.getByTestId('cookie-consent').getAttribute('data-state')).toBe(
      'asking',
    );
    expect(
      screen.queryByRole('link', { name: 'privatumo politika' }),
    ).toBeNull();
  });

  it("frames a player's page: the player rail, the menu, the tabs", () => {
    render(
      <Shell view={playerView()} adsenseClient={null}>
        <p />
      </Shell>,
    );
    const rail = screen.getByTestId('rail');
    expect(within(rail).queryByRole('link', { name: 'Turnyrai' })).toBeNull();
    expect(within(rail).getByText('Paskyra')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Atidaryti meniu' }),
    ).toBeDefined();
    expect(screen.getByTestId('bottom-tabs')).toBeDefined();
  });

  it('draws a flagged entry on every surface once its flag is on, and nowhere before', () => {
    const entries = [...NAV_ENTRIES, SURVIVAL];
    const { unmount } = render(
      <Shell view={playerView()} adsenseClient={null} entries={entries}>
        <p />
      </Shell>,
    );
    expect(
      screen.queryAllByRole('link', { name: 'Išlikimas', hidden: true }),
    ).toHaveLength(0);
    unmount();

    render(
      <Shell
        view={playerView({
          nav: { survival: true, summary: false, survivalSummary: false },
        })}
        adsenseClient={null}
        entries={entries}
      >
        <p />
      </Shell>,
    );
    expect(
      screen.getAllByRole('link', { name: 'Išlikimas', hidden: true }),
    ).toHaveLength(3);
  });

  it('offers administration to an admin only, in the rail and the menu', () => {
    const { unmount } = render(
      <Shell view={playerView()} adsenseClient={null}>
        <p />
      </Shell>,
    );
    expect(
      screen.queryByRole('link', { name: 'Administravimas', hidden: true }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin', hidden: true })).toBeNull();
    unmount();

    render(
      <Shell
        view={playerView({ player: { ...JONAS, isAdmin: true } })}
        adsenseClient={null}
      >
        <p />
      </Shell>,
    );
    expect(
      screen.getByRole('link', { name: 'Administravimas', hidden: true }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Admin', hidden: true }),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/shell.test.tsx`
Expected: FAIL - `Failed to resolve import "./shell"`.

- [ ] **Step 3: The frame**

Create `apps/web/src/components/shell/shell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { BottomTabs } from './bottom-tabs';
import { CookieConsent } from './cookie-consent';
import { GuestRail } from './guest-rail';
import {
  NAV_ENTRIES,
  entriesFor,
  privacyHref,
  type NavEntry,
} from './nav-entries';
import { PhoneHeader } from './phone-header';
import { PlayerRail } from './player-rail';
import type { ShellView } from './shell-view';

/**
 * The frame every page sits in (sportbet's layouts/master): the rail from
 * 992px, the phone bar below it, the page in the centred container, the
 * bottom tabs for a player, and the cookie banner. Told everything by the
 * view; `entries` is NAV_ENTRIES except in tests.
 */
export function Shell({
  view,
  adsenseClient,
  entries = NAV_ENTRIES,
  children,
}: {
  view: ShellView;
  adsenseClient: string | null;
  entries?: readonly NavEntry[];
  children: ReactNode;
}) {
  const { player } = view;
  return (
    <>
      {/* .sb-shell: two columns from 992px, the rail's 212px and the rest */}
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[212px_1fr]">
        {player === null ? (
          <GuestRail view={view} entries={entriesFor(view, 'rail', entries)} />
        ) : (
          <PlayerRail
            view={view}
            player={player}
            entries={entriesFor(view, 'rail', entries)}
          />
        )}
        {/* .sb-shell-main: min-w-0 lets the column shrink below its content on a phone */}
        <div className="flex min-h-full min-w-0 flex-col">
          <PhoneHeader
            view={view}
            pills={entriesFor(view, 'pills', entries)}
            menu={entriesFor(view, 'menu', entries)}
          />
          {/* .sb-main and .sb-container: sideways overflow is clipped here,
              never on <body> (sportbet's LayoutOverflowRegressionTest) */}
          <main className="flex-1 overflow-x-hidden pt-6 pb-[calc(72px_+_env(safe-area-inset-bottom,0px))] lg:pb-6">
            <div className="mx-auto w-full max-w-[1280px] px-5">{children}</div>
          </main>
        </div>
      </div>
      {player === null ? null : (
        <BottomTabs view={view} entries={entriesFor(view, 'tabs', entries)} />
      )}
      <CookieConsent
        adsenseClient={adsenseClient}
        privacyHref={privacyHref(entries)}
      />
    </>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/shell/shell.test.tsx`
Expected: PASS, `5 passed (5)`.

- [ ] **Step 5: The pages lose their own `<main>`** (the shell's is the page's one `main`)

In `apps/web/src/components/home-view.tsx`, replace:

```tsx
    <main>
      <h1>Tournaments</h1>
      <TournamentList tournaments={tournaments} />
    </main>
```

with:

```tsx
    <>
      <h1>Tournaments</h1>
      <TournamentList tournaments={tournaments} />
    </>
```

In `apps/web/src/components/not-found-view.tsx`, replace:

```tsx
    <main>
      <h1>Not found</h1>
      <BackToList />
    </main>
```

with:

```tsx
    <>
      <h1>Not found</h1>
      <BackToList />
    </>
```

In `apps/web/src/components/tournament-details.tsx`, replace:

```tsx
    <main>
      <article>
        <h1>{tournament.name}</h1>
        <p>Format: {formatLabel(tournament.format)}</p>
        <BackToList />
      </article>
    </main>
```

with:

```tsx
    <article>
      <h1>{tournament.name}</h1>
      <p>Format: {formatLabel(tournament.format)}</p>
      <BackToList />
    </article>
```

- [ ] **Step 6: Write the failing feature tests**

In `apps/web/tests/feature/routes.test.ts`, add before `describe('GET /api/health', () => {`:

```ts
describe('the page shell', () => {
  it('serves a page in Lithuanian, inside the guest shell', async () => {
    const { status, body } = await fetchPage('/');
    expect(status).toBe(200);
    expect(body).toMatch(/<html[^>]*\slang="lt"/);
    expect(body).toContain('data-testid="rail"');
    expect(body).toContain('data-testid="phone-header"');
    expect(body).toContain('data-testid="cookie-consent"');
    expect(body).not.toContain('data-testid="bottom-tabs"');
  });

  it('frames the 404 page too', async () => {
    const { status, body } = await fetchPage('/tournament/no-such-tournament');
    expect(status).toBe(404);
    expect(body).toContain('data-testid="rail"');
  });

  it('sets the theme before the first paint, and loads nothing from elsewhere', async () => {
    const { body } = await fetchPage('/');
    expect(body).toContain("localStorage.getItem('sb-theme')");
    expect(body).not.toMatch(
      /<(?:script|link|img)\b[^>]*\s(?:src|href|srcset)="(?:https?:)?\/\//,
    );
  });
});
```

- [ ] **Step 7: Run them to see them fail**

```bash
pnpm build 2>&1 | grep -c "build: Done"
pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/routes.test.ts 2>&1 | grep -E "Tests |FAIL"
```

Expected: `3`; the first two new tests FAIL on `data-testid="rail"` (no shell yet); the third already passes (the theme script and `lang="lt"` came in Task 2); `2 failed`.

- [ ] **Step 8: Wire the layout**

Replace the whole of `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Shell } from '../components/shell/shell';
import { guestView } from '../components/shell/shell-view';
import { ThemeScript } from '../components/shell/theme-script';
import { env } from '../env';
import './globals.css';

// Inter as sportbet loads it (400-800), downloaded at build and served by
// the app itself: no request to Google at run time. latin-ext carries
// Lithuanian's letters.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SportBet',
  icons: {
    icon: { url: '/img/favicon.png', type: 'image/png' },
    apple: '/img/favicon-180.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Per request, never at build: ADSENSE_CLIENT is read where the page is
  // served, and the shell's view is this visitor's (the guest's until 4b).
  await connection();
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="lt" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      {/* sportbet's .sb-layout and body */}
      <body className="flex min-h-screen flex-col bg-bg font-sans text-text">
        <Shell view={guestView()} adsenseClient={env().ADSENSE_CLIENT ?? null}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Run everything it touches**

```bash
pnpm format
pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint silent, `4`; `23 passed (23)` files, `104 passed (104)` tests; `3`; feature passes with 4 tests more than Task 0's baseline (3 here, 1 in Task 11).

- [ ] **Step 10: Look at it** (by hand, a minute)

```bash
docker run -d --rm --name sb-shell-look -e POSTGRES_PASSWORD=look -p 127.0.0.1:55432:5432 postgres:18.6
sleep 5
DATABASE_URL=postgres://postgres:look@127.0.0.1:55432/postgres node packages/db/dist/migrate.mjs
DATABASE_URL=postgres://postgres:look@127.0.0.1:55432/postgres pnpm --filter @sportbet/web dev
```

Open `http://localhost:3000` at full width (the rail, "Turnyrai" current) and in the browser's device mode at 390px (the phone bar, the cookie banner above the bottom edge's 56px); set `localStorage['sb-theme'] = 'dark'` in the console and reload (dark). Then stop `next dev` and run `docker stop sb-shell-look`. (`pnpm --filter @sportbet/db build` first if `packages/db/dist/migrate.mjs` is missing.)

- [ ] **Step 11: Hand to the lead**

Commit message:

```
feat(web): every page in sportbet's guest shell (#15)

The root layout frames every page - the 404 included - in the shell,
built per request with the guest view; the pages give up their own
<main> to the shell's.
```

---

### Task 12b (web-dev): The walking-skeleton pages in Lithuanian

Decision 13: Lithuanian only. The placeholder pages slice 5 will rebuild still speak English. Where sportbet has the same text, its wording is used; two strings have no sportbet original and are this plan's own, listed for the owner:

| English | Lithuanian | Source |
|---|---|---|
| Tournaments (the list's heading) | Turnyrai | sportbet `lang/lt.json` ("Turnyrai", the hub's rail entry) |
| All tournaments (the link back to the list) | ← Turnyrai | sportbet `lang/lt.json` ("← Turnyrai", `tournaments/show.blade.php`'s link back to the hub) |
| No tournaments yet. | Turnyrų kol kas nėra | sportbet `tournaments/hub.blade.php`'s empty state (no full stop there) |
| Not found | Puslapis nerastas | **invented** (sportbet has no 404 page of its own) |
| Format: Euroleague | Formatas: Euroleague | **invented** ("Formatas:"; the format's name comes from the domain's `formatLabel`, unchanged) |

**Files:**
- Modify: `apps/web/src/components/home-view.tsx`, `not-found-view.tsx`, `tournament-details.tsx`, `tournament-list.tsx`, `back-to-list.tsx`
- Test: `apps/web/src/components/home-view.test.tsx`, `not-found-view.test.tsx`, `tournament-details.test.tsx`, `tournament-list.test.tsx`, `apps/web/tests/feature/routes.test.ts`

- [ ] **Step 1: The tests say it in Lithuanian first**

In `apps/web/src/components/home-view.test.tsx`, replace:

```tsx
it('shows a heading and the tournament list', () => {
  render(<HomeView tournaments={[storedAs(1, EUROLEAGUE_2026_27)]} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tournaments' }),
  ).toBeDefined();
```

with:

```tsx
it('shows a heading and the tournament list', () => {
  render(<HomeView tournaments={[storedAs(1, EUROLEAGUE_2026_27)]} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Turnyrai' }),
  ).toBeDefined();
```

In `apps/web/src/components/not-found-view.test.tsx`, replace:

```tsx
  expect(
    screen.getByRole('heading', { level: 1, name: 'Not found' }),
  ).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'All tournaments' }).getAttribute('href'),
  ).toBe('/');
```

with:

```tsx
  expect(
    screen.getByRole('heading', { level: 1, name: 'Puslapis nerastas' }),
  ).toBeDefined();
  expect(
    screen.getByRole('link', { name: '← Turnyrai' }).getAttribute('href'),
  ).toBe('/');
```

In `apps/web/src/components/tournament-details.test.tsx`, replace:

```tsx
  expect(screen.getByText('Format: Euroleague')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'All tournaments' }).getAttribute('href'),
  ).toBe('/');
```

with:

```tsx
  expect(screen.getByText('Formatas: Euroleague')).toBeDefined();
  expect(
    screen.getByRole('link', { name: '← Turnyrai' }).getAttribute('href'),
  ).toBe('/');
```

In `apps/web/src/components/tournament-list.test.tsx`, replace:

```tsx
    expect(screen.getByText('No tournaments yet.')).toBeDefined();
```

with:

```tsx
    expect(screen.getByText('Turnyrų kol kas nėra')).toBeDefined();
```

In `apps/web/tests/feature/routes.test.ts`, replace:

```ts
    expect((await fetchPage('/')).body).toContain('No tournaments yet.');
```

with:

```ts
    expect((await fetchPage('/')).body).toContain('Turnyrų kol kas nėra');
```

and replace:

```ts
    expect(body).toContain('Not found');
```

with:

```ts
    expect(body).toContain('Puslapis nerastas');
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:component 2>&1 | grep -E "Test Files|Tests "`
Expected: `4 failed | 19 passed (23)` files; `4 failed | 100 passed (104)` tests (one test in each of the four page component files).

- [ ] **Step 3: The pages in Lithuanian**

In `apps/web/src/components/home-view.tsx`, replace `      <h1>Tournaments</h1>` with `      <h1>Turnyrai</h1>`.

In `apps/web/src/components/not-found-view.tsx`, replace `      <h1>Not found</h1>` with `      <h1>Puslapis nerastas</h1>`.

In `apps/web/src/components/tournament-details.tsx`, replace `      <p>Format: {formatLabel(tournament.format)}</p>` with `      <p>Formatas: {formatLabel(tournament.format)}</p>`.

In `apps/web/src/components/tournament-list.tsx`, replace:

```tsx
  if (tournaments.length === 0) return <p>No tournaments yet.</p>;
```

with:

```tsx
  if (tournaments.length === 0) return <p>Turnyrų kol kas nėra</p>;
```

In `apps/web/src/components/back-to-list.tsx`, replace:

```tsx
      <Link href="/">All tournaments</Link>
```

with:

```tsx
      <Link href="/">← Turnyrai</Link>
```

- [ ] **Step 4: Run everything it touches**

```bash
pnpm format
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
grep -rn "Tournaments\|All tournaments\|Not found\|No tournaments\|Format:" apps/web/src --include=*.tsx | grep -v "\.test\.tsx" | wc -l
```

Expected: `23 passed (23)` files, `104 passed (104)` tests; `ok`; `3`; feature passes, counts as after Task 12; `0` English texts left in the components (`tournaments.spec.ts` follows in Task 14).

- [ ] **Step 5: Hand to the lead**

Commit message:

```
feat(web): the walking-skeleton pages in Lithuanian (#15)

Decision 13. "Turnyrai", "← Turnyrai" and "Turnyrų kol kas nėra" are
sportbet's; "Puslapis nerastas" and "Formatas:" are new wording, listed
on the plan for the owner.
```

---

### Task 13 (devops): The web image carries `public/`

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Copy it**

In `Dockerfile`, replace:

```dockerfile
# A future apps/web/public must be copied too (Next does not bundle it into
# .next/standalone): COPY --from=build /repo/apps/web/public ./apps/web/public
```

with:

```dockerfile
# Next does not bundle public/ into .next/standalone: sportbet's logo and
# favicons (slice 4a).
COPY --from=build /repo/apps/web/public ./apps/web/public
```

- [ ] **Step 2: Build it and look inside**

```bash
docker build --target web -t sportbet-web:local . 2>&1 | tail -1
docker run --rm --entrypoint ls sportbet-web:local apps/web/public/img
```

Expected: the build's last line names the image; `favicon-180.png favicon-512.png favicon.png favicon.svg logo.png logo.svg` (one per line).

- [ ] **Step 3: Hand to the lead**

Commit message:

```
build: the web image carries apps/web/public (#15)
```

---

### Task 14 (qa): The guest shell end to end

**Files:**
- Create: `apps/web/e2e/shell.spec.ts`
- Modify: `apps/web/e2e/tournaments.spec.ts` (Task 12b's Lithuanian texts)

- [ ] **Step 1: Write the spec**

Create `apps/web/e2e/shell.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

// The guest shell (spec 4a, issue #15): sportbet's frame at a phone's
// width and a desktop's, the theme from 'sb-theme', the cookie banner's
// answer remembered, and nothing fetched from another origin. Runs in CI
// against the stack built from this commit, and again against staging.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** sportbet's LayoutOverflowRegressionTest, in a browser: the page never scrolls sideways. */
async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test.describe('at a phone width', () => {
  test.use({ viewport: PHONE });

  test('shows the phone bar, not the rail, and never scrolls sideways', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'lt');
    await expect(page.getByTestId('phone-header')).toBeVisible();
    await expect(page.getByTestId('rail')).toBeHidden();
    await expect(page.getByTestId('bottom-tabs')).toHaveCount(0);
    expect(await scrollsSideways(page)).toBe(false);
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: DESKTOP });

  test('shows the rail with Turnyrai as the current page, and never scrolls sideways', async ({
    page,
  }) => {
    await page.goto('/');
    const rail = page.getByTestId('rail');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('phone-header')).toBeHidden();
    await expect(
      rail.getByRole('link', { name: 'Turnyrai', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(await scrollsSideways(page)).toBe(false);
  });

  test('clips sideways overflow on main, never on body', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible');
    await expect(page.locator('body')).toHaveCSS('overflow-y', 'visible');
    await expect(page.locator('main')).toHaveCSS('overflow-x', 'hidden');
  });

  test('draws the logo from the app itself', async ({ page }) => {
    await page.goto('/');
    const logo = page.getByTestId('rail').locator('img');
    await expect(logo).toHaveAttribute(
      'src',
      /^\/_next\/image\?url=%2Fimg%2Flogo\.png/,
    );
    await expect
      .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });
});

test.describe('the theme', () => {
  test('is light for a first-time visitor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
  });

  test("is dark when 'sb-theme' says dark", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sb-theme', 'dark');
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(14, 18, 22)',
    );
  });
});

test.describe('the cookie banner', () => {
  test('asks a first-time visitor and remembers "Sutinku", loading no ad off production', async ({
    page,
  }) => {
    await page.goto('/');
    const banner = page.getByTestId('cookie-consent');
    await expect(banner).toHaveAttribute('data-state', 'asking');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Sutinku' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(banner).toHaveAttribute('data-state', 'answered');
    await expect(banner).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem('sb_cookie_consent')),
    ).toBe('accepted');
    await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
  });

  test('remembers "Tik būtini"', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByTestId('cookie-consent');
    await banner.getByRole('button', { name: 'Tik būtini' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(banner).toHaveAttribute('data-state', 'answered');
    await expect(banner).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem('sb_cookie_consent')),
    ).toBe('declined');
  });
});

test('fetches nothing from another origin, at either width', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    requested.push(request.url());
  });

  await page.setViewportSize(PHONE);
  await page.goto('/');
  const banner = page.getByTestId('cookie-consent');
  await expect(banner).toHaveAttribute('data-state', 'asking');
  await page.setViewportSize(DESKTOP);
  await page.reload();
  await banner.getByRole('button', { name: 'Sutinku' }).click();
  await expect(banner).toHaveAttribute('data-state', 'answered');

  const origin = new URL(page.url()).origin;
  const elsewhere = requested
    .map((url) => new URL(url))
    .filter((url) => url.protocol.startsWith('http'))
    .filter((url) => url.origin !== origin)
    .map((url) => url.href);
  expect(elsewhere).toEqual([]);
});
```

- [ ] **Step 2: The walking-skeleton spec in Lithuanian** (Task 12b's texts)

In `apps/web/e2e/tournaments.spec.ts`, replace:

```ts
    page.getByRole('heading', { level: 1, name: 'Tournaments', exact: true }),
```

with:

```ts
    page.getByRole('heading', { level: 1, name: 'Turnyrai', exact: true }),
```

replace:

```ts
  await expect(page.getByText(`Format: ${EUROLEAGUE_A.format}`)).toBeVisible();
```

with:

```ts
  await expect(
    page.getByText(`Formatas: ${EUROLEAGUE_A.format}`),
  ).toBeVisible();
```

replace:

```ts
    .getByRole('link', { name: 'All tournaments', exact: true })
```

with:

```ts
    .getByRole('link', { name: '← Turnyrai', exact: true })
```

and replace:

```ts
    page.getByRole('heading', { level: 1, name: 'Not found', exact: true }),
```

with:

```ts
    page.getByRole('heading', {
      level: 1,
      name: 'Puslapis nerastas',
      exact: true,
    }),
```

(The rail's own "Turnyrai" link is not the page's way back: `exact: true` and the arrow tell them apart.)

- [ ] **Step 3: Run it against a local stack from this commit's images** (Task 13's image; one stack at a time)

```bash
pnpm --filter @sportbet/web exec playwright install chromium
docker build --target web -t sportbet-web:local . 2>&1 | tail -1
docker build --target migrate -t sportbet-migrate:local . 2>&1 | tail -1
url="$(WEB_IMAGE=sportbet-web:local MIGRATE_IMAGE=sportbet-migrate:local infra/ci/e2e-stack.sh up sb-shell)"
E2E_BASE_URL="$url" pnpm test:e2e 2>&1 | tail -3
infra/ci/e2e-stack.sh down sb-shell
```

Expected: `12 passed` (9 here and the 3 of `tournaments.spec.ts`); the stack comes down.

- [ ] **Step 4: Lint and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
git status --short
```

Expected: `ok`; `apps/web/e2e/shell.spec.ts` new and `apps/web/e2e/tournaments.spec.ts` changed, nothing else.

Commit message:

```
test(web): the guest shell end to end at 390 and 1280 (#15)

Rail or phone bar, no sideways scroll, overflow clipped on main, the
logo from the app, light by default and dark from 'sb-theme', the cookie
answer remembered, and nothing fetched from another origin.
```

---

### Task 15 (web-dev): The look sign-off script

**Files:**
- Create: `apps/web/look/signoff.ts`
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`, `.gitignore`

- [ ] **Step 1: The script**

Create `apps/web/look/signoff.ts`:

```ts
// The look sign-off (spec 4a, "Testing"): the same guest page on
// sportbet.lt and on staging, at a phone's width and a desktop's, in both
// themes, side by side for the owner. The screenshots go to look-signoff/
// (git-ignored) and are never committed.
//
//   pnpm --filter @sportbet/web look:signoff
//   STAGING_URL=http://localhost:3000/ pnpm --filter @sportbet/web look:signoff

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const STAGING =
  process.env['STAGING_URL'] ?? 'https://sportbet-new-staging.vercel.app/';
const SITES = [
  { name: 'sportbet', url: 'https://sportbet.lt/' },
  { name: 'staging', url: STAGING },
];
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];
const THEMES = ['light', 'dark'];
const OUT = new URL('../look-signoff/', import.meta.url);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const sections: string[] = [];
try {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      const figures: string[] = [];
      for (const site of SITES) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
        });
        // As a visitor's stored choice is: there before the page's own
        // theme script reads it.
        await context.addInitScript((dark: boolean) => {
          if (dark) localStorage.setItem('sb-theme', 'dark');
        }, theme === 'dark');
        const page = await context.newPage();
        await page.goto(site.url);
        // Both sites raise the cookie banner once their scripts have run.
        await page.getByRole('button', { name: 'Sutinku' }).waitFor();
        const file = `${size.name}-${theme}-${site.name}.png`;
        await page.screenshot({ path: fileURLToPath(new URL(file, OUT)) });
        await context.close();
        figures.push(
          `<figure><figcaption>${site.name} (${site.url})</figcaption><img src="${file}" alt="${site.name}"></figure>`,
        );
      }
      sections.push(
        `<h2>${size.name}, ${String(size.width)}px, ${theme}</h2><div class="pair">${figures.join('')}</div>`,
      );
    }
  }
} finally {
  await browser.close();
}

writeFileSync(
  new URL('index.html', OUT),
  `<!doctype html><meta charset="utf-8"><title>Look sign-off</title><style>body{font-family:sans-serif;margin:16px}.pair{display:flex;gap:16px;align-items:flex-start}figure{margin:0}img{border:1px solid;max-width:100%}</style><h1>sportbet.lt and staging, side by side</h1>${sections.join('')}`,
);
console.log(`Open ${fileURLToPath(new URL('index.html', OUT))}`);
```

- [ ] **Step 2: Wire it**

In `apps/web/package.json`, in `scripts`, replace:

```json
    "test:e2e": "playwright test"
```

with:

```json
    "test:e2e": "playwright test",
    "look:signoff": "node look/signoff.ts"
```

In `apps/web/tsconfig.json`, replace:

```json
    "smoke",
```

with:

```json
    "smoke",
    "look",
```

In `.gitignore`, add after the `blob-report/` line:

```
# The look sign-off's screenshots (apps/web/look/signoff.ts): never committed.
look-signoff/
```

- [ ] **Step 3: Run it against a local server and look**

With Task 12 Step 10's `next dev` running (and its Postgres):

```bash
pnpm --filter @sportbet/web exec playwright install chromium
STAGING_URL=http://localhost:3000/ pnpm --filter @sportbet/web look:signoff
ls apps/web/look-signoff | wc -l
git status --short apps/web/look-signoff
```

Expected: `Open D:\Projects\sportbet_new\apps\web\look-signoff\index.html` (Node 24 runs the TypeScript directly); `9` files (8 screenshots and `index.html`); nothing from `git status` (ignored). Open the page and check each pair is the same view at the same size and theme.

- [ ] **Step 4: Verify and hand to the lead**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/web typecheck && echo ok
pnpm format:check 2>&1 | tail -1
```

Expected: `ok`; `All matched files use Prettier code style!` (Prettier skips `look-signoff/`, which `.gitignore` names).

Commit message:

```
feat(web): the look sign-off script, sportbet.lt beside staging (#15)

Both widths and both themes, screenshots side by side in a git-ignored
folder for the owner's sign-off.
```

---

### Task 16 (lead): The records

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/phase-2-inventory.md`, `docs/agent-team.md`

- [ ] **Step 1: README**

In `README.md`, replace:

~~~
Local settings for `next dev` go in `apps/web/.env.local`, never `.env`:
`next build` copies `.env` into the production server.
~~~

with:

~~~
Local settings for `next dev` go in `apps/web/.env.local`, never `.env`:
`next build` copies `.env` into the production server.

## The look

Every page sits in sportbet's shell (`apps/web/src/components/shell/`),
rebuilt in Tailwind 4 on sportbet's colour tokens
(`apps/web/src/app/tokens.css`), Lithuanian only (decision 13). Nothing loads
from another origin: Inter is self-hosted, the icons are inline SVG. To
compare the look with sportbet.lt at a phone's width and a desktop's, in both
themes:

```bash
pnpm --filter @sportbet/web exec playwright install chromium
pnpm --filter @sportbet/web look:signoff                            # against staging
STAGING_URL=http://localhost:3000/ pnpm --filter @sportbet/web look:signoff
```

It writes `apps/web/look-signoff/index.html` (git-ignored), each pair side by
side.

`ADSENSE_CLIENT` is set on production only (`ca-pub-7290396604686794`, set at
switch-over): with it, "Sutinku" on the cookie banner loads AdSense; without
it, nothing does. A value that is not `ca-pub-` and 16 digits stops the server
at start.
~~~

- [ ] **Step 2: CLAUDE.md**

In `CLAUDE.md`, under `## Code rules (decision 5, and the walking skeleton)`, add after the bullet that begins `- Pages only load data`:

```
- Colours exist only as the tokens in `apps/web/src/app/tokens.css`
  (sportbet's, light as the base and dark under `[data-theme='dark']`).
  Components use token utilities (`bg-rail`, `text-on-rail`) or
  `var(--color-...)`, never a literal, a palette class or a `dark:` variant;
  `apps/web/src/token-guard.test.ts` enforces it. The shell is told
  everything through `ShellView`; a navigation entry is added to
  `NAV_ENTRIES` only with its page. Text is Lithuanian, written in the
  components (decision 13).
```

- [ ] **Step 3: The inventory and the team doc**

In `docs/phase-2-inventory.md`, replace:

```
Cross-cutting from slice 4 onwards: every page ships both locales, and every slice extends the production-copy reader (slice 1) with the
```

with:

```
Cross-cutting from slice 4 onwards: every page is Lithuanian only (decision 13, which replaces "both locales"; slice 4 is split into 4a, the page shell, #15, and 4b and 4c), and every slice extends the production-copy reader (slice 1) with the
```

In `docs/agent-team.md`, replace:

```
- **No designer yet**: no spec sets a look for the new app. Add one when a
  slice's spec does.
```

with:

```
- **No designer yet**: the look is sportbet's own, rebuilt (decision 13,
  slice 4a). Add one when a redesign starts.
```

- [ ] **Step 4: Check and commit**

```bash
grep -n "## The look" README.md
grep -n "token-guard.test.ts" CLAUDE.md
grep -c "Lithuanian only (decision 13" docs/phase-2-inventory.md
grep -n "the look is sportbet's own" docs/agent-team.md
pnpm format:check 2>&1 | tail -1
```

Expected: one line each; `1`; `All matched files use Prettier code style!` (Markdown is in `.prettierignore`).

Commit message:

```
docs: the page shell - README, the colour rule, Lithuanian only (#15)
```

---

### Task 17 (lead): Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
git status --short | wc -l
```

Expected: `Done`; `All matched files use Prettier code style!`; lint silent, `4`; `3`; unit and db as at the gate; component `23 passed (23)` files and `104 passed (104)` tests; feature 4 tests more than the gate; `0`. (`pnpm test:migrate` is untouched by this slice; run it only if nothing else on this PC is running it - `docs/agent-team.md`.)

- [ ] **Step 2: Review.** Run the `mp-code-review` skill against `<gate>..HEAD` (Task 0's commit) (Standards and Spec, the spec being `docs/superpowers/specs/2026-10-05-page-shell-design.md`) and fix what it confirms, each fix its own commit ending with the same trailer and `#15`, re-running Step 1 after the last. This is a new feature, so also run `improve-codebase-architecture` over `apps/web/src/components/shell/`, `apps/web/src/app/` and `apps/web/src/env.ts`, present its report to the owner, and act on no candidate unless the owner picks one. Ask `security-reviewer` to look at `cookie-consent.tsx` (a third-party script after consent), `theme-script.tsx` (inline script) and `env.ts`.

- [ ] **Step 3: Push, and watch the run to the end**

```bash
git push origin main
sleep 10
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: the run succeeds: `check`, `image` (with `public/`), `e2e` (the shell spec on this commit's images), `staging` and `smoke` (the shell spec again, against staging). If a job fails, read it with `gh run view "$run" --log-failed`, fix the cause, commit and push again; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #15.** Comment with the green run's link, the test counts per suite, and the design decisions at the top of this plan; tick the criteria that now hold ("player shell's components exist", "no script, stylesheet or font from outside", "token guard passes", "all CI suites pass") with their evidence. Leave #15 open for Task 18.

---

### Task 18 (the owner, with the lead): The look sign-off

- [ ] **Step 1: The lead takes the screenshots of staging**

```bash
pnpm --filter @sportbet/web look:signoff
```

Expected: `Open ...\apps\web\look-signoff\index.html`, eight screenshots.

- [ ] **Step 2: The instruction the lead sends (one step)**

> The new app's shell is on staging. Please open `D:\Projects\sportbet_new\apps\web\look-signoff\index.html` in your browser: it shows sportbet.lt and staging side by side, at a phone's width and a desktop's, in light and dark. The pages' content differs (staging has only the placeholder list); compare the frame around it - the rail, the phone bar, the colours, the logo, the cookie banner. Tell me "matches", or what differs.

- [ ] **Step 3: Close #15** once the owner says it matches (tick the first criterion, quoting the answer). Each difference the owner names becomes a fix on this plan's files, verified as in Task 17 Step 1, pushed, and a new sign-off from Step 1.

---

## Open questions for the owner

None. Settled by the lead from the spec and decision 13 while this plan was written:

1. **The cookie banner has no privacy link until `/privacy` exists** (slice 18): the shell never links to a missing page, and ads run only on production, which runs the new app only after `/privacy` exists.
2. **The walking-skeleton pages are translated in 4a** (Task 12b; decision 13). Two strings have no sportbet original and are this plan's own wording, for the owner to see: "Puslapis nerastas" (was "Not found") and "Formatas:" (was "Format:"). The rest are sportbet's: "Turnyrai", "← Turnyrai" (`lang/lt.json`) and "Turnyrų kol kas nėra" (`tournaments/hub.blade.php`).
3. **4b lists each player link only once its page exists**, through the same entries mechanism (design decision 6).

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Tailwind 4 in `apps/web`, configured in CSS; tokens as `@theme` variables, light on `:root`, dark on `:root[data-theme="dark"]`, sportbet's names minus `sb-`; components use token utilities only | 1 (tokens, globals), every component task |
| A token guard: no hex, `rgb(`, `hsl(` outside the token file; no palette colour in a component | 1 |
| Inter through `next/font/google`, self-hosted | 2 |
| Theme script in `<head>`: `data-theme` from `localStorage['sb-theme']` before the first paint, light by default, storage read inside a try | 2 (test runs the script), 14 (E2E) |
| Every colour token, both themes, radii | 1 (guard checks the full list and the flipping set) |
| Icons as inline SVG from Bootstrap Icons' paths | 3 |
| `public/img/logo.png`, `logo.svg`, `favicon.png`, `favicon-180.png`, `favicon.svg`, `favicon-512.png`, `favicon.ico` | 2 (copied, object ids checked), 13 (in the image) |
| Breakpoints: rail from 992px, phone header and bottom tabs below | 1 (Bootstrap breakpoints), 8, 9, 10, 14 |
| Components `Shell`, `GuestRail`, `PlayerRail` (`RailTournament`, `RailAccount`), `PhoneHeader`, `BottomTabs`, `NavBadge`, `CookieConsent`, `Icon`, each with component tests | 3, 5-12 |
| Client components only where a browser is needed: phone menu, league drop-up, badge tips, cookie consent | 5 (`NavBadge`), 6, 9 (`PhoneMenu`), 11; plus `NavLink` (design decision 2) |
| `ShellView` as specified; no component reads a session or the database; the guest view in 4a | 4, 12 (layout) |
| One entry list (label, path, icon, badge, when shown); an entry only once its page exists; "Turnyrai" (`/`) in 4a | 4 (with the page-exists test) |
| Cookie consent in `localStorage['sb_cookie_consent']` (`accepted` / `declined`); AdSense only after accept and only with `ADSENSE_CLIENT` | 11 (component and startup tests), 14 |
| Nav badges as hidden placeholders with the same `data-missing` names | 5, 8, 9, 10 |
| Lithuanian text copied from sportbet's partials; `<html lang="lt">`; no English left (decision 13) | 2, 5-11, 12 (feature test), 12b (the skeleton pages), 14 |
| Left behind: jQuery, Popper, Bootstrap CSS and JS, Alpine, Chart.js, Material Icons, CDN loads, `custom.css`, the icon font, the rehearsal banner, the locale switch, `/nav/missing` | none of them is added; 12 (feature test: no external `src`/`href`), 14 (no request elsewhere) |
| Component tests: guest and player variants, admin link only for an admin, survival and summary by their flags, badges hidden at 0 and shown with a count, league drop-up only with more than one league, consent hidden after an answer | 4 (flags), 5 (badges), 6, 7 (admin), 8, 9 (admin), 10 (league tab), 11 (consent), 12 (flags and admin through the whole shell) |
| E2E at 390px and 1280px: rail on desktop, header on phone, no horizontal scroll, theme from `sb-theme`, consent remembered, no request to any CDN | 14 |
| Look sign-off script: sportbet.lt and staging, both widths, both themes, side by side, not committed | 15, 18 |
| Done: every page on staging in the guest shell (owner's sign-off); player shell exists, tested, unused; no script or stylesheet from outside; token guard and every suite pass in CI | 12, 17, 18 |
| Out of scope: sign-in, request context, flags' rules (4b); registration (4c); the theme setting (17); `/nav/missing` and real counts (6); the admin layout; the head-to-head modal; English | not in any task |

Where the plan departs from the spec's letter, the reason is in "Design decisions this plan makes": the view is built per request in the layout (1), `NavLink` is a client component (2), the cookie banner's privacy link waits for `/privacy` (9).
