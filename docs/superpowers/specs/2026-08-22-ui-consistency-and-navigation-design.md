# UI Consistency & Side Navigation — Design

**Date:** 2026-08-22
**Status:** Approved for planning

## 1. Purpose

Not a new sub-project in the 5-sub-project sequence (Transactions core,
Budgeting, Dashboard & Insights, Portfolio, Historical migration) — a
cross-cutting UI polish pass requested by the user once Budgeting shipped,
fixing three things that surfaced from actually using the live app:

1. The Home tab (`/dashboard`) looks and feels like a different app from
   the other four tabs — a deliberately distinct dark "ledger" theme with
   custom serif/sans fonts, built during the Dashboard & Insights
   sub-project. The user wants one consistent look across the whole app.
2. The bottom tab bar is hard to see/use and should move to the side —
   queued explicitly in `docs/superpowers/PROGRESS.md` since 2026-08-20,
   deferred until Budgeting shipped so it wouldn't collide with Budgeting's
   own regression check that the bottom nav stays present.
3. The Transactions filter form's fields have no visible labels (a
   `<select>`'s first option or an `<input>`'s placeholder stands in for
   one) and render in barely-visible light gray text — confirmed by a
   screenshot the user attached showing every field's text nearly
   invisible against its white background.

Plus one small addition: a live `HH:MM:SS` clock under the date in the
Home masthead.

## 2. Scope

In scope: removing Home's distinct dark theme so every tab shares one
visual language; replacing the bottom nav with a hamburger-triggered
slide-out drawer (same pattern on every screen size, not a different
treatment for desktop); a live per-second clock on the Home masthead;
labeling every Transactions filter field and fixing the underlying
contrast bug so form text is always legible regardless of the device's
light/dark preference. Out of scope: any new functionality on the pages
themselves (Transactions filtering logic, Home's insights/KPIs/charts,
etc. — this pass only touches how things look and how navigation works),
and Portfolio/Historical migration (unrelated, unstarted sub-projects).

## 3. Root cause: the contrast bug and the theme removal are the same fix

`app/globals.css` sets `--foreground: #ededed` (near-white) under
`@media (prefers-color-scheme: dark)`, and nothing in the app declares
`color-scheme: light`. On a device with a dark OS/browser preference,
browsers render native form-control chrome (the widget itself, and often
its text) assuming a dark surface unless `color-scheme` says otherwise —
so `<input>`/`<select>` elements with no explicit text color can render
near-white text, which is what the user's screenshot shows: every
Transactions filter field's text is barely visible against its actual
white background.

Home was the only screen ever designed to be intentionally dark. Once
Home is unified with the rest of the app (§4), nothing in this app is
meant to render dark, so the fix for both problems is the same: delete
the `prefers-color-scheme: dark` block from `globals.css` and add
`color-scheme: light` to `:root`, so every native form control always
renders with light chrome (dark-on-light text) regardless of device
preference. Every input/select additionally gets an explicit
`text-slate-900` class — belt-and-suspenders, matching the rest of the
app's forms, so no field's legibility ever again depends on an inherited
or native default.

## 4. Home page — visual consistency

Remove `ShellChrome.tsx`'s `isHome` branch entirely — one header/main/nav
background for every route (`bg-slate-50`/`bg-white`/`border-slate-200`,
the look every other tab already has). Every dashboard subcomponent
(`Masthead`, `HeroKpis`, `InsightsPanel`, `AccountCardsRow`,
`PortfolioSummary`, `CategoryBars`, `TrendChart`) drops the
`.dash-ground`/`.dash-panel` classes and the `font-ledger-serif`
(Fraunces) / `font-ledger-sans` (Work Sans) custom fonts, restyled with
the same white-card/slate-border/default-system-font look used on
Budget/Transactions/Portfolio/Accounts. `font-ledger-mono` (IBM Plex
Mono) stays — it's already the shared convention for currency figures
across Budget/Transactions, not something distinct to Home. The existing
motion system (staggered fade-in on load, count-up numbers) is
unaffected — this pass only changes color and typography, not motion.
Once nothing references `.dash-ground`/`.dash-panel`/`.dash-enter`/the
`fraunces`/`workSans`/`ibmPlexMono` font loaders, delete them from
`globals.css` and `app/(app)/dashboard/fonts.ts` as dead code.

## 5. Navigation — hamburger + slide-out drawer

Replace `ShellChrome.tsx`'s sticky bottom `<nav>` with a single
hamburger-triggered drawer, used identically at every viewport width
(the user confirmed one pattern everywhere rather than a separate desktop
treatment, since this app is used almost entirely on a phone). A
hamburger icon button sits at the header's left; tapping it slides a
panel in from the left, listing the same five destinations (Home,
Transactions, Budget, Portfolio, Accounts) as labeled rows (icon +
name — icons are a nice-to-have here, not required if a clean set isn't
readily available; text labels are the requirement). Tapping a row
navigates and closes the drawer; tapping the dimmed backdrop behind it,
or a close control in the drawer's own header, also closes it without
navigating. The active route's row is visually distinguished the same
way `NavLink.tsx` already distinguishes the active tab today (bold,
`aria-current="page"`). `NavLink.tsx`'s `isDark` prop is deleted along
with Home's dark theme — there is only one visual state to render now.

State (drawer open/closed) lives in `ShellChrome.tsx`, which is already a
Client Component (`usePathname()`). Closing on navigation means the
drawer's open state must reset when `pathname` changes — a `useEffect`
keyed on `pathname` is the natural place for that, matching how this
codebase already reacts to route changes elsewhere.

## 6. Live clock on Home

A small new Client Component (e.g. `app/(app)/dashboard/LiveClock.tsx`)
renders a `HH:MM:SS` string that ticks every second via
`setInterval`, formatted in `Asia/Manila` time (matching every other date
in this app — see `lib/date.ts`) regardless of the device's own
timezone. Rendered inside `Masthead.tsx`, directly under `{today}` and
above `Day {dayOfMonth} of {daysInMonth}`. To avoid a server/client
hydration mismatch (the server can't know the exact client-side instant),
the component starts with no rendered time and fills in the first tick
after mount — the standard pattern for a live clock in a
server-rendered React tree.

## 7. Transactions filter — labeled fields

Restructure the filter `<form>` in `app/(app)/transactions/page.tsx` so
every field is a `<label>`-wrapped block — visible label text above its
control ("Date", "Type", "Account", "Category", "Search"), not a
placeholder or a select's first option standing in for one — matching
the layout the user sketched (label, then the box, per field, one after
another). The 2-column grid layout stays; only the "select's first
option is the label" and "placeholder is the label" conventions go away
in favor of real labels. Every input/select gets an explicit
`text-slate-900` (label text: `text-slate-600`, matching this app's
existing secondary-text convention), on top of the `color-scheme: light`
fix in §3 — so this is fixed twice over, once at the root cause and once
per-field.

## 8. Testing

None of this touches business logic, derived values, or server actions —
it's markup, class names, and one small piece of client-side UI state
(drawer open/closed) plus one client-side ticking clock. No new unit
tests are needed; verification is a manual pass in the browser (both the
existing full-suite regression and a walkthrough of every tab's look,
the drawer opening/closing/navigating on a phone-width viewport, and the
clock actually ticking).

## 9. Out of scope

- Any new functionality (this is a look-and-navigation pass only).
- A distinct desktop nav treatment (explicitly declined in favor of one
  pattern everywhere).
- Icons for the drawer's five rows, if a clean icon set isn't readily
  available — text labels alone satisfy the requirement.
- Portfolio (sub-project 4) and Historical migration (sub-project 5) —
  unrelated, unstarted, proceed only when the user says to.
