import { count, eq, inArray, sql } from 'drizzle-orm'
import { event_creations, events, jobs, markets, notifications, sessions, users } from '@/lib/db/schema'
import { db, pmSql } from '@/lib/drizzle'

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
    playMoneyDatabase: 'operational' | 'unavailable'
    playMoneyError: string | null
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
    db.select({ value: count() }).from(markets).where(eq(markets.is_active, true)),
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
    }).from(markets).innerJoin(events, eq(events.id, markets.event_id)).where(eq(markets.is_active, true)).orderBy(sql`${markets.volume}::numeric DESC`).limit(30),
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

async function loadPlayMoneyMetrics() {
  const [summaryRows, volumeRows, tradeRows, balanceRows, positionRows, liquidityRows, resolutionRows, traderRows, riskRows] = await Promise.all([
    pmSql`
      SELECT
        COUNT(DISTINCT t.id) FILTER (WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL'))::int AS "totalTrades",
        COALESCE(SUM(ABS(te.amount)) FILTER (WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL') AND te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY'), 0)::text AS "volumeAllTime",
        COALESCE(SUM(ABS(te.amount)) FILTER (WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL') AND te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY' AND t."createdAt" >= NOW() - INTERVAL '1 day'), 0)::text AS "volume1D",
        COALESCE(SUM(ABS(te.amount)) FILTER (WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL') AND te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY' AND t."createdAt" >= NOW() - INTERVAL '7 days'), 0)::text AS "volume1W",
        COALESCE(SUM(ABS(te.amount)) FILTER (WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL') AND te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY' AND t."createdAt" >= NOW() - INTERVAL '30 days'), 0)::text AS "volume1M"
      FROM "Transaction" t
      LEFT JOIN "TransactionEntry" te ON te."transactionId" = t.id
    `,
    pmSql`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
      ), daily AS (
        SELECT t."createdAt"::date AS day,
          COALESCE(SUM(ABS(te.amount)) FILTER (WHERE te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY'), 0) AS volume,
          COUNT(DISTINCT t.id)::int AS trades
        FROM "Transaction" t
        LEFT JOIN "TransactionEntry" te ON te."transactionId" = t.id
        WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL') AND t."createdAt" >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY t."createdAt"::date
      )
      SELECT days.day::text AS date, COALESCE(daily.volume, 0)::text AS value, COALESCE(daily.trades, 0)::int AS trades
      FROM days LEFT JOIN daily USING (day) ORDER BY days.day
    `,
    pmSql`
      SELECT t.id, t.type, t."createdAt" AS "createdAt", u.id AS "userId", u.username,
        m.id AS "marketId", m.question AS market,
        COALESCE(SUM(ABS(te.amount)) FILTER (WHERE te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY'), 0)::text AS amount,
        MAX(mo.name) FILTER (WHERE te."assetType" = 'MARKET_OPTION') AS outcome
      FROM "Transaction" t
      LEFT JOIN "User" u ON u.id = t."initiatorId"
      LEFT JOIN "Market" m ON m.id = t."marketId"
      LEFT JOIN "TransactionEntry" te ON te."transactionId" = t.id
      LEFT JOIN "MarketOption" mo ON mo.id = te."assetId" AND te."assetType" = 'MARKET_OPTION'
      WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL')
      GROUP BY t.id, u.id, u.username, m.id, m.question
      ORDER BY t."createdAt" DESC LIMIT 75
    `,
    pmSql`
      SELECT u.id AS "userId", u.username, u.email, u.role::text AS role,
        COALESCE(b.total, 0)::text AS cash,
        COALESCE(p."positionValue", 0)::text AS "positionValue",
        (COALESCE(b.total, 0) + COALESCE(p."positionValue", 0))::text AS portfolio,
        u."createdAt" AS "createdAt"
      FROM "User" u
      LEFT JOIN "Balance" b ON b."accountId" = u."primaryAccountId" AND b."assetType" = 'CURRENCY' AND b."assetId" = 'PRIMARY' AND b."marketId" IS NULL
      LEFT JOIN (SELECT "accountId", SUM(value) AS "positionValue" FROM "MarketOptionPosition" GROUP BY "accountId") p ON p."accountId" = u."primaryAccountId"
      ORDER BY (COALESCE(b.total, 0) + COALESCE(p."positionValue", 0)) DESC, u."createdAt" DESC LIMIT 100
    `,
    pmSql`
      SELECT p.id, u.id AS "userId", u.username, m.id AS "marketId", m.question AS market,
        mo.name AS outcome, p.quantity::text, p.cost::text, p.value::text,
        (p.value - p.cost)::text AS pnl, p."updatedAt" AS "updatedAt"
      FROM "MarketOptionPosition" p
      JOIN "Account" a ON a.id = p."accountId"
      LEFT JOIN "User" u ON u."primaryAccountId" = a.id
      JOIN "Market" m ON m.id = p."marketId"
      JOIN "MarketOption" mo ON mo.id = p."optionId"
      WHERE p.quantity > 0
      ORDER BY ABS(p.value) DESC LIMIT 100
    `,
    pmSql`
      SELECT m.id AS "marketId", m.question AS market, m."resolvedAt" AS "resolvedAt",
        COALESCE(m."liquidityCount", 0)::text AS liquidity,
        COALESCE(m."uniqueTradersCount", 0)::int AS traders,
        COALESCE(m."commentCount", 0)::int AS comments,
        COALESCE(SUM(b.total) FILTER (WHERE b."assetType" = 'CURRENCY' AND b."assetId" = 'PRIMARY'), 0)::text AS "poolCash",
        STRING_AGG(mo.name || ' ' || ROUND((mo."liquidityProbability" * 100)::numeric, 1)::text || '%', ', ' ORDER BY mo.name) AS probabilities
      FROM "Market" m
      LEFT JOIN "Balance" b ON b."accountId" = m."ammAccountId"
      LEFT JOIN "MarketOption" mo ON mo."marketId" = m.id
      GROUP BY m.id, m.question, m."resolvedAt", m."liquidityCount", m."uniqueTradersCount", m."commentCount"
      ORDER BY COALESCE(m."liquidityCount", 0) DESC LIMIT 75
    `,
    pmSql`
      SELECT mr.id, m.id AS "marketId", m.question AS market, mo.name AS winner,
        u.username AS resolver, mr."createdAt" AS "resolvedAt",
        COUNT(DISTINCT p."accountId") FILTER (WHERE p.quantity > 0)::int AS participants,
        COALESCE(SUM(p.quantity) FILTER (WHERE p."optionId" = mr."resolutionId"), 0)::text AS "winningShares"
      FROM "MarketResolution" mr
      JOIN "Market" m ON m.id = mr."marketId"
      JOIN "MarketOption" mo ON mo.id = mr."resolutionId"
      LEFT JOIN "User" u ON u.id = mr."resolvedById"
      LEFT JOIN "MarketOptionPosition" p ON p."marketId" = m.id
      GROUP BY mr.id, m.id, m.question, mo.name, u.username, mr."createdAt"
      ORDER BY mr."createdAt" DESC LIMIT 50
    `,
    pmSql`
      SELECT u.id AS "userId", u.username,
        COUNT(DISTINCT p."marketId") FILTER (WHERE p.quantity > 0)::int AS positions,
        COUNT(DISTINCT p."marketId") FILTER (WHERE p.quantity > 0 AND mr."resolutionId" = p."optionId")::int AS wins,
        COALESCE(SUM(p.value - p.cost), 0)::text AS pnl,
        COALESCE(SUM(p.cost), 0)::text AS volume,
        CASE WHEN COUNT(DISTINCT p."marketId") FILTER (WHERE p.quantity > 0 AND mr.id IS NOT NULL) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(DISTINCT p."marketId") FILTER (WHERE p.quantity > 0 AND mr."resolutionId" = p."optionId")
            / COUNT(DISTINCT p."marketId") FILTER (WHERE p.quantity > 0 AND mr.id IS NOT NULL), 1) END::text AS "winRate"
      FROM "User" u
      JOIN "MarketOptionPosition" p ON p."accountId" = u."primaryAccountId"
      LEFT JOIN "MarketResolution" mr ON mr."marketId" = p."marketId"
      GROUP BY u.id, u.username
      ORDER BY COALESCE(SUM(p.value - p.cost), 0) DESC LIMIT 50
    `,
    pmSql`
      SELECT u.id AS "userId", u.username, u.email,
        COALESCE(b.total, 0)::text AS cash,
        COALESCE(u.settings->>'staff_role', u.role::text) AS role,
        CASE
          WHEN COALESCE((u.settings->>'is_blocked')::boolean, false) THEN 'Account blocked'
          WHEN COALESCE((u.settings->>'tradingBlocked')::boolean, false) THEN 'Trading suspended'
          WHEN COALESCE((u.settings->>'suspicious')::boolean, false) THEN 'Flagged for review'
          WHEN COALESCE(b.total, 0) < 0 THEN 'Negative cash balance'
          ELSE 'Review requested'
        END AS signal,
        u."updatedAt" AS "updatedAt"
      FROM "User" u
      LEFT JOIN "Balance" b ON b."accountId" = u."primaryAccountId" AND b."assetType" = 'CURRENCY' AND b."assetId" = 'PRIMARY' AND b."marketId" IS NULL
      WHERE COALESCE((u.settings->>'is_blocked')::boolean, false)
        OR COALESCE((u.settings->>'tradingBlocked')::boolean, false)
        OR COALESCE((u.settings->>'suspicious')::boolean, false)
        OR COALESCE(b.total, 0) < 0
      ORDER BY u."updatedAt" DESC LIMIT 100
    `,
  ])

  const summary = summaryRows[0] ?? {}
  const balances = serializeRows(balanceRows as unknown as Record<string, unknown>[])
  const positions = serializeRows(positionRows as unknown as Record<string, unknown>[])
  return {
    summary: {
      totalTrades: numberValue(summary.totalTrades),
      volumeAllTime: numberValue(summary.volumeAllTime),
      volume1D: numberValue(summary.volume1D),
      volume1W: numberValue(summary.volume1W),
      volume1M: numberValue(summary.volume1M),
      userCash: balances.reduce((sum, row) => sum + numberValue(row.cash), 0),
      openExposure: positions.reduce((sum, row) => sum + numberValue(row.value), 0),
    },
    volumeData: volumeRows.map(row => ({ date: String(row.date), value: numberValue(row.value), trades: numberValue(row.trades) })),
    recentTrades: serializeRows(tradeRows as unknown as Record<string, unknown>[]),
    balances,
    positions,
    liquidity: serializeRows(liquidityRows as unknown as Record<string, unknown>[]),
    resolutions: serializeRows(resolutionRows as unknown as Record<string, unknown>[]),
    topTraders: serializeRows(traderRows as unknown as Record<string, unknown>[]),
    riskSignals: serializeRows(riskRows as unknown as Record<string, unknown>[]),
  }
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [tellwise, ledgerResult] = await Promise.all([
    loadTellwiseMetrics(),
    loadPlayMoneyMetrics()
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
      services: { tellwiseDatabase: 'operational', playMoneyDatabase: 'operational', playMoneyError: null },
    }
  }

  const playMoneyError = ledgerResult.error instanceof Error
    ? ledgerResult.error.message
    : 'Play Money database is unavailable.'
  console.error('Failed to load Play Money admin dashboard data', ledgerResult.error)
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
    services: { tellwiseDatabase: 'operational', playMoneyDatabase: 'unavailable', playMoneyError },
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
