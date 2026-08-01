import { and, count, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { jobs, payment_intents, reconciliation_runs, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

export async function reconcileFinancialState() {
  const [run] = await db.insert(reconciliation_runs).values({ adapter: process.env.SETTLEMENT_ADAPTER || 'slimefish_backend', status: 'running' }).returning()
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

export type ProviderReportRecord = {
  externalReference: string
  amount: string
  currency: string
  status: string
}

export async function reconcileProviderReport(input: {
  provider: string
  reportId: string
  reportHash: string
  records: ProviderReportRecord[]
  period?: { from: Date, to: Date }
}) {
  const [run] = await db.insert(reconciliation_runs).values({ adapter: input.provider, provider_report_id: input.reportId, report_hash: input.reportHash, status: 'running' }).onConflictDoNothing().returning()
  if (!run) {
    const [existing] = await db.select().from(reconciliation_runs).where(sql`${reconciliation_runs.adapter} = ${input.provider} AND ${reconciliation_runs.provider_report_id} = ${input.reportId}`).limit(1)
    return { replayed: true, run: existing || null }
  }
  try {
    const references = input.records.map(record => record.externalReference).filter(Boolean)
    const internalRows = references.length
      ? await db.select().from(payment_intents).where(inArray(payment_intents.external_reference, references))
      : []
    const byReference = new Map(internalRows.map(intent => [intent.external_reference, intent]))
    const mismatches = input.records.flatMap((record) => {
      const intent = byReference.get(record.externalReference)
      if (!intent) return [{ externalReference: record.externalReference, reason: 'missing_internal' }]
      const issues = []
      if (Number(intent.net_amount).toFixed(2) !== Number(record.amount).toFixed(2)) issues.push('amount')
      if (intent.destination_currency.toUpperCase() !== record.currency.toUpperCase()) issues.push('currency')
      if (intent.status !== record.status) issues.push('status')
      return issues.length ? [{ externalReference: record.externalReference, reason: issues.join(',') }] : []
    })
    const reportReferenceSet = new Set(references)
    const successfulInternalRows = input.period
      ? await db.select().from(payment_intents).where(and(
          eq(payment_intents.settlement_adapter, input.provider),
          eq(payment_intents.status, 'succeeded'),
          gte(payment_intents.completed_at, input.period.from),
          lt(payment_intents.completed_at, input.period.to),
        ))
      : []
    const missingProvider = successfulInternalRows
      .filter(intent => intent.external_reference && !reportReferenceSet.has(intent.external_reference))
      .map(intent => ({ externalReference: intent.external_reference!, reason: 'missing_provider' }))
    const allMismatches = [...mismatches, ...missingProvider]
    await db.update(reconciliation_runs).set({ status: allMismatches.length ? 'exceptions' : 'completed', checked_count: input.records.length, mismatch_count: allMismatches.length, details: { period: input.period ? { from: input.period.from.toISOString(), to: input.period.to.toISOString() } : null, mismatches: allMismatches.slice(0, 1000), truncated: allMismatches.length > 1000 }, completed_at: new Date() }).where(eq(reconciliation_runs.id, run.id))
    return { replayed: false, runId: run.id, checked: input.records.length, mismatches: allMismatches.length, details: allMismatches }
  }
  catch (error) {
    await db.update(reconciliation_runs).set({ status: 'failed', details: { error: error instanceof Error ? error.message : 'Provider reconciliation failed' }, completed_at: new Date() }).where(eq(reconciliation_runs.id, run.id))
    throw error
  }
}
