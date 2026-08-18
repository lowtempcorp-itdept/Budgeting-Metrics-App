import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

const supabase = createClient(url, anonKey)

const { error } = await supabase.from('_connection_check').select('*').limit(1)

// A "table not found" error proves the request reached Supabase and was authenticated —
// any other error means the URL/key are wrong or the project is unreachable.
// - PGRST205: PostgREST validates the table against its schema cache before querying
//   Postgres, and returns this code when the table isn't in that cache (the case here,
//   since `_connection_check` doesn't exist). This is what Supabase's hosted API returns.
// - 42P01: the raw Postgres "relation does not exist" error, kept as a fallback in case
//   the request reaches Postgres directly without going through PostgREST's cache check.
const NOT_FOUND_CODES = ['PGRST205', '42P01']
if (!error || !NOT_FOUND_CODES.includes(error.code)) {
  throw new Error(`Could not confirm a connection to Supabase: ${JSON.stringify(error)}`)
}

console.log('Connected to Supabase successfully.')
