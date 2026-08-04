import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { processDueNotificationCampaigns, processNotificationOutbox, scheduleCategoryAffinityNotifications, scheduleEngagementNotifications } from '@/lib/push-notifications'

function equal(left: string, right: string) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest())
}

export async function POST(request: Request) {
  const expected = process.env.JOB_RUNNER_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
  if (!expected || !supplied || !equal(expected, supplied)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const affinity = await scheduleCategoryAffinityNotifications(100)
  const engagement = await scheduleEngagementNotifications(100)
  const [campaigns, outbox] = await Promise.all([
    processDueNotificationCampaigns(10),
    processNotificationOutbox(100),
  ])
  return NextResponse.json({ affinity, engagement, campaigns, outbox }, { headers: { 'Cache-Control': 'no-store' } })
}
