import { and, eq, inArray } from 'drizzle-orm'
import { settings } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

export type Operation = 'trading' | 'deposits' | 'withdrawals' | 'settlement'

export async function assertOperationEnabled(operation: Operation) {
  const [row] = await db.select({ value: settings.value }).from(settings).where(and(eq(settings.group, 'operations'), inArray(settings.key, [`${operation}_paused`, 'platform_paused']), eq(settings.value, 'true'))).limit(1)
  if (row?.value === 'true') {
    const error = new Error(`${operation[0]?.toUpperCase()}${operation.slice(1)} are temporarily paused.`) as Error & { status?: number }
    error.status = 503
    throw error
  }
}
