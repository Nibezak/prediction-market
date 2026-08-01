import { createClient } from '@supabase/supabase-js'
import 'server-only'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function query<T>(table: string, queryValue: any = {}) {
  return supabase.from(table).select(queryValue)
}

export async function insert<T>(table: string, data: any) {
  return supabase.from(table).insert(data).select()
}

export async function update<T>(table: string, data: any, filter: any) {
  return supabase.from(table).update(data).match(filter).select()
}

export async function remove(table: string, filter: any) {
  return supabase.from(table).delete().match(filter)
}
