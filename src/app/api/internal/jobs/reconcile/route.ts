/* eslint-disable style/max-statements-per-line */
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { reconcileFinancialState, recoverStuckJobs } from '@/lib/operations/reconciliation'

function equal(a: string, b: string) { return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()) }

export async function POST(request: Request) {
  const expected = process.env.JOB_RUNNER_SECRET?.trim() || process.env.TELLWISE_SECRET?.trim() || ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
  if (!expected || !supplied || !equal(expected, supplied)) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const recoveredJobs = await recoverStuckJobs()
  const reconciliation = await reconcileFinancialState()
  return NextResponse.json({ recoveredJobs, reconciliation }, { headers: { 'cache-control': 'no-store' } })
}
