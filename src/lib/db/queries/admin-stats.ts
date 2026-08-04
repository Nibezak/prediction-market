import { and, count, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { event_creations, events, jobs, markets, notifications, risk_cases, sessions, users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { loadLedgerDashboardReport } from '@/lib/slimefish-backend-reporting'

export interface AdminDashboardData {
  stats: {
    totalUsers: number
    activeUsers: number
    activeMarkets: number
    resolvedMarkets: number
    pendingApprovals: number
    failedJobs: number
    totalTrades: number
    volumeAllTime: number
    volume1D: number
    volume1W: number
    volume1M: number
    userCash: number
    openExposure: number
  }
  volumeData: Array<{ date: string, value: number, trades: number }>
  recentTrades: Array<Record<string, unknown>>
  balances: Array<Record<string, unknown>>
  positions: Array<Record<string, unknown>>
  liquidity: Array<Record<string, unknown>>
  resolutions: Array<Record<string, unknown>>
  topTraders: Array<Record<string, unknown>>
  riskSignals: Array<Record<string, unknown>>
  activity: Array<Record<string, unknown>>
  markets: {
    active: Array<Record<string, unknown>>
    resolved: Array<Record<string, unknown>>
  }
  services: {
    tellwiseDatabase: 'operational'
    slimefishBackendDatabase: 'operational' | 'unavailable'
    slimefishBackendError: string | null
  }
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function serializeRows(rows: readonly Record<string, unknown>[]) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ])))
}

async function loadTellwiseMetrics() {
  const [
    userRows,
    activeUserRows,
    activeMarketRows,
    resolvedMarketRows,
    approvalRows,
    failedJobRows,
    activeMarkets,
    resolvedMarkets,
    recentNotifications,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(sessions),
    db.select({ value: count() }).from(markets).innerJoin(events, eq(events.id, markets.event_id)).where(and(eq(markets.is_active, true), eq(markets.is_resolved, false), eq(events.is_hidden, false))),
    db.select({ value: count() }).from(markets).where(eq(markets.is_resolved, true)),
    db.select({ value: count() }).from(event_creations).where(inArray(event_creations.status, ['draft', 'pending'])),
    db.select({ value: count() }).from(jobs).where(eq(jobs.status, 'failed')),
    db.select({
      id: markets.condition_id,
      title: markets.title,
      slug: events.slug,
      volume: markets.volume,
      volume24h: markets.volume_24h,
      endDate: markets.end_time,
      updatedAt: markets.updated_at,
    }).from(markets).innerJoin(events, eq(events.id, markets.event_id)).where(and(eq(markets.is_active, true), eq(markets.is_resolved, false), eq(events.is_hidden, false))).orderBy(sql`${markets.volume}::numeric DESC`).limit(30),
    db.select({
      id: markets.condition_id,
      title: markets.title,
      slug: events.slug,
      volume: markets.volume,
      endDate: markets.end_time,
      updatedAt: markets.updated_at,
    }).from(markets).innerJoin(events, eq(events.id, markets.event_id)).where(eq(markets.is_resolved, true)).orderBy(sql`${markets.updated_at} DESC`).limit(30),
    db.select({
      id: notifications.id,
      type: notifications.category,
      title: notifications.title,
      detail: notifications.description,
      userId: notifications.user_id,
      createdAt: notifications.created_at,
    }).from(notifications).orderBy(sql`${notifications.created_at} DESC`).limit(30),
  ])

  return {
    counts: {
      totalUsers: Number(userRows[0]?.value ?? 0),
      activeUsers: Number(activeUserRows[0]?.value ?? 0),
      activeMarkets: Number(activeMarketRows[0]?.value ?? 0),
      resolvedMarkets: Number(resolvedMarketRows[0]?.value ?? 0),
      pendingApprovals: Number(approvalRows[0]?.value ?? 0),
      failedJobs: Number(failedJobRows[0]?.value ?? 0),
    },
    markets: {
      active: serializeRows(activeMarkets as unknown as Record<string, unknown>[]),
      resolved: serializeRows(resolvedMarkets as unknown as Record<string, unknown>[]),
    },
    activity: serializeRows(recentNotifications as unknown as Record<string, unknown>[]),
  }
}

async function loadSlimefishBackendMetrics() {
  return loadLedgerDashboardReport<Pick<AdminDashboardData,
    'volumeData' | 'recentTrades' | 'balances' | 'positions' | 'liquidity' | 'resolutions' | 'topTraders' | 'riskSignals'
  > & { summary: Omit<AdminDashboardData['stats'], 'totalUsers' | 'activeUsers' | 'activeMarkets' | 'resolvedMarkets' | 'pendingApprovals' | 'failedJobs'> }>()
}
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [tellwise, ledgerResult] = await Promise.all([
    loadTellwiseMetrics(),
    loadSlimefishBackendMetrics()
      .then(data => ({ data, error: null }))
      .catch(error => ({ data: null, error })),
  ])

  if (ledgerResult.data) {
    const ledger = ledgerResult.data
    return {
      stats: { ...tellwise.counts, ...ledger.summary },
      ...ledger,
      markets: tellwise.markets,
      activity: tellwise.activity,
      services: { tellwiseDatabase: 'operational', slimefishBackendDatabase: 'operational', slimefishBackendError: null },
    }
  }

  const slimefishBackendError = ledgerResult.error instanceof Error
    ? ledgerResult.error.message
    : 'Slimefish ledger database is unavailable.'
  console.error('Failed to load Slimefish ledger admin dashboard data', ledgerResult.error)
  return {
    stats: {
      ...tellwise.counts,
      totalTrades: 0,
      volumeAllTime: 0,
      volume1D: 0,
      volume1W: 0,
      volume1M: 0,
      userCash: 0,
      openExposure: 0,
    },
    volumeData: [],
    recentTrades: [],
    balances: [],
    positions: [],
    liquidity: [],
    resolutions: [],
    topTraders: [],
    riskSignals: [],
    markets: tellwise.markets,
    activity: tellwise.activity,
    services: { tellwiseDatabase: 'operational', slimefishBackendDatabase: 'unavailable', slimefishBackendError },
  }
}

export async function getAdminDashboardStats() {
  return (await getAdminDashboardData()).stats
}

export async function getAdminMarkets() {
  return (await getAdminDashboardData()).markets
}

export async function getAdminVolumeData() {
  return (await getAdminDashboardData()).volumeData
}

export async function getAdminRiskSignalCount() {
  const [databaseRows, ledgerReport] = await Promise.all([
    db
      .select({ value: count() })
      .from(risk_cases)
      .where(notInArray(risk_cases.status, ['cleared', 'closed'])),
    loadSlimefishBackendMetrics().catch(() => null),
  ])

  return Number(databaseRows[0]?.value ?? 0) + Number(ledgerReport?.riskSignals.length ?? 0)
}
