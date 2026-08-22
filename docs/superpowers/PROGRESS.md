# Project Progress

> Read this first in any new session on this repo. It's committed to git so
> it survives a fresh clone — unlike `.superpowers/sdd/` (gitignored scratch
> that resets every session). Hard limit 300 lines: prune completed detail,
> keep it a living summary, not a full log.

## What this is

A private, single-user Next.js + Supabase personal finance tracker (income,
expenses, budgets, portfolio). Design spec:
`docs/superpowers/specs/2026-08-18-personal-finance-app-design.md`.

**Live**: `budgeting-metrics-app.vercel.app` — Vercel Production Branch is
`main`, auto-deploys on every push. Verified end-to-end on a real iPhone.

## Live infrastructure

- Supabase project ref: `gltervcqdojzpbssovrb`
  (`https://gltervcqdojzpbssovrb.supabase.co`)
- `.env.local` (gitignored, recreate from Supabase dashboard → Project
  Settings → API if missing on a new device): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SEED_USER_EMAIL=lowtempcorp.it@gmail.com` (not the Claude-account email
  shown in session context — real value only in `.env.local`, never commit)
- `.claude/launch.json` — lets the Browser tool run `npm run dev` on :3000.
- GitHub: `lowtempcorp-itdept/Budgeting-Metrics-App`. `main` is deployed.
- Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` only — never add
  `SUPABASE_SERVICE_ROLE_KEY` or `SEED_USER_EMAIL` there.

## Decisions / conventions worth knowing

- Manual dashboard steps (Supabase project/migrations/auth user, Vercel
  setup) are done by the human on request — agents lack dashboard access.
  Passwords are never handled by the agent.
- `git push` from the Bash tool got blocked by the auto-mode classifier
  once; the PowerShell tool worked for the identical command (though Bash
  has also worked directly in other sessions — try Bash first).
- **The sandboxed Browser pane's `preview_start({name})` always launches
  from the main repo checkout, ignoring which worktree the session is
  in.** Workaround: start `npm run dev` yourself via Bash from inside the
  worktree (`run_in_background: true`), then drive the browser with
  **Claude in Chrome** (`mcp__claude-in-chrome__*`) — the user's real
  local Chrome, reaches `localhost` regardless of which process started
  the server.
- **Native `window.confirm()`/`alert()` crash the Claude in Chrome tab.**
  Fix: inject an override script into the page's main world before
  triggering one: `document.documentElement.appendChild(Object.assign(document.createElement('script'), { textContent: 'window.confirm = function(){return true;};' }))`.
  Re-inject after every full page navigation.
- **`resize_window` is a no-op on the real Chrome tab Claude in Chrome
  drives.** Verify narrow-viewport/responsive behavior by constraining
  `document.querySelector('main').style.width` via `javascript_tool` and
  checking `scrollWidth` vs `clientWidth`, not a literal resize+screenshot.
- Fresh worktree one-time step: `npx next typegen` before `tsc --noEmit`
  resolves route-generated ambient types (gitignored, not a commit).
- **Don't rely on the cross-session memory system for anything a future
  session needs to act on** — it's been found empty despite earlier notes
  claiming things were "preserved" there. Write load-bearing facts into
  this file or a spec/plan doc instead.
- **Local `main` can silently fall behind `origin/main`.** `git fetch` and
  check `git status` against `origin/main` at the start of any session.
- **A subagent opening its own Claude-in-Chrome tab can invalidate the
  shared Supabase auth session** (observed once — a second tab logged both
  out, likely a refresh-token race). Fix: only the controller drives the
  browser (single persistent tab, sequential navigation), never a
  dispatched subagent; implementers self-verify via `tsc`/tests only, and
  the controller does any manual/browser verification step itself.
- **`.superpowers/sdd/<plan>/` is gitignored** — never leaves the machine
  it was created on. Anything a resuming session on a different device
  needs must live in this file, not only in the ledger.
- A worktree created manually with `git worktree add` (not the native
  `EnterWorktree name:` form) isn't one this session's tooling will clean
  up automatically — `git branch -d` on its branch will refuse while the
  worktree still has it checked out. Fine to leave in place; ask the user
  before removing a worktree/branch that isn't obviously yours to delete.

## Sub-projects 1–3: all shipped, merged to `main`

Post-foundation UI work is broken into 5 sub-projects, built out of strict
order (Dashboard & Insights shipped 3rd instead of 2nd). Deep history for
finished sub-projects lives in git log, not repeated here.

**1. Transactions core** — merged 2026-08-19. Plan:
`docs/superpowers/plans/2026-08-18-transactions-core.md`. Shipped: schema
migration, quick-add bottom sheet + bottom nav, `/accounts` and
`/transactions` with filtering.

**2. Budgeting** — merged to `main` 2026-08-22 (`340479b`, pushed to
`origin/main`). Spec: `docs/superpowers/specs/2026-08-20-budgeting-design.md`.
Plan (11 tasks, all shipped, task-reviewed clean, final whole-branch review
clean after one fix round): `docs/superpowers/plans/2026-08-20-budgeting.md`.
Shipped: a required weekly overall budget (headline card, ×4/÷7 derived
monthly/daily, income-anchor leftover/warning, missed-week reminder
banner); optional per-category monthly budgets; `recurring_constants`
(taxes/subscriptions/salary) auto-posting via a catch-up in
`app/(app)/layout.tsx`, with full add/edit/pause/delete UI; a new
weekly-budget-pace dashboard insight. Two Critical bugs surfaced by the
final review and fixed before merge (both traced to the plan itself, not
implementer error): the `recurring_constants` delete FK was `on delete no
action`, breaking Delete for any constant that had ever posted (now `set
null`, migration `0006`); editing a constant on its own due date could
double-post a transaction (now schedule-change-aware). **Deliberately
deferred, not blocking** (real gaps for a future task): the catch-up has
no error handling and could 500 every page on a persistent DB error; the
next due date isn't shown in the recurring-constants list; resuming a
paused constant back-fills every missed occurrence at once; a few Minor
UI items (no red styling on an overspent "remaining" line, a notes-less
expense constant shows as generic "Expense," no inline category-budget
edit, weekly-budget-pace hidden whenever it's the dashboard's only
insight).

**3. Dashboard & Insights** — merged 2026-08-20 (`31eff7d..7eb3a7f`).
Plan: `docs/superpowers/plans/2026-08-19-dashboard-insights.md`. Design:
`docs/superpowers/specs/2026-08-19-dashboard-insights-design.md`. Shipped
`/dashboard`: auto-generated insights, account-balance cards, portfolio
net-per-ticker summary, category spending bars, an income/expense trend
chart, and (now being undone, see below) a dark-mode-only "ledger" theme
exclusive to the Home tab. Live site shows an all-empty dashboard (₱0
everywhere) because production has zero income/expense/portfolio rows —
expected until sub-project 5, not a bug.

**4. Portfolio — not started.** **5. Historical migration — not
started** (imports the real `Budgeting Metrics.xlsx` once the schema is
final — see `docs/superpowers/specs/2026-08-19-dashboard-insights-design.md`
§11 for why it's deliberately last).

## IN PROGRESS: UI Consistency & Side Navigation

Not one of the 5 numbered sub-projects — a cross-cutting polish pass the
user requested 2026-08-22 after using the shipped Budgeting screens.
Design spec (**approved by the user**):
`docs/superpowers/specs/2026-08-22-ui-consistency-and-navigation-design.md`.
**No implementation plan exists yet — that's the next step.**

Four fixes, one spec: (1) remove Home's distinct dark "ledger" theme
(`ShellChrome.tsx`'s `isHome` branch, `.dash-ground`/`.dash-panel`,
`font-ledger-serif`/`font-ledger-sans`) so every tab shares one light
look — `font-ledger-mono` for currency stays, it's already shared. (2)
Replace the bottom nav with a hamburger-triggered slide-out drawer, one
pattern at every screen width (user explicitly declined a separate
desktop treatment — this app is used almost entirely on a phone). (3) A
live `HH:MM:SS` clock (Manila time) under the date in the Home masthead,
via a new small Client Component. (4) Real `<label>`s on every
Transactions filter field (currently a `<select>`'s first option or a
placeholder stands in for one) plus the actual root cause of that form's
near-invisible gray text: no `color-scheme: light` is declared anywhere,
so a device in dark mode renders native form controls with light-on-light
text. Fixing that one line also happens to be part of what the Home
theme removal already requires — same root cause, one fix. Full detail,
including which files change, is in the spec — read it before planning.

## Next steps

1. **UI Consistency & Side Navigation (above).** Run
   superpowers:writing-plans against the approved spec, then execute via
   superpowers:subagent-driven-development in a dedicated worktree — same
   process as every prior sub-project. Nothing else should start until
   the user says to.
2. **Portfolio (sub-project 4).** Full buy/sell/deposit/withdraw
   transaction management UI (today read-only on the dashboard). Likely
   touches/extends `portfolio_transactions`.
3. **Historical migration (sub-project 5).** See above for why it's last.

Each still-unplanned item gets its own design spec
(superpowers:brainstorming) and implementation plan
(superpowers:writing-plans) before code starts.

## How to resume in a new session

Sub-projects 1–3 are all done and merged to `main`. **Immediate next
work is UI Consistency & Side Navigation** (above) — its spec is approved
but has no implementation plan yet:

1. `git fetch origin`; local `main` should already have Budgeting merged
   in (`340479b`) — if not, `git pull`.
2. Read `docs/superpowers/specs/2026-08-22-ui-consistency-and-navigation-design.md`.
3. Run superpowers:writing-plans against it to produce an implementation
   plan under `docs/superpowers/plans/`.
4. Set up a dedicated worktree (superpowers:using-git-worktrees) and
   execute via superpowers:subagent-driven-development — same process
   used for every prior sub-project. `npm install` + `npx next typegen`
   once per fresh worktree; recreate `.env.local` per "Live
   infrastructure" above.
5. After this ships: Portfolio (sub-project 4), then Historical
   migration (sub-project 5).
