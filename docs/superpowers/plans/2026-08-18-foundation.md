# Foundation (Scaffold, Auth, Schema, PWA Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployed, installable, login-protected Next.js + Supabase PWA shell with the full database schema in place, ready for the core budgeting screens (a later plan) to be built on top of.

**Architecture:** Next.js (App Router, TypeScript) talks directly to Supabase (Postgres + Auth) from both server and browser via `@supabase/ssr`. Every table is owned by a single Supabase Auth user and protected by Row-Level Security. The app is deployed to Vercel and installable to a phone home screen as a PWA.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest, tsx, Vercel.

This is plan 1 of the project (see `docs/superpowers/specs/2026-08-18-personal-finance-app-design.md` §8 for the full build order). It covers build-order steps 1–2. It intentionally stops at placeholder pages for each section — the real budgeting/transactions/portfolio UI is the next plan.

## Global Constraints

- Next.js App Router + TypeScript only — no plain JavaScript files.
- Tailwind CSS for all styling — no separate CSS modules or styled-components.
- Every Supabase table must have Row-Level Security enabled with owner-only (`auth.uid() = user_id`) policies for select/insert/update/delete. No table is exempt.
- Free-tier services only (Vercel free tier, Supabase free tier) — no paid add-ons.
- Must be installable as a PWA (Add to Home Screen) on both Android and iOS.
- Single user only — no sign-up UI, no multi-tenant logic. The one account is created directly in the Supabase dashboard.
- All money values are displayed via the shared `formatCurrency` helper (`lib/format.ts`) so pesos are formatted consistently everywhere — never format currency ad hoc.
- `SUPABASE_SERVICE_ROLE_KEY` must never be imported into any file under `app/`, `lib/`, or `middleware.ts` — it is read only by local scripts under `scripts/`, which never ship to the browser or run on Vercel.

---

### Task 1: Project scaffold + currency formatting

**Files:**
- Create: Next.js project files at repo root (`package.json`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.ts`, `.gitignore`, etc.) via `create-next-app`
- Create: `vitest.config.ts`
- Create: `lib/format.ts`
- Test: `lib/format.test.ts`

**Interfaces:**
- Produces: `formatCurrency(amount: number): string` from `lib/format.ts` — used by every later screen that displays money.

- [ ] **Step 1: Scaffold the Next.js project**

Run in the repo root (`C:\Personal Finance App`):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```

If prompted for anything not covered by these flags (e.g. Turbopack for `next dev`), accept the default option shown.

- [ ] **Step 2: Verify the dev server runs**

Run: `npm run dev`, then open `http://localhost:3000` in a browser.
Expected: the default Next.js starter page renders with no errors in the terminal. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 3: Add Vitest**

```bash
npm install -D vitest @vitejs/plugin-react jsdom
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
```

Edit `package.json` scripts to add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write the failing test for `formatCurrency`**

Create `lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('formats whole pesos with the peso sign and thousands separators', () => {
    expect(formatCurrency(1234)).toBe('₱1,234.00')
  })

  it('formats cents correctly', () => {
    expect(formatCurrency(1234.5)).toBe('₱1,234.50')
  })

  it('formats negative amounts with a leading minus before the sign', () => {
    expect(formatCurrency(-500)).toBe('-₱500.00')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('₱0.00')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/format.ts` does not exist / `formatCurrency` is not exported.

- [ ] **Step 6: Implement `formatCurrency`**

Create `lib/format.ts`:

```ts
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}₱${formatted}`
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all 4 assertions green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Tailwind, Vitest, and currency formatter"
```

---

### Task 2: Supabase project + client helpers

**Files:**
- Create: `.env.local` (not committed)
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `scripts/check-connection.ts`

**Interfaces:**
- Consumes: none
- Produces: `createClient()` (browser) from `lib/supabase/client.ts`; `createClient()` (async, server) from `lib/supabase/server.ts` — both used by every later task that touches Supabase.

- [ ] **Step 1: Create the Supabase project (manual)**

Go to https://supabase.com/dashboard, sign in (create an account if you don't have one — this needs to be done by you directly, not automated), and click "New Project". Name it (e.g. "personal-finance"), choose a database password (save it somewhere safe — you won't need it for this plan, but Supabase requires setting one), and pick a region close to you. Wait for provisioning to finish.

Once created, go to **Project Settings → API** and note down:
- **Project URL**
- **anon public** key
- **service_role** key (keep this one especially private — it bypasses all Row-Level Security)

- [ ] **Step 2: Store credentials locally**

Create `.env.local` in the repo root:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Replace the placeholder values with the real ones from Step 1. Confirm `.env.local` is listed in `.gitignore` (Next.js's default `.gitignore` already includes `.env*.local` — open the file and check the line is there).

- [ ] **Step 3: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D tsx
```

- [ ] **Step 4: Create the browser client helper**

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Create the server client helper**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render — middleware handles session refresh instead.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 6: Write a connection-check script**

Create `scripts/check-connection.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

const supabase = createClient(url, anonKey)

const { error } = await supabase.from('_connection_check').select('*').limit(1)

// "relation does not exist" proves the request reached Postgres and was authenticated —
// any other error means the URL/key are wrong or the project is unreachable.
if (error?.code !== '42P01') {
  throw new Error(`Could not confirm a connection to Supabase: ${JSON.stringify(error)}`)
}

console.log('Connected to Supabase successfully.')
```

- [ ] **Step 7: Run the check**

Run: `npx tsx --env-file=.env.local scripts/check-connection.ts`
Expected: prints `Connected to Supabase successfully.` and exits 0. If the URL/key are wrong, the script throws and exits non-zero instead.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Supabase client/server helpers and connection check script"
```

(`.env.local` is gitignored and will not appear in the diff — confirm with `git status` before committing that it isn't staged.)

---

### Task 3: Schema — accounts & categories

**Files:**
- Create: `supabase/migrations/0001_accounts_categories.sql`
- Create: `scripts/verify-schema.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- Produces: `accounts(id, user_id, name, created_at)` and `categories(id, user_id, name, archived, created_at)` tables, both RLS-protected.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-schema.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(url, anonKey)

const [expect, ...tables] = process.argv.slice(2)

if (expect !== 'missing' && expect !== 'ready') {
  throw new Error('Usage: tsx scripts/verify-schema.ts <missing|ready> <table...>')
}
if (tables.length === 0) {
  throw new Error('Usage: tsx scripts/verify-schema.ts <missing|ready> <table...>')
}

let failures = 0

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*')

  if (expect === 'missing') {
    if (error) {
      console.log(`${table}: OK (not ready yet, as expected — ${error.message})`)
    } else {
      console.log(`${table}: FAIL — expected the table to not exist yet, but the query succeeded`)
      failures++
    }
    continue
  }

  if (error) {
    console.log(`${table}: FAIL — expected the table to exist, got error: ${error.message}`)
    failures++
  } else if (data.length === 0) {
    console.log(`${table}: OK (table exists, RLS blocks anonymous access)`)
  } else {
    console.log(`${table}: FAIL — anonymous client read ${data.length} row(s), RLS is not restricting access`)
    failures++
  }
}

if (failures > 0) {
  throw new Error(`${failures} table(s) failed verification`)
}

console.log('All tables verified.')
```

This takes the tables to check as CLI arguments (rather than a hardcoded list), so Task 4 can reuse it unmodified against a different table set.

- [ ] **Step 2: Run it before the migration exists (expect NOT READY)**

Run: `npx tsx --env-file=.env.local scripts/verify-schema.ts missing accounts categories`
Expected: both tables print `OK (not ready yet, as expected — relation "public.accounts" does not exist)` (and the same for `categories`), then `All tables verified.`, exiting 0.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0001_accounts_categories.sql`:

```sql
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;

create policy "accounts_select_own" on accounts for select using (auth.uid() = user_id);
create policy "accounts_insert_own" on accounts for insert with check (auth.uid() = user_id);
create policy "accounts_update_own" on accounts for update using (auth.uid() = user_id);
create policy "accounts_delete_own" on accounts for delete using (auth.uid() = user_id);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;

create policy "categories_select_own" on categories for select using (auth.uid() = user_id);
create policy "categories_insert_own" on categories for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on categories for update using (auth.uid() = user_id);
create policy "categories_delete_own" on categories for delete using (auth.uid() = user_id);
```

- [ ] **Step 4: Apply the migration (manual)**

In the Supabase dashboard, go to **SQL Editor → New query**, paste the full contents of `supabase/migrations/0001_accounts_categories.sql`, and click **Run**.
Expected: "Success. No rows returned."

- [ ] **Step 5: Run the verification script again (expect OK)**

Run: `npx tsx --env-file=.env.local scripts/verify-schema.ts ready accounts categories`
Expected: both tables print `OK (table exists, RLS blocks anonymous access)`, then `All tables verified.`, exiting 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add accounts and categories tables with RLS"
```

---

### Task 4: Schema — income, expenses, budgets, portfolio_transactions

**Files:**
- Create: `supabase/migrations/0002_income_expenses_budgets_portfolio.sql`

**Interfaces:**
- Consumes: `accounts`, `categories` tables and the `scripts/verify-schema.ts <missing|ready> <table...>` script from Task 3 — reused unmodified, since it takes the table list as CLI arguments.
- Produces: `income`, `expenses`, `budgets`, `portfolio_transactions` tables, all RLS-protected.

- [ ] **Step 1: Run the verification script before the migration exists (expect NOT READY for the 4 new tables)**

Run: `npx tsx --env-file=.env.local scripts/verify-schema.ts missing income expenses budgets portfolio_transactions`
Expected: all four tables print `OK (not ready yet, as expected — ...)`, then `All tables verified.`, exiting 0.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0002_income_expenses_budgets_portfolio.sql`:

```sql
create table income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  amount numeric(12,2) not null,
  source text not null,
  account_id uuid not null references accounts(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

alter table income enable row level security;

create policy "income_select_own" on income for select using (auth.uid() = user_id);
create policy "income_insert_own" on income for insert with check (auth.uid() = user_id);
create policy "income_update_own" on income for update using (auth.uid() = user_id);
create policy "income_delete_own" on income for delete using (auth.uid() = user_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  amount numeric(12,2) not null,
  category_id uuid not null references categories(id) on delete restrict,
  account_id uuid not null references accounts(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "expenses_select_own" on expenses for select using (auth.uid() = user_id);
create policy "expenses_insert_own" on expenses for insert with check (auth.uid() = user_id);
create policy "expenses_update_own" on expenses for update using (auth.uid() = user_id);
create policy "expenses_delete_own" on expenses for delete using (auth.uid() = user_id);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null, -- always the 1st of the month, e.g. 2025-09-01
  category_id uuid not null references categories(id) on delete restrict,
  planned_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, month, category_id)
);

alter table budgets enable row level security;

create policy "budgets_select_own" on budgets for select using (auth.uid() = user_id);
create policy "budgets_insert_own" on budgets for insert with check (auth.uid() = user_id);
create policy "budgets_update_own" on budgets for update using (auth.uid() = user_id);
create policy "budgets_delete_own" on budgets for delete using (auth.uid() = user_id);

create table portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  type text not null check (type in ('buy', 'sell', 'deposit', 'withdraw')),
  company text,
  ticker text,
  amount numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table portfolio_transactions enable row level security;

create policy "portfolio_transactions_select_own" on portfolio_transactions for select using (auth.uid() = user_id);
create policy "portfolio_transactions_insert_own" on portfolio_transactions for insert with check (auth.uid() = user_id);
create policy "portfolio_transactions_update_own" on portfolio_transactions for update using (auth.uid() = user_id);
create policy "portfolio_transactions_delete_own" on portfolio_transactions for delete using (auth.uid() = user_id);
```

- [ ] **Step 3: Apply the migration (manual)**

In the Supabase dashboard **SQL Editor**, paste the full contents of `supabase/migrations/0002_income_expenses_budgets_portfolio.sql` and click **Run**.
Expected: "Success. No rows returned."

- [ ] **Step 4: Run the verification script again (expect OK for all 6)**

Run: `npx tsx --env-file=.env.local scripts/verify-schema.ts ready accounts categories income expenses budgets portfolio_transactions`
Expected: all 6 tables print `OK (table exists, RLS blocks anonymous access)`, then `All tables verified.`, exiting 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add income, expenses, budgets, and portfolio_transactions tables with RLS"
```

---

### Task 5: Login page + the one real user account

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`

**Interfaces:**
- Consumes: `createClient()` (server) from `lib/supabase/server.ts`
- Produces: `POST`-via-form-action `login(formData: FormData)` server action; the `/login` route.

- [ ] **Step 1: Create the one real user account (manual)**

In the Supabase dashboard, go to **Authentication → Users → Add user → Create new user**. Enter your email and a password you choose. Check **Auto Confirm User** so no email-verification step blocks login. Click **Create user**.

- [ ] **Step 2: Write the login server action**

Create `app/login/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/dashboard')
}
```

- [ ] **Step 3: Write the login page**

Create `app/login/page.tsx`:

```tsx
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-700"
        >
          Log in
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Manually test the login flow**

Run: `npm run dev`, open `http://localhost:3000/login`, and log in with the email/password from Step 1.
Expected: the browser redirects to `/dashboard`. Seeing Next.js's default 404 page at that URL is correct at this stage — the real `/dashboard` page is built in Task 9. What matters is that the URL bar shows `/dashboard`, proving login succeeded.

Also test the failure path: log in with a wrong password.
Expected: redirected back to `/login?error=...` with the error message displayed above the form.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add login page and server action"
```

---

### Task 6: Route protection middleware

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consumes: Supabase session cookies (set by Task 5's login action)
- Produces: redirect-to-`/login` behavior for any unauthenticated request to a non-`/login` path; redirect-to-`/dashboard` for an authenticated request to `/login`.

- [ ] **Step 1: Write the middleware**

Create `middleware.ts` in the repo root:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/login'

  if (!user && !isLoginPage) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && isLoginPage) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js).*)'],
}
```

- [ ] **Step 2: Verify the unauthenticated redirect**

Run: `npm run dev` in one terminal. In another terminal (no session cookie present):

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
```

Expected: `307 -> http://localhost:3000/login`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add auth middleware protecting all routes except /login"
```

(Full authenticated-redirect-away-from-login behavior is verified in Task 9's manual browser walkthrough, once `/dashboard` exists as a real page.)

---

### Task 7: Seed reference data (accounts + categories)

**Files:**
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`, `SEED_USER_EMAIL` env vars; the `accounts`/`categories` tables from Task 3
- Produces: seeded rows in `accounts` (Cash, Gcash, Maribank, Savings/Debit Card) and `categories` (22 categories) owned by the real user.

- [ ] **Step 1: Add the seed user's email to `.env.local`**

Append to `.env.local` (use the same email you used to create the account in Task 5, Step 1):

```
SEED_USER_EMAIL=your-email@example.com
```

- [ ] **Step 2: Write the seed script**

Create `scripts/seed.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const userEmail = process.env.SEED_USER_EMAIL!

const supabase = createClient(url, serviceRoleKey)

const { data: usersPage, error: userError } = await supabase.auth.admin.listUsers()
if (userError) throw userError

const user = usersPage.users.find((u) => u.email === userEmail)
if (!user) {
  throw new Error(`No Supabase auth user found with email ${userEmail}`)
}

const { data: existingAccounts, error: existingAccountsError } = await supabase
  .from('accounts')
  .select('id')
  .eq('user_id', user.id)
if (existingAccountsError) throw existingAccountsError

if (existingAccounts.length > 0) {
  console.log(`Already seeded (${existingAccounts.length} accounts found) — skipping.`)
  process.exit(0)
}

const accountNames = ['Cash', 'Gcash', 'Maribank', 'Savings/Debit Card']
const categoryNames = [
  'Badminton', 'Cash Withdrawal', 'Coffee', 'Date with GF', 'Dinner with GF',
  'DragonFi', 'Errands', 'Flowers', 'Food', 'GFunds', 'Gifts', 'Hotel',
  'Medical Expenses', 'Money Transfer', 'Parking', 'Personal Computer Upgrade',
  'Printing', 'School Expenses', 'Shoes', 'Smart App', 'Supplements', 'Other',
]

const { error: accountsError } = await supabase
  .from('accounts')
  .insert(accountNames.map((name) => ({ name, user_id: user.id })))
if (accountsError) throw accountsError

const { error: categoriesError } = await supabase
  .from('categories')
  .insert(categoryNames.map((name) => ({ name, user_id: user.id })))
if (categoriesError) throw categoriesError

const { data: seededAccounts, error: verifyAccountsError } = await supabase
  .from('accounts')
  .select('id')
  .eq('user_id', user.id)
if (verifyAccountsError) throw verifyAccountsError
if (seededAccounts.length !== accountNames.length) {
  throw new Error(`Expected ${accountNames.length} accounts, found ${seededAccounts.length}`)
}

const { data: seededCategories, error: verifyCategoriesError } = await supabase
  .from('categories')
  .select('id')
  .eq('user_id', user.id)
if (verifyCategoriesError) throw verifyCategoriesError
if (seededCategories.length !== categoryNames.length) {
  throw new Error(`Expected ${categoryNames.length} categories, found ${seededCategories.length}`)
}

console.log(
  `Seeded and verified ${seededAccounts.length} accounts and ${seededCategories.length} categories for ${userEmail}.`
)
```

- [ ] **Step 3: Run the seed script**

Run: `npx tsx --env-file=.env.local scripts/seed.ts`
Expected: `Seeded and verified 4 accounts and 22 categories for your-email@example.com.`

- [ ] **Step 4: Verify idempotency**

Run the same command again: `npx tsx --env-file=.env.local scripts/seed.ts`
Expected: `Already seeded (4 accounts found) — skipping.` (proves re-running the script is safe and won't duplicate rows).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add idempotent seed script for accounts and categories"
```

---

### Task 8: PWA shell — manifest + service worker

**Files:**
- Create: `app/manifest.ts`
- Create: `public/sw.js`
- Create: `app/register-sw.tsx`
- Modify: `app/layout.tsx`
- Create: `public/icon-192.png`, `public/icon-512.png` (manual)

**Interfaces:**
- Consumes: none
- Produces: `/manifest.webmanifest` route (via Next.js's `app/manifest.ts` convention); `<RegisterServiceWorker />` component from `app/register-sw.tsx`, rendered once in the root layout.

- [ ] **Step 1: Add placeholder icons (manual)**

Save any square PNG images as `public/icon-192.png` (192×192px) and `public/icon-512.png` (512×512px) — a plain solid-color square is fine for now; swap in real branding later. Any image editor, or an online square-image generator, works.

- [ ] **Step 2: Write the web app manifest**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Personal Finance',
    short_name: 'Finance',
    description: 'Personal income, budget, and portfolio tracker',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
```

- [ ] **Step 3: Write the service worker**

Create `public/sw.js`:

```js
const CACHE_NAME = 'finance-app-shell-v1'
const SHELL_ASSETS = ['/login']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
```

- [ ] **Step 4: Write the registration component**

Create `app/register-sw.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker registration failed:', error)
      })
    }
  }, [])

  return null
}
```

- [ ] **Step 5: Wire it into the root layout**

Modify `app/layout.tsx` to render `<RegisterServiceWorker />` inside `<body>`, alongside `{children}`:

```tsx
import { RegisterServiceWorker } from './register-sw'
// ...existing imports stay as generated by create-next-app

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
```

(Keep whatever font/className setup `create-next-app` already generated on `<html>`/`<body>` — just add the import and the `<RegisterServiceWorker />` element.)

- [ ] **Step 6: Manually verify installability**

Run: `npm run build && npm run start`, open `http://localhost:3000/login` in Chrome.
Open DevTools → **Application** tab → **Manifest**: confirm name "Personal Finance", both icons listed, no errors.
Open DevTools → **Application** tab → **Service Workers**: confirm one is registered and shows "activated and is running".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add PWA manifest and service worker registration"
```

---

### Task 9: Mobile nav shell + placeholder screens

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/actions.ts`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/transactions/page.tsx`
- Create: `app/(app)/budget/page.tsx`
- Create: `app/(app)/portfolio/page.tsx`
- Create: `app/(app)/accounts/page.tsx`

**Interfaces:**
- Consumes: `createClient()` (server) from `lib/supabase/server.ts`
- Produces: the `(app)` route group layout with bottom nav + logout, used as the shell every future screen (built in the next plan) renders inside.

- [ ] **Step 1: Write the logout action**

Create `app/(app)/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 2: Write the app shell layout**

Create `app/(app)/layout.tsx`:

```tsx
import Link from 'next/link'
import { logout } from './actions'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budget', label: 'Budget' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/accounts', label: 'Accounts' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold text-slate-900">Personal Finance</span>
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
            Log out
          </button>
        </form>
      </header>

      <main className="flex-1 p-4">{children}</main>

      <nav className="grid grid-cols-5 border-t border-slate-200 bg-white">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center py-2 text-xs text-slate-600 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 3: Create the five placeholder pages**

Create `app/(app)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return <p className="text-slate-600">Dashboard — coming soon.</p>
}
```

Create `app/(app)/transactions/page.tsx`:

```tsx
export default function TransactionsPage() {
  return <p className="text-slate-600">Transactions — coming soon.</p>
}
```

Create `app/(app)/budget/page.tsx`:

```tsx
export default function BudgetPage() {
  return <p className="text-slate-600">Budget — coming soon.</p>
}
```

Create `app/(app)/portfolio/page.tsx`:

```tsx
export default function PortfolioPage() {
  return <p className="text-slate-600">Portfolio — coming soon.</p>
}
```

Create `app/(app)/accounts/page.tsx`:

```tsx
export default function AccountsPage() {
  return <p className="text-slate-600">Accounts — coming soon.</p>
}
```

- [ ] **Step 4: Full manual browser walkthrough**

Run: `npm run dev`. In a browser (use the Browser tool if executing this plan as an agent):

1. Visit `http://localhost:3000/`, logged out. Expected: redirected to `/login`.
2. Log in with the account from Task 5. Expected: redirected to `/dashboard`, page shows "Dashboard — coming soon." and the header + 5-tab bottom nav are visible.
3. Click each of the other 4 nav tabs. Expected: each shows its own "<Name> — coming soon." text and the URL updates accordingly.
4. Click **Log out**. Expected: redirected to `/login`.
5. Try visiting `http://localhost:3000/dashboard` directly while logged out. Expected: redirected to `/login`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add mobile nav shell and placeholder screens for all sections"
```

---

### Task 10: Push to GitHub + connect Vercel for auto-deploy

**Files:** none created by this task besides what GitHub/Vercel add on their own (no repo files change beyond the git remote configuration).

**Interfaces:**
- Consumes: the whole app built in Tasks 1–9, and this repo's git history (already `git init`-ed with commits from Tasks 1–9).
- Produces: a public HTTPS URL serving the app, backed by the same Supabase project, that redeploys automatically on every `git push` to `main` from here on — every later plan's changes ship the same way, no extra deploy task needed.

- [ ] **Step 1: Create a private GitHub repo (manual)**

Go to https://github.com/new, sign in (create an account first if you don't have one — this is your own account action). Create a **private** repository (e.g. named `personal-finance-app`). Leave "Initialize with README" unchecked — this repo already has commits locally.

- [ ] **Step 2: Push the local repo to GitHub**

GitHub will show a remote URL after creation (e.g. `https://github.com/YOUR_USERNAME/personal-finance-app.git`). Run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/personal-finance-app.git
git branch -M main
git push -u origin main
```

The first push will prompt for GitHub authentication in your browser (or via a credential manager) — that's your own login, not something to script around.

Expected: `git push` succeeds; refreshing the GitHub repo page shows all the commits from Tasks 1–9.

- [ ] **Step 3: Connect the repo to Vercel (manual)**

Go to https://vercel.com/new (sign in / create a Vercel account first if you don't have one), choose **Import Git Repository**, and select the `personal-finance-app` repo you just pushed. Vercel auto-detects it's a Next.js app — accept the defaults for build settings.

Before clicking Deploy, expand **Environment Variables** and add:
- `NEXT_PUBLIC_SUPABASE_URL` → same value as in `.env.local`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → same value as in `.env.local`

**Do not** add `SUPABASE_SERVICE_ROLE_KEY` or `SEED_USER_EMAIL` — those are only ever used by local scripts and must never exist in the deployed environment.

Click **Deploy**.

- [ ] **Step 4: Verify production**

Once the deploy finishes, Vercel shows a production URL (e.g. `https://personal-finance-app.vercel.app`). Open it on your phone's browser.
Expected: redirected to `/login`, log in with the credentials from Task 5, land on `/dashboard` with the nav shell working exactly as it did locally. Try "Add to Home Screen" (Android: browser menu → "Install app" / "Add to Home Screen"; iPhone: Share → "Add to Home Screen") and confirm an app icon appears and opens full-screen without browser chrome.

- [ ] **Step 5: Confirm auto-deploy works**

Make a trivial change (e.g. tweak the header text in `app/(app)/layout.tsx` from "Personal Finance" to "Personal Finance " — literally any 1-character diff), then:

```bash
git add -A
git commit -m "Verify auto-deploy trigger"
git push
```

Expected: within a minute or two, the Vercel dashboard shows a new deployment building automatically from the push, and the production URL reflects the change once it finishes. Revert the trivial change afterward with another commit + push if you want the header text back exactly as it was.
