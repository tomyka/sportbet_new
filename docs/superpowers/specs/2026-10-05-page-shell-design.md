# Slice 4a: the page shell

Slice 4 of `docs/phase-2-inventory.md` (auth, request context, layout shell)
is split in three, each its own spec -> plan -> code cycle:

- **4a, this spec:** the page shell - the frame every page sits in.
- **4b:** accounts, code sign-in, sign-out, throttles, request context (who,
  which tournament, which round), and the reader extension for accounts.
- **4c:** two-step registration and Google sign-in, paired with slice 5's
  tournament registration.

Decision 13 (`docs/decisions.md`) binds it: the old look, rebuilt in
Tailwind on sportbet's colour tokens; Lithuanian only.

## Goal

Every page of the new app sits in sportbet's shell, looking as sportbet does
today at commit `1ac955f` (what production runs), with none of sportbet's
front-end legacy. A visitor sees the whole guest shell on staging. The
signed-in shell is built and tested, and switched on by 4b.

## What sportbet's shell is (the reference)

From `D:\Projects\sportbet` at `1ac955f`:

- `resources/views/layouts/master.blade.php` and the partials
  `rail`, `rail-guest`, `rail-tournament`, `rail-account`, `header`,
  `bottom-nav`, `cookie-consent`, `components/nav-badge`.
- `public/css/custom.css`: the `sb-*` classes and the colour tokens - dark
  values on `:root` (`:28-161`), light overrides on
  `:root[data-theme="light"]` (`:163-211`), rail tokens `--sb-rail*`,
  radius 8px / 4px, layout `.sb-container` (max 1280px, 20px padding),
  `.sb-main` (72px bottom padding plus safe area below 992px).
- Inter (400-800), Bootstrap Icons 1.11.1, `public/img/logo.png`,
  `logo.svg`, `favicon.png`, `favicon-180.png`, `favicon.svg`,
  `favicon-512.png`, `favicon.ico`.
- Behaviour: light theme by default, dark when `localStorage['sb-theme']`
  is `dark`, set before first paint; cookie consent in
  `localStorage['sb_cookie_consent']` (`accepted` / `declined`), where
  accepting loads AdSense `ca-pub-7290396604686794`.

## What is ported, and what is left behind

| Ported | Left behind |
|---|---|
| The shell's markup structure, spacing, breakpoints (rail from 992px, phone header and bottom tabs below) | jQuery, Popper, Bootstrap 5.0.1 CSS and JS, Alpine, Chart.js on every page, Material Icons, all CDN loads |
| Every colour token, both themes, radii, the Inter font | `custom.css` itself and its re-skin of Bootstrap components |
| The icons the shell uses, as inline SVG from Bootstrap Icons' paths | The `bi bi-*` icon font |
| Theme: light default, `sb-theme` honoured before first paint | The rehearsal banner (C22) |
| Cookie consent and, on production only, AdSense after "accept" | The locale switch, English, `lang/*.json` (decision 13) |
| Nav badges as hidden placeholders with the same `data-missing` names | The `/nav/missing` refresh (lands with slice 6) |

The admin layout (`admin/layouts/master`) is not in 4a; it comes with the
admin slices (13, 14).

## Design

### Styling

- **Tailwind 4** in `apps/web`, configured in CSS. The tokens become CSS
  variables under `@theme`: the light set on `:root`, the dark set on
  `:root[data-theme="dark"]`, with the same names as sportbet's minus the
  `sb-` prefix (e.g. `--color-accent`, `--color-rail`). Components use only
  token utilities (`bg-rail`, `text-accent`), never a raw colour.
- **A token guard** in the component tests, like sportbet's
  `CssTokenGuardTest`: no hex, `rgb(` or `hsl(` colour outside the token
  file, and no Tailwind palette colour (`bg-orange-500`) in any component.
- **Inter** through `next/font/google` (self-hosted at build, no request to
  Google at run time).
- **Theme script:** a few inline lines in `<head>` set `data-theme` from
  `localStorage['sb-theme']` before first paint, defaulting to light; it
  reads storage inside a try, so a blocked storage still renders light.
  Changing the theme is a profile setting (slice 17), not part of the shell.

### Components (`apps/web/src/components/shell/`)

Pure components with props; each has component tests. Markup only, as the
code rules require.

- `Shell` - the frame: rail (desktop) or header and bottom tabs (phone),
  `main` with the container, cookie consent. Takes a `ShellView` and the
  page.
- `GuestRail`, `PlayerRail` (with `RailTournament`, `RailAccount`),
  `PhoneHeader` (guest pills, or the player's menu), `BottomTabs`,
  `NavBadge`, `CookieConsent`, `Icon`.
- Client components only where a browser is needed: the phone menu's
  open/close, the league drop-up, tooltips on badges, cookie consent. Each is
  a small React component; nothing else ships script.

### What the shell is told: `ShellView`

One typed view, built per request on the server and passed down; no
component reads a session or the database.

```ts
type ShellView = {
  player: { name: string; initials: string; isAdmin: boolean } | null;
  tournament: { name: string; slug: string } | null;
  nav: { survival: boolean; summary: boolean; survivalSummary: boolean };
  badges: { results: number; standings: number; survival: number; invites: number };
  leagues: { current: string; others: { id: number; name: string }[] } | null;
};
```

In 4a every page builds the guest view (`player: null`, nav flags false,
badges 0). 4b builds the player's view from the request context; the rules
behind the flags (sportbet's `NavVisibility`) are 4b's.

### Navigation entries

The rail, phone menu and bottom tabs read one list of entries (label, path,
icon, badge, when shown). An entry is listed only once its page exists in
the new app, so the shell never links to a 404: in 4a that is "Turnyrai"
(`/`). Each later slice adds its entries (and "Prisijungti" arrives with 4b).

### Cookie consent and ads

The banner shows until the visitor accepts or declines, and remembers the
answer in `localStorage['sb_cookie_consent']`, as sportbet does. On accept
it loads AdSense only when `ADSENSE_CLIENT` is set; it is set on production
only, so staging and tests never load an ad.

### Text

Lithuanian, written in the components, copied from sportbet's shell
partials (their `lt.json` values). `<html lang="lt">`.

## Testing

- **Component tests** for each shell part: guest and player variants, admin
  link only for an admin, survival and summary entries by their flags,
  badges hidden at 0 and shown with a count, league drop-up only with more
  than one league, cookie consent hidden after an answer. They follow
  sportbet's `RailNavigationTest`, `ShellNoRailLayoutTest`,
  `NavPredictionBadgeTest`, `BottomNavLeagueTabTest`.
- **The token guard** (above).
- **E2E (Playwright):** the guest shell at 390px and 1280px wide: rail on
  desktop, header on phone, no horizontal scroll (sportbet's
  `LayoutOverflowRegressionTest`), theme from `sb-theme`, consent
  remembered, no request to any CDN.
- **Look sign-off:** a script takes screenshots of the same guest page on
  sportbet.lt and on staging at both widths and both themes, side by side.
  The owner signs off that they match; the screenshots are not committed.

## Done means

- Every page on staging sits in the guest shell, matching sportbet's at
  both widths and both themes (owner's sign-off on the screenshots).
- The player shell's components exist, tested, unused until 4b.
- No script or stylesheet loads from outside the app; the token guard and
  every test suite pass in CI.

## Out of scope

Sign-in, the sign-in dialog, the request context and the flags' rules (4b);
registration and Google (4c); the theme setting (17); `/nav/missing` and
real badge counts (6); the admin layout (13, 14); the head-to-head modal
(11); English (decision 13).
