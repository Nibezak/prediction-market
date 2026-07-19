/* eslint-disable style/max-statements-per-line */
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { processPaymentJobs } from '@/lib/payments/lifecycle'

function equal(left: string, right: string) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest())
}

export async function POST(request: Request) {
  const expected = process.env.JOB_RUNNER_SECRET?.trim() || process.env.TELLWISE_SECRET?.trim()
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
  if (!expected || !supplied || !equal(expected, supplied)) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const result = await processPaymentJobs(request.headers.get('x-worker-id') || 'http-worker', 25)
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
}
