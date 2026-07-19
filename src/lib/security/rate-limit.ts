import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'

export async function enforceRateLimit(input: { scope: string, identifier: string, limit: number, windowSeconds: number }) {
  const key = createHash('sha256').update(`${input.scope}:${input.identifier}`).digest('hex')
  const rows = await db.execute(sql<{ count: number, reset_at: Date }>`
    INSERT INTO request_rate_limits(key, scope, count, reset_at, updated_at)
    VALUES (${key}, ${input.scope}, 1, now() + (${input.windowSeconds} * interval '1 second'), now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN request_rate_limits.reset_at <= now() THEN 1 ELSE request_rate_limits.count + 1 END,
      reset_at = CASE WHEN request_rate_limits.reset_at <= now() THEN now() + (${input.windowSeconds} * interval '1 second') ELSE request_rate_limits.reset_at END,
      updated_at = now()
    RETURNING count, reset_at
  `)
  const bucket = rows[0] as unknown as { count: number | string, reset_at: Date | string } | undefined
  if (bucket && Number(bucket.count) > input.limit) {
    const error = new Error('Too many requests. Please wait and try again.') as Error & { status?: number, retryAfter?: number }
    error.status = 429
    error.retryAfter = Math.max(1, Math.ceil((new Date(bucket.reset_at).getTime() - Date.now()) / 1000))
    throw error
  }
  return bucket
}
