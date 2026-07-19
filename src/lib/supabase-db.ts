import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rrvlcjmysgslqzyatvzl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJydmxjam15c2dzbHF6eWF0dnpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAxNzc0NywiZXhwIjoyMDk5NTkzNzQ3fQ.-RbhQ8CYYHjJxZM15o0lRKHYEYwt2mwortvLw4Clm0o';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functions for common database operations
export async function query<T>(table: string, query: any = {}) {
  return supabase.from(table).select(query);
}

export async function insert<T>(table: string, data: any) {
  return supabase.from(table).insert(data).select();
}

export async function update<T>(table: string, data: any, filter: any) {
  return supabase.from(table).update(data).match(filter).select();
}

export async function remove(table: string, filter: any) {
  return supabase.from(table).delete().match(filter);
}
