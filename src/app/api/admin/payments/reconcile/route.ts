import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { UserRepository } from '@/lib/db/queries/user'
import { reconcileProviderReport } from '@/lib/operations/reconciliation'
import { hasStaffPermission } from '@/lib/staff-permissions'

export async function POST(request: Request) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !hasStaffPermission(currentUser, 'finance.reconcile')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > 2_000_000) return NextResponse.json({ error: 'Report is too large.' }, { status: 413 })
  let body: { provider?: unknown, reportId?: unknown, from?: unknown, to?: unknown, records?: unknown }
  try {
    body = JSON.parse(rawBody) as typeof body
  }
  catch {
    return NextResponse.json({ error: 'Report must be valid JSON.' }, { status: 400 })
  }
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : ''
  const reportId = typeof body.reportId === 'string' ? body.reportId.trim().slice(0, 200) : ''
  if (!provider || !reportId || !Array.isArray(body.records) || body.records.length > 5000) return NextResponse.json({ error: 'A provider, report ID, and up to 5,000 records are required.' }, { status: 400 })
  const records = body.records.map((record: any) => ({
    externalReference: String(record?.externalReference || '').slice(0, 300),
    amount: Number(record?.amount).toFixed(2),
    currency: String(record?.currency || '').slice(0, 20),
    status: String(record?.status || '').slice(0, 30),
  }))
  if (records.some(record => !record.externalReference || !Number.isFinite(Number(record.amount)) || !record.currency || !record.status)) return NextResponse.json({ error: 'Report contains an invalid record.' }, { status: 400 })
  const from = typeof body.from === 'string' ? new Date(body.from) : null
  const to = typeof body.to === 'string' ? new Date(body.to) : null
  if ((from && !to) || (!from && to) || (from && to && (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to))) {
    return NextResponse.json({ error: 'Provide a valid from/to report period, or omit both.' }, { status: 400 })
  }
  const result = await reconcileProviderReport({
    provider,
    reportId,
    reportHash: createHash('sha256').update(rawBody).digest('hex'),
    records,
    period: from && to ? { from, to } : undefined,
  })
  return NextResponse.json({ data: result })
}
