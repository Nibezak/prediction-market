/* eslint-disable style/max-statements-per-line */
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/drizzle'

export async function GET() {
  const started = performance.now()
  let database = false
  let settlement = false
  try { await db.execute(sql`SELECT 1`); database = true }
  catch {}
  try {
    const secret = process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim() || process.env.TELLWISE_SECRET?.trim() || ''
    const response = await fetch(`${(process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/api\/v1$/, '')}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(2500), headers: secret ? { 'x-slimefish-backend-api-key': secret } : {} })
    settlement = response.ok
  }
  catch {}
  const ready = database && settlement
  return NextResponse.json({ status: ready ? 'ready' : 'degraded', checks: { database, settlement }, latencyMs: Math.round(performance.now() - started) }, { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } })
}
