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
