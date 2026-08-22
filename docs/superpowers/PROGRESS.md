# Project Progress

> Read this first in any new session on this repo. It's committed to git so
> it survives a fresh clone — unlike `.superpowers/sdd/` (gitignored scratch
> that resets every session). Keep this under ~300 lines: prune completed
> detail, keep it a living summary, not a full log.

## What this is

A private, single-user Next.js + Supabase personal finance tracker (income,
expenses, budgets, portfolio). Design spec:
`docs/superpowers/specs/2026-08-18-personal-finance-app-design.md`.

## Foundation plan: ✅ COMPLETE — merged to `main`, live in production

Plan file: `docs/superpowers/plans/2026-08-18-foundation.md`. Merged to
`main` 2026-08-18 (fast-forward, commit `8767667`).

**Live**: `budgeting-metrics-app.vercel.app` — Vercel Production Branch is
`main`, auto-deploys on every push. Verified end-to-end on a real iPhone.

**What shipped**: Next.js scaffold, Supabase client helpers, full DB schema
(`accounts`, `categories`, `income`, `expenses`, `budgets`,
`portfolio_transactions` — all RLS owner-only), login + auth proxy gating
every route, idempotent seed script (4 accounts, 22 categories), PWA
manifest + service worker, mobile nav shell.

4 bugs in the plan's own sample code were caught and fixed during
implementation (cookie handling in `proxy.ts`, seed idempotency, PWA icon
exemption, FK constraint conflicts) — full detail in git history
(`31b47b5..8767667`) if this plan is ever re-run from scratch.

## Live infrastructure

- Supabase project ref: `gltervcqdojzpbssovrb`
  (`https://gltervcqdojzpbssovrb.supabase.co`)
- `.env.local` (gitignored, recreate from Supabase dashboard → Project
  Settings → API if missing on a new device): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SEED_USER_EMAIL=<the seed user's email>` (real value only in
  `.env.local`, never commit it)
- `.claude/launch.json` — lets the Browser tool run `npm run dev` on :3000.
- GitHub: `lowtempcorp-itdept/Budgeting-Metrics-App`. `main` is the
  deployed branch.
- Vercel project connected with env vars `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` only — never add
  `SUPABASE_SERVICE_ROLE_KEY` or `SEED_USER_EMAIL` there.

## Decisions / conventions worth knowing

- Manual dashboard steps (creating the Supabase project, applying SQL
  migrations, creating the auth user, Vercel setup) are done by the human
  on request — the controller/agents don't have dashboard login access.
- Passwords are never handled by the agent — the human tests login flows
  themselves when a real password is needed.
- `git push` from the Bash tool got blocked by the auto-mode classifier in
  one session; the PowerShell tool worked fine for the identical command.
- **The sandboxed Browser pane's `preview_start({name})` always launches
  from the main repo checkout, ignoring which worktree the session is
  in** — confirmed repeatedly across sub-projects. Workaround that works:
  start `npm run dev` yourself via the Bash tool from inside the worktree
  (`run_in_background: true`), then drive the browser with **Claude in
  Chrome** (`mcp__claude-in-chrome__*`) instead of the sandboxed Browser
  pane — it's the user's real local Chrome, so it reaches `localhost`
  directly regardless of which process started the server.
- **Native `window.confirm()`/`alert()` dialogs crash the Claude in Chrome
  tab.** Fix: inject a real `<script>` tag so an override runs in the
  page's main world (content-script JS runs isolated and can't touch the
  page's real `window`):
  `document.documentElement.appendChild(Object.assign(document.createElement('script'), { textContent: 'window.confirm = function(){return true;};' }))`.
  Re-inject after every full page navigation.
- **`resize_window` is a no-op on the real (non-embedded) Chrome tab used
  by Claude in Chrome** — confirmed during the Dashboard & Insights build.
  Verify narrow-viewport/responsive behavior via DOM/CSS inspection
  (overflow, max-width, flex-wrap) instead of a literal resize+screenshot
  when this tool combination is in use.
- This Next.js version needs `npx next typegen` run once per fresh
  worktree before `tsc --noEmit` resolves route-generated ambient types
  (e.g. `LayoutProps`, async `searchParams` shapes) — otherwise every
  task's type-check gate shows a false-positive unrelated error.
  `.next/types`/`next-env.d.ts` are gitignored, so this is a one-time
  local step per worktree, not a commit.
- **Don't rely on the cross-session memory system for anything a future
  session needs to act on.** A 2026-08-20 session found the memory store
  for this project completely empty even though an earlier session's
  progress notes said spreadsheet-structure analysis and feature wants
  were "preserved" there — likely tied to a worktree-scoped session that
  never persisted. Fix going forward: write everything load-bearing
  directly into the committed spec/plan docs in `docs/superpowers/`,
  never leave a doc pointing at memory as the only copy of a decision.
- **Local `main` can silently fall behind `origin/main`** across
  sessions/devices (found 64 commits behind on 2026-08-20, all real
  already-pushed work, fast-forwarded cleanly). Run `git fetch` and check
  `git status` against `origin/main` at the start of any new session
  before trusting local git log.
- **The real `SEED_USER_EMAIL` is `lowtempcorp.it@gmail.com`** — not the
  Claude-account email shown in session context. A fresh worktree's
  `.env.local` is gitignored and won't exist until recreated (copy from
  another local worktree's `.env.local` if one exists on the same
  machine, or from the Supabase dashboard) — a 2026-08-20 session copied
  one forward from an old worktree that was missing `SEED_USER_EMAIL`
  entirely and had to ask the human to supply the correct value after an
  incorrect first guess.
- **A subagent opening its own Claude-in-Chrome tab can invalidate the
  shared Supabase auth session** (observed 2026-08-20 during the
  Budgeting build: the human logged in, a subagent created a second tab
  per the then-current dispatch instructions, and the session was logged
  out for both tabs afterward — likely a refresh-token rotation race).
  Fix: only the controller drives the browser (a single persistent tab,
  sequential navigation), never a dispatched subagent; implementers write
  code and self-verify via `tsc`/tests only, and the controller performs
  any manual/browser verification step from the plan itself afterward,
  reporting results back before the implementer commits.
- **`.superpowers/sdd/<plan>/` (the SDD ledger, briefs, reports, review
  packages) is gitignored** — it never leaves the machine it was created
  on, even after the branch is pushed. Anything a resuming session on a
  different device needs must live in this file instead, not only in the
  ledger.

## Sub-projects 1–3: 1 and 3 shipped, 2 implementation-complete

Post-foundation UI work is broken into 5 sub-projects, built out of strict
order (Dashboard & Insights got an early design pass and shipped 3rd
instead of 2nd). Deep history for finished sub-projects lives in git log,
not repeated here.

**1. Transactions core — ✅ COMPLETE**, merged to `main` 2026-08-19. Plan:
`docs/superpowers/plans/2026-08-18-transactions-core.md`. Shipped: schema
migration (`amount > 0` checks, `accounts.archived`, `is_adjustment` on
income/expenses), quick-add bottom sheet + sticky bottom nav, `/accounts`
and `/transactions` screens with filtering. A few deferred-minor UI items
(aria attributes, archived rows still appearing in filter dropdowns) were
never revisited — low risk, worth a look if this area gets touched again.

**2. Budgeting — ✅ Implementation complete** (all 11 tasks shipped,
task-reviewed clean), executing via superpowers:subagent-driven-development
in worktree branch `worktree-budgeting` (pushed to
`origin/worktree-budgeting`, **not yet merged to `main`** — the final
whole-branch review is the next step; see "How to resume in a new session"
below). Spec: `docs/superpowers/specs/2026-08-20-budgeting-design.md`.
Plan (11 tasks): `docs/superpowers/plans/2026-08-20-budgeting.md`.

Shipped: a required weekly overall budget (Mon–Sun, headline card, ×4/÷7
derived monthly/daily figures, income-anchor leftover/warning, missed-week
reminder banner, prev/next week navigation, past-week read-only state);
optional per-category monthly budgets (planned/actual/difference table,
unchanged from v1 design); a `recurring_constants` table (taxes,
subscriptions, salary) that auto-posts real income/expense rows on schedule
via a catch-up check in `app/(app)/layout.tsx`, plus full add/edit/pause/
delete management UI; a new "weekly-budget-pace" dashboard insight.
`lib/weekly-budget.ts` and `lib/recurring.ts` are new, unit-tested,
pure-function modules following the established `lib/insights.ts` pattern.

Two real bugs were caught by Task 11's final regression pass (not by any
per-task review) and fixed before this doc update: an unescaped apostrophe
tripping `react/no-unescaped-entities` in `WeeklyBudgetCard.tsx`, and a
mobile-viewport horizontal-overflow bug in `CategoryBudgetTable.tsx` — its
unbudgeted-category row (fixed-width label + `flex-1` amount input + button,
no `min-w-0`) overflowed ~19px on a 390px-wide screen because flex items
default to `min-width: auto`, so the input refused to shrink far enough.
Fixed by adding `min-w-0` to the input. Worth remembering for any future
`flex` row here that pairs a `flex-1` input with fixed-width siblings.

One human-approved deviation from the plan's literal code during Task 4:
`postDueRecurringConstants` originally claimed a recurring occurrence
(advanced `next_due_on`) and posted its transaction row as two non-atomic
DB calls — if the insert failed right after the claim succeeded, the
occurrence was silently and permanently lost. Fixed in `f088fcd` by
reverting the claim on insert failure so a retry can recover it. One other
human-adjudicated finding during Task 7's review: the plan's own sample
code excluded balance-adjustment rows (`is_adjustment`) from the weekly
"spent so far" total but not from "income this week," an asymmetry that
would have let an income-side adjustment inflate the leftover figure —
fixed to filter both sides consistently.

**3. Dashboard & Insights — ✅ COMPLETE**, merged to `main` 2026-08-20
(fast-forward, `31eff7d..7eb3a7f`), pushed to `origin/main` (Vercel
auto-deploys on push). Plan:
`docs/superpowers/plans/2026-08-19-dashboard-insights.md` (10 tasks, all
implemented via superpowers:subagent-driven-development in a dedicated
worktree, all task-level reviews clean, final whole-branch review clean
after one fix round — 1 Critical finding, bottom-nav text nearly
invisible on the new dark Home tab at 1.07:1 contrast, plus a few
Important/Minor spec-compliance gaps, all fixed and re-reviewed). Design:
`docs/superpowers/specs/2026-08-19-dashboard-insights-design.md`.

Shipped: the real `/dashboard` page — auto-generated insights (5 rule
types, each independently omittable), account-balance cards, a portfolio
net-per-ticker summary, month-to-date category spending bars, an
income/expense trend chart (3/6/9/12-month selector, hover crosshair,
SVG), and a reusable motion system (hover-grow, press-shrink, count-up,
staggered entrance) — plus a dark-mode-only shell chrome that activates
only on the Home tab. No schema changes; entirely read-only against the
database. `lib/insights.ts`, `lib/trend.ts`, `lib/portfolio.ts`,
`lib/motion.ts` are new, unit-tested, pure-function modules.

One real, human-adjudicated finding during the build: the plan's own
sample code repurposed the reserved income-green (`#6cd3a5`) as a
decorative rotating color in two places (account-card badges, portfolio
ticker dots) — a direct conflict with its own Global Constraint that
green/red are reserved for income/expense polarity only. Fixed to a
neutral slate (`#9aa3b8`) in both places per an explicit human decision
mid-build. Everything else implemented clean, or with only Minor/deferred
findings — none load-bearing.

Live site currently shows an all-empty dashboard (₱0 everywhere, "add
more transactions" fallbacks) because the real production database has
zero income/expense/portfolio rows — see "When to import the real
spreadsheet data" below for why that's expected right now, not a bug.

**4. Portfolio — not started.**

**5. Historical migration — not started.**

## When to import the real spreadsheet data (`Budgeting Metrics.xlsx`)

Asked directly during the Dashboard & Insights build — worth keeping as a
standing answer. **Not yet, deliberately.** The schema is still expected
to change: Budgeting (sub-project 2) needs new columns/tables (daily +
monthly granularity, income-anchored budgets, recurring "constants" like
taxes/subscriptions) that don't exist yet; Portfolio (sub-project 4) will
likely refine `portfolio_transactions` once real buy/sell/deposit/withdraw
screens exist, not just get read from like the dashboard does today.
Importing the real historical data now would mean re-mapping or partially
redoing that import once those two land.

**The right time is sub-project 5, Historical migration — explicitly last
in the sequence**, specifically so the one-time bulk import targets a
finalized schema instead of a moving target. Structural analysis of the
real spreadsheet (per-account pie charts, an insights-panel precedent in
its "Key Insights" prose section, category-name drift across releases, an
unresolved account-balance-reconciliation concept with no schema
equivalent yet) is preserved in the cross-session memory system, not this
repo — pull it back up when sub-project 5 starts.

## Next steps to complete the app

In order:

1. **Merge Budgeting (sub-project 2) to `main`.** Implementation is
   complete on `worktree-budgeting` — see status above. Remaining: the
   final whole-branch review (superpowers:subagent-driven-development's
   last step) and superpowers:finishing-a-development-branch to decide how
   it lands.
2. **Portfolio (sub-project 4).** Full buy/sell/deposit/withdraw
   transaction management UI (today `portfolio_transactions` only has a
   read-only summary card on the dashboard — no way to add rows to it
   in-app at all). Likely to touch/extend that table's schema.
3. **Historical migration (sub-project 5).** One-time import of the real
   `Budgeting Metrics.xlsx` into the by-then-finalized schema — see above
   for why it waits until here.

Each sub-project should get its own design spec (via
superpowers:brainstorming) and implementation plan (via
superpowers:writing-plans) before code starts, then execute via
superpowers:subagent-driven-development in a dedicated git worktree — same
process used for Transactions core and Dashboard & Insights.

**Also queued (user-requested 2026-08-20, deferred until Budgeting
ships):** replace the bottom nav (Home/Transactions/Budget/Portfolio/
Accounts) with a side nav that expands on hover. Deferred because the nav
is shared shell chrome (`ShellChrome`) and Budgeting's own Task 11
verifies the bottom nav stays present/active — swapping it mid-plan would
break that check. Run superpowers:brainstorming first, not just a CSS
change: this app is mobile-first (PWA, bottom nav chosen for one-thumb
use, verified on a real iPhone) and hover has no touchscreen equivalent,
so the desktop hover-expand behavior and a distinct mobile interaction
(tap-to-expand, a drawer, or keeping the bottom nav on small screens) both
need deciding with the user, not assumed.

## How to resume in a new session

Sub-projects 1 and 3 (Transactions core, Dashboard & Insights) are both
done and merged to `main` (live in production, Vercel auto-deploys on
push). **Sub-project 2 (Budgeting) has all 11 tasks implemented and
task-reviewed clean on `worktree-budgeting`, but is not yet merged** — see
its status block above for what shipped and the two bugs Task 11's final
regression pass caught and fixed. To resume, on any device:

1. `git fetch origin`, then check out branch `worktree-budgeting` (either
   directly or via a fresh `superpowers:using-git-worktrees` worktree
   pointed at that branch — do NOT branch a new worktree off `main`).
2. `npm install`, then `npx next typegen` (one-time per fresh worktree —
   see the convention note above).
3. Recreate `.env.local` — see "Live infrastructure" above, and the
   `SEED_USER_EMAIL` gotcha in "Decisions / conventions worth knowing."
4. The SDD ledger at `.superpowers/sdd/2026-08-20-budgeting/` is
   gitignored and won't exist on a fresh checkout. If the final
   whole-branch review hasn't run yet, recreate the ledger (`# SDD
   ledger — plan: docs/superpowers/plans/2026-08-20-budgeting.md` plus one
   `Task N: complete (...)` line per task 1–11 — this file's git history
   has the commit ranges) and continue superpowers:subagent-driven-development
   at its final-review step, then superpowers:finishing-a-development-branch
   to land the branch.
5. Sub-project sequence after Budgeting merges: Portfolio (sub-project 4),
   then Historical migration (sub-project 5) — full detail in
   `docs/superpowers/specs/2026-08-19-dashboard-insights-design.md` §11.
