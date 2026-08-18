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
