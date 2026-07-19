import { count, eq, sql } from 'drizzle-orm'
import { jobs, payment_intents, reconciliation_runs, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

export async function reconcileFinancialState() {
  const [run] = await db.insert(reconciliation_runs).values({ adapter: process.env.SETTLEMENT_ADAPTER || 'play_money', status: 'running' }).returning()
  try {
    const [missingLedger, incompleteWithdrawals, deadJobs, total] = await Promise.all([
      db.select({ value: count() }).from(payment_intents).where(sql`${payment_intents.status} = 'succeeded' AND ${payment_intents.direction} IN ('deposit','refund') AND ${payment_intents.ledger_transaction_id} IS NULL`),
      db.select({ value: count() }).from(withdrawal_requests).where(sql`${withdrawal_requests.status} = 'completed' AND ${withdrawal_requests.ledger_transaction_id} IS NULL`),
      db.select({ value: count() }).from(jobs).where(eq(jobs.status, 'dead')),
      db.select({ value: count() }).from(payment_intents),
    ])
    const details = { missingLedger: Number(missingLedger[0]?.value || 0), incompleteWithdrawals: Number(incompleteWithdrawals[0]?.value || 0), deadJobs: Number(deadJobs[0]?.value || 0) }
    const mismatches = details.missingLedger + details.incompleteWithdrawals + details.deadJobs
    await db.update(reconciliation_runs).set({ status: mismatches ? 'exceptions' : 'completed', checked_count: Number(total[0]?.value || 0), mismatch_count: mismatches, details, completed_at: new Date() }).where(eq(reconciliation_runs.id, run.id))
    return { runId: run.id, checked: Number(total[0]?.value || 0), mismatches, details }
  }
  catch (error) {
    await db.update(reconciliation_runs).set({ status: 'failed', details: { error: error instanceof Error ? error.message : 'Unknown reconciliation failure' }, completed_at: new Date() }).where(eq(reconciliation_runs.id, run.id))
    throw error
  }
}

export async function recoverStuckJobs() {
  const rows = await db.execute(sql<{ id: string }>`UPDATE jobs SET status = 'retry', reserved_at = NULL, available_at = now(), updated_at = now(), last_error = COALESCE(last_error || '; ', '') || 'Recovered stale lease' WHERE status = 'processing' AND reserved_at < now() - interval '10 minutes' RETURNING id`)
  return rows.length
}
