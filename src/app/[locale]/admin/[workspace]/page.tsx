import type { Route } from 'next'
import type { AdminWorkspaceId } from '@/lib/staff-role'
import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import AppLink from '@/components/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserRepository } from '@/lib/db/queries/user'
import {
  audit_events,
  conditions_audit,
  event_creations,
  events,
  jobs,
  markets,
  notifications,
  risk_cases,
  risk_signals,
  sessions,
  users,
  withdrawal_requests,
} from '@/lib/db/schema'
import { db, pmSql } from '@/lib/drizzle'
import { ADMIN_WORKSPACES_BY_ROLE, getUserPlatformRole } from '@/lib/staff-role'
import { canAccessWorkspaceWithPermissions } from '@/lib/staff-permissions'
import { claimRiskCaseAction, completeRiskReviewAction, requeueJobAction, reviewWithdrawalAction } from './actions'

const WORKSPACE_COPY: Record<AdminWorkspaceId, { title: string, description: string }> = {
  'operations': {
    title: 'Operations',
    description: 'Monitor the platform, prioritize queues, and move quickly into the tools that need attention.',
  },
  'market-review': {
    title: 'Market Review',
    description: 'Review active markets, publishing readiness, ownership, dates, and resolution preparation.',
  },
  'resolutions': {
    title: 'Resolutions',
    description: 'Inspect markets awaiting outcomes and resolve them through the AMM settlement workflow.',
  },
  'risk': {
    title: 'Risk & Fraud',
    description: 'Investigate restricted accounts, account signals, unusual access, and trading controls.',
  },
  'support': {
    title: 'Support',
    description: 'Find users, inspect their portfolios, and perform authorized balance assistance.',
  },
  'finance': {
    title: 'Finance & Ledger',
    description: 'Review ledger-facing account activity and access controlled deposit or withdrawal assistance.',
  },
  'approvals': {
    title: 'Approvals',
    description: 'Review drafts and pending market requests before they are deployed.',
  },
  'audit': {
    title: 'Audit Log',
    description: 'Trace recent condition and resolution changes with their before and after values.',
  },
  'communications': {
    title: 'Communications',
    description: 'Review recent platform notifications and user-facing operational messages.',
  },
  'system': {
    title: 'System Health',
    description: 'Inspect background jobs, failures, retries, active sessions, and service readiness.',
  },
  'access-control': {
    title: 'Access Control',
    description: 'Review staff permissions and manage user roles from the user administration table.',
  },
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return 'Not available'
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function readSetting(settings: Record<string, unknown> | null | undefined, key: string) {
  return settings?.[key] === true || settings?.[key] === 'true'
}

type AuditFilters = {
  query: string
  outcome: string
  from: string
  to: string
}

async function loadWorkspaceData(auditPage = 1, auditFilters: AuditFilters = { query: '', outcome: 'all', from: '', to: '' }) {
  const auditPageSize = 100
  const safeAuditPage = Math.max(1, Math.floor(auditPage))
  const [
    userCountRows,
    activeEventCountRows,
    approvalCountRows,
    failedJobCountRows,
    sessionCountRows,
    recentUsers,
    recentEvents,
    recentCreations,
    recentAudits,
    recentJobs,
    recentNotifications,
    overdueEvents,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(markets).leftJoin(events, eq(events.id, markets.event_id)).where(and(eq(markets.is_active, true), eq(markets.is_resolved, false), eq(events.is_hidden, false))),
    db.select({ value: count() }).from(event_creations).where(inArray(event_creations.status, ['draft', 'pending'])),
    db.select({ value: count() }).from(jobs).where(eq(jobs.status, 'failed')),
    db.select({ value: count() }).from(sessions),
    db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      settings: users.settings,
      createdAt: users.created_at,
    }).from(users).orderBy(desc(users.created_at)).limit(100),
    db.select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      status: events.status,
      endDate: events.end_date,
      createdAt: events.created_at,
    }).from(events).orderBy(desc(events.updated_at)).limit(20),
    db.select({
      id: event_creations.id,
      title: event_creations.title,
      status: event_creations.status,
      creatorId: event_creations.created_by_user_id,
      error: event_creations.last_error,
      updatedAt: event_creations.updated_at,
    }).from(event_creations).orderBy(desc(event_creations.updated_at)).limit(20),
    db.select({
      id: conditions_audit.id,
      conditionId: conditions_audit.condition_id,
      marketTitle: markets.title,
      oldValues: conditions_audit.old_values,
      newValues: conditions_audit.new_values,
      createdAt: conditions_audit.created_at,
    }).from(conditions_audit).leftJoin(markets, eq(markets.condition_id, conditions_audit.condition_id)).orderBy(desc(conditions_audit.created_at)).limit(30),
    db.select({
      id: jobs.id,
      type: jobs.job_type,
      status: jobs.status,
      attempts: jobs.attempts,
      maxAttempts: jobs.max_attempts,
      error: jobs.last_error,
      updatedAt: jobs.updated_at,
    }).from(jobs).orderBy(desc(jobs.updated_at)).limit(25),
    db.select({
      id: notifications.id,
      category: notifications.category,
      title: notifications.title,
      description: notifications.description,
      userId: notifications.user_id,
      createdAt: notifications.created_at,
    }).from(notifications).orderBy(desc(notifications.created_at)).limit(25),
    db.select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      status: events.status,
      endDate: events.end_date,
      createdAt: events.created_at,
    }).from(events).where(and(eq(events.status, 'active'), lt(events.end_date, new Date()))).orderBy(events.end_date).limit(50),
  ])

  const restrictedUsers = recentUsers.filter(user =>
    readSetting(user.settings, 'is_blocked')
    || readSetting(user.settings, 'tradingBlocked')
    || readSetting(user.settings, 'suspicious'),
  )

  const auditConditions: SQL[] = []
  const auditSearch = auditFilters.query.trim()
  if (auditSearch) {
    const pattern = `%${auditSearch}%`
    const matchingUsers = await db.select({ id: users.id }).from(users).where(or(
      ilike(users.username, pattern),
      ilike(users.email, pattern),
    )).limit(500)
    const matchingUserIds = matchingUsers.map(row => row.id)
    const searchCondition = or(
      ilike(audit_events.action, pattern),
      ilike(audit_events.event_type, pattern),
      ilike(audit_events.ip_address, pattern),
      ilike(audit_events.request_id, pattern),
      ...(matchingUserIds.length > 0
        ? [inArray(audit_events.actor_user_id, matchingUserIds), inArray(audit_events.subject_user_id, matchingUserIds)]
        : []),
    )
    if (searchCondition) auditConditions.push(searchCondition)
  }
  if (auditFilters.outcome !== 'all') {
    auditConditions.push(eq(audit_events.outcome, auditFilters.outcome))
  }
  const fromDate = auditFilters.from ? new Date(auditFilters.from) : null
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    auditConditions.push(gte(audit_events.occurred_at, fromDate))
  }
  const toDate = auditFilters.to ? new Date(auditFilters.to) : null
  if (toDate && !Number.isNaN(toDate.getTime())) {
    auditConditions.push(lte(audit_events.occurred_at, toDate))
  }
  const auditWhere = auditConditions.length > 0 ? and(...auditConditions) : undefined

  const [recentAuditEvents, auditEventCountRows, openRiskCases, recentRiskSignals, recentWithdrawals] = await Promise.all([
    db.select().from(audit_events).where(auditWhere).orderBy(desc(audit_events.occurred_at)).limit(auditPageSize).offset((safeAuditPage - 1) * auditPageSize),
    db.select({ value: count() }).from(audit_events).where(auditWhere),
    db.select({
      id: risk_cases.id,
      userId: risk_cases.user_id,
      username: users.username,
      email: users.email,
      source: risk_cases.source,
      status: risk_cases.status,
      severity: risk_cases.severity,
      score: risk_cases.score,
      title: risk_cases.title,
      summary: risk_cases.summary,
      heldAmount: risk_cases.held_amount,
      assignedTo: risk_cases.assigned_to_user_id,
      createdAt: risk_cases.created_at,
      signalCount: count(risk_signals.id),
    }).from(risk_cases)
      .leftJoin(users, eq(users.id, risk_cases.user_id))
      .leftJoin(risk_signals, eq(risk_signals.case_id, risk_cases.id))
      .groupBy(risk_cases.id, users.id)
      .orderBy(desc(risk_cases.created_at)).limit(100),
    db.select().from(risk_signals).orderBy(desc(risk_signals.created_at)).limit(500),
    db.select().from(withdrawal_requests).orderBy(desc(withdrawal_requests.requested_at)).limit(100),
  ])

  const auditUserIds = Array.from(new Set(recentAuditEvents.flatMap(row => [
    row.actor_user_id,
    row.subject_user_id,
  ]).filter((value): value is string => Boolean(value))))
  const auditUserRows = auditUserIds.length > 0
    ? await db.select({ id: users.id, username: users.username, email: users.email })
        .from(users)
        .where(inArray(users.id, auditUserIds))
    : []
  const auditUsersById = new Map(auditUserRows.map(user => [user.id, user]))
  const enrichedAuditEvents = recentAuditEvents.map(row => ({
    ...row,
    actorUser: row.actor_user_id ? auditUsersById.get(row.actor_user_id) ?? null : null,
    subjectUser: row.subject_user_id ? auditUsersById.get(row.subject_user_id) ?? null : null,
  }))

  let recentTrades: Array<Record<string, unknown>> = []
  let ledgerRiskRows: Array<Record<string, unknown>> = []
  let ledgerStatus: 'operational' | 'unavailable' = 'operational'
  let ledgerError: string | null = null
  const ledgerStartedAt = Date.now()
  try {
    const rows = await pmSql`
      SELECT t.id, t.type, t."createdAt" AS "createdAt", u.username, m.question AS market,
        COALESCE(SUM(ABS(te.amount)) FILTER (WHERE te."assetType" = 'CURRENCY' AND te."assetId" = 'PRIMARY'), 0)::text AS amount
      FROM "Transaction" t
      LEFT JOIN "User" u ON u.id = t."initiatorId"
      LEFT JOIN "Market" m ON m.id = t."marketId"
      LEFT JOIN "TransactionEntry" te ON te."transactionId" = t.id
      WHERE t.type IN ('TRADE_BUY', 'TRADE_SELL')
      GROUP BY t.id, u.username, m.question
      ORDER BY t."createdAt" DESC LIMIT 25
    `
    recentTrades = rows.map(row => ({ ...row }))
    ledgerRiskRows = (await pmSql`
      SELECT u.id AS "userId", u.username, u.email,
        COALESCE(b.total, 0)::text AS cash,
        CASE
          WHEN COALESCE((u.settings->>'is_blocked')::boolean, false) THEN 'Account blocked'
          WHEN COALESCE((u.settings->>'tradingBlocked')::boolean, false) THEN 'Trading suspended'
          WHEN COALESCE((u.settings->>'suspicious')::boolean, false) THEN 'Flagged for review'
          WHEN COALESCE(b.total, 0) < 0 THEN 'Negative cash balance'
          ELSE 'Review requested'
        END AS signal,
        u.settings AS settings,
        u."updatedAt" AS "updatedAt"
      FROM "User" u
      LEFT JOIN "Balance" b ON b."accountId" = u."primaryAccountId"
        AND b."assetType" = 'CURRENCY' AND b."assetId" = 'PRIMARY' AND b."marketId" IS NULL
      WHERE lower(COALESCE(u.email, '')) <> 'treasury@slimefish.local'
        AND lower(COALESCE(u.username, '')) <> 'house'
        AND (
          COALESCE((u.settings->>'is_blocked')::boolean, false)
          OR COALESCE((u.settings->>'tradingBlocked')::boolean, false)
          OR COALESCE((u.settings->>'suspicious')::boolean, false)
          OR COALESCE(b.total, 0) < 0
        )
      ORDER BY u."updatedAt" DESC
      LIMIT 100
    `).map(row => ({ ...row }))
  }
  catch (error) {
    ledgerStatus = 'unavailable'
    ledgerError = error instanceof Error ? error.message : 'Ledger database probe failed.'
  }

  const tellwiseStartedAt = Date.now()
  await db.execute(sql`SELECT 1`)
  const apiStartedAt = Date.now()
  let apiStatus: 'operational' | 'unavailable' = 'operational'
  let apiLatencyMs = 0
  let apiError: string | null = null
  try {
    const baseUrl = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
    const apiOrigin = new URL(baseUrl).origin
    const response = await fetch(`${apiOrigin}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    apiLatencyMs = Date.now() - apiStartedAt
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  }
  catch (error) {
    apiLatencyMs = Date.now() - apiStartedAt
    apiStatus = 'unavailable'
    apiError = error instanceof Error ? error.message : 'Slimefish ledger API probe failed.'
  }

  const ledgerRiskCases = ledgerRiskRows.map((row) => {
    const userId = String(row.userId)
    const signal = String(row.signal || 'Ledger account review')
    return {
      id: `ledger:${userId}`,
      userId,
      username: row.username ? String(row.username) : null,
      email: row.email ? String(row.email) : null,
      source: 'ledger',
      status: 'open',
      severity: signal === 'Negative cash balance' ? 'critical' : 'high',
      score: signal === 'Negative cash balance' ? '100' : '80',
      title: signal,
      summary: `The internal ledger restricted this account. Cash balance: $${Number(row.cash || 0).toFixed(2)}.`,
      heldAmount: '0',
      assignedTo: null,
      createdAt: row.updatedAt ? new Date(String(row.updatedAt)) : new Date(),
      signalCount: 1,
    }
  })
  const ledgerSignals = ledgerRiskRows.map((row) => ({
    id: `ledger-signal:${String(row.userId)}`,
    case_id: `ledger:${String(row.userId)}`,
    rule_id: 'LEDGER_ACCOUNT_RESTRICTION',
    title: String(row.signal || 'Ledger account review'),
    description: 'The internal ledger account controls require staff review before access can be restored.',
    score: String(row.signal) === 'Negative cash balance' ? '100' : '80',
    observed_value: { cash: Number(row.cash || 0), settings: row.settings },
    threshold: { restricted: true },
    evidence: { source: 'slimefish-ledger' },
    created_at: row.updatedAt ? new Date(String(row.updatedAt)) : new Date(),
  }))

  return {
    metrics: {
      users: Number(userCountRows[0]?.value || 0),
      activeEvents: Number(activeEventCountRows[0]?.value || 0),
      approvals: Number(approvalCountRows[0]?.value || 0),
      failedJobs: Number(failedJobCountRows[0]?.value || 0),
      sessions: Number(sessionCountRows[0]?.value || 0),
      restrictedUsers: restrictedUsers.length,
    },
    recentUsers,
    restrictedUsers,
    recentEvents,
    recentCreations,
    recentAudits,
    recentJobs,
    recentNotifications,
    recentAuditEvents: enrichedAuditEvents,
    auditPagination: {
      page: safeAuditPage,
      pageSize: auditPageSize,
      total: Number(auditEventCountRows[0]?.value || 0),
    },
    auditFilters,
    openRiskCases: [...ledgerRiskCases, ...openRiskCases],
    recentRiskSignals: [...ledgerSignals, ...recentRiskSignals],
    recentWithdrawals,
    overdueEvents,
    recentTrades,
    health: {
      tellwiseDatabase: { status: 'operational' as const, latencyMs: Date.now() - tellwiseStartedAt, detail: 'Primary application database accepted a live query.' },
      slimefishBackendDatabase: { status: ledgerStatus, latencyMs: Date.now() - ledgerStartedAt, detail: ledgerError || 'Internal ledger database accepted a live query.' },
      slimefishBackendApi: { status: apiStatus, latencyMs: apiLatencyMs, detail: apiError || 'AMM API accepted a live request.' },
      workerQueue: {
        status: Number(failedJobCountRows[0]?.value || 0) > 0 ? 'degraded' as const : 'operational' as const,
        latencyMs: null,
        detail: `${Number(failedJobCountRows[0]?.value || 0)} failed jobs; ${recentJobs.filter(job => job.status === 'pending').length} pending in the current window.`,
      },
    },
  }
}

function MetricCards({ metrics }: { metrics: Awaited<ReturnType<typeof loadWorkspaceData>>['metrics'] }) {
  const items = [
    ['Users', metrics.users],
    ['Active markets', metrics.activeEvents],
    ['Pending approvals', metrics.approvals],
    ['Restricted accounts', metrics.restrictedUsers],
    ['Failed jobs', metrics.failedJobs],
    ['Active sessions', metrics.sessions],
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <Card key={label}>
          <CardHeader className="pb-2">
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-2xl">{value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

function UserQueue({ users: rows, emptyLabel }: {
  users: Awaited<ReturnType<typeof loadWorkspaceData>>['recentUsers']
  emptyLabel: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow><TableCell colSpan={4}>{emptyLabel}</TableCell></TableRow>}
        {rows.map(user => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="font-medium">{user.username || 'Username pending'}</div>
              <div className="text-xs text-muted-foreground">
                {user.email}
              </div>
            </TableCell>
            <TableCell><Badge variant={readSetting(user.settings, 'is_blocked') ? 'destructive' : 'secondary'}>{readSetting(user.settings, 'is_blocked') ? 'Blocked' : 'Review'}</Badge></TableCell>
            <TableCell>{formatDate(user.createdAt)}</TableCell>
            <TableCell className="text-right"><Button variant="outline" size="sm" asChild><AppLink href={`/@${user.username || user.id}` as Route}>Open account</AppLink></Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function filterSupportUsers(rows: Awaited<ReturnType<typeof loadWorkspaceData>>['recentUsers'], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return rows
  return rows.filter(user => [
    user.id,
    user.username,
    user.email,
  ].some(value => String(value || '').toLowerCase().includes(normalized)))
}

function SupportConsole({ users: rows, query }: {
  users: Awaited<ReturnType<typeof loadWorkspaceData>>['recentUsers']
  query: string
}) {
  const filteredRows = filterSupportUsers(rows, query)
  return (
    <Card>
      <CardHeader>
        <CardTitle>User support</CardTitle>
        <CardDescription>Search for a user, inspect their account, and continue support from the user profile.</CardDescription>
        <form method="get" className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Input
            name="supportQuery"
            defaultValue={query}
            placeholder="Search by username, email, or user ID"
            aria-label="Search support users"
            className="sm:max-w-md"
          />
          <div className="flex gap-2">
            <Button type="submit">Search</Button>
            {query && (
              <Button variant="outline" asChild>
                <AppLink href="/admin/support">Clear</AppLink>
              </Button>
            )}
          </div>
        </form>
      </CardHeader>
      <CardContent className="p-0">
        <UserQueue users={filteredRows} emptyLabel={query ? 'No users match that search.' : 'No users found.'} />
      </CardContent>
    </Card>
  )
}

function EventQueue({ rows, resolutionOnly = false }: {
  rows: Awaited<ReturnType<typeof loadWorkspaceData>>['recentEvents']
  resolutionOnly?: boolean
}) {
  const visibleRows = resolutionOnly ? rows.filter(row => row.status !== 'resolved') : rows
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>End date</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows.map(row => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.title}</TableCell>
            <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
            <TableCell>{formatDate(row.endDate)}</TableCell>
            <TableCell className="text-right"><Button variant="outline" size="sm" asChild><AppLink href={`/event/${row.slug}` as Route}>Inspect market</AppLink></Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function JobsTable({ rows, allowRetry = false }: {
  rows: Awaited<ReturnType<typeof loadWorkspaceData>>['recentJobs']
  allowRetry?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>Last update</TableHead>
          <TableHead>Error</TableHead>
          {allowRetry && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={allowRetry ? 6 : 5}
              className="h-20 text-center text-muted-foreground"
            >
              No jobs in this queue.
            </TableCell>
          </TableRow>
        )}
        {rows.map(row => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="font-medium">{row.type}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {row.id}
              </div>
            </TableCell>
            <TableCell><Badge variant={row.status === 'failed' ? 'destructive' : row.status === 'completed' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
            <TableCell>
              {row.attempts}
              /
              {row.maxAttempts}
            </TableCell>
            <TableCell>{formatDate(row.updatedAt)}</TableCell>
            <TableCell className="max-w-sm"><span className="line-clamp-2 text-xs text-muted-foreground">{row.error || 'None'}</span></TableCell>
            {allowRetry && (
              <TableCell className="text-right">
                {row.status === 'failed' && (
                  <form action={requeueJobAction}>
                    <input type="hidden" name="jobId" value={row.id} />
                    <Button type="submit" size="sm" variant="outline">Requeue</Button>
                  </form>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function OperationsConsole({ data }: { data: Awaited<ReturnType<typeof loadWorkspaceData>> }) {
  const failedJobs = data.recentJobs.filter(job => job.status === 'failed')
  const pendingCreations = data.recentCreations.filter(item => item.status === 'draft' || item.status === 'pending')
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Ended markets awaiting action</CardTitle>
          <CardDescription>Active events whose end date has passed. These require outcome review or an explicit extension.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EventQueue rows={data.overdueEvents} resolutionOnly />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Publishing queue</CardTitle>
          <CardDescription>Drafts and requests that have not reached deployment.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Failure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingCreations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-20 text-center text-muted-foreground"
                  >
                    Publishing queue is clear.
                  </TableCell>
                </TableRow>
              )}
              {pendingCreations.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{row.creatorId}</TableCell>
                  <TableCell>{formatDate(row.updatedAt)}</TableCell>
                  <TableCell className="max-w-sm text-xs text-destructive">{row.error || 'None'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Failed background work</CardTitle>
          <CardDescription>Failures with exact retry counts and errors. Authorized staff can requeue them from System Health.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <JobsTable rows={failedJobs} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Restricted accounts</CardTitle>
          <CardDescription>Blocked, trading-suspended, or suspicious users currently requiring review.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <UserQueue users={data.restrictedUsers} emptyLabel="No restricted accounts." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Latest ledger trades</CardTitle>
          <CardDescription>Most recent completed AMM transactions from the internal ledger.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Trader</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentTrades.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No ledger trades available.
                  </TableCell>
                </TableRow>
              )}
              {data.recentTrades.map(row => (
                <TableRow key={String(row.id)}>
                  <TableCell>{formatDate(String(row.createdAt))}</TableCell>
                  <TableCell>{String(row.username || 'Unknown')}</TableCell>
                  <TableCell className="max-w-md truncate">{String(row.market || 'Unknown market')}</TableCell>
                  <TableCell><Badge variant="outline">{String(row.type).replace('TRADE_', '')}</Badge></TableCell>
                  <TableCell className="text-right">
                    $
                    {Number(row.amount || 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SystemConsole({ data }: { data: Awaited<ReturnType<typeof loadWorkspaceData>> }) {
  return (
    <div className="grid gap-6 pt-4">
      <div className="overflow-hidden border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(data.health).map(([name, probe]) => (
              <TableRow key={name}>
                <TableCell className="font-medium capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</TableCell>
                <TableCell><Badge variant={probe.status === 'operational' ? 'default' : probe.status === 'degraded' ? 'secondary' : 'destructive'}>{probe.status}</Badge></TableCell>
                <TableCell>{probe.latencyMs === null ? 'Queue' : `${probe.latencyMs} ms`}</TableCell>
                <TableCell className="max-w-xl whitespace-normal text-muted-foreground">{probe.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="overflow-hidden border">
        <div className="border-b p-4 sm:px-6">
          <CardTitle>Background job control</CardTitle>
          <CardDescription className="mt-1">Live queue state. Requeue resets a failed job for another worker attempt; it does not duplicate completed work.</CardDescription>
        </div>
        <JobsTable rows={data.recentJobs} allowRetry />
      </div>
    </div>
  )
}

function AuditConsole({ data }: { data: Awaited<ReturnType<typeof loadWorkspaceData>> }) {
  const totalPages = Math.max(1, Math.ceil(data.auditPagination.total / data.auditPagination.pageSize))
  const auditPageHref = (page: number) => {
    const params = new URLSearchParams()
    params.set('auditPage', String(page))
    if (data.auditFilters.query) params.set('auditQuery', data.auditFilters.query)
    if (data.auditFilters.outcome !== 'all') params.set('auditOutcome', data.auditFilters.outcome)
    if (data.auditFilters.from) params.set('auditFrom', data.auditFilters.from)
    if (data.auditFilters.to) params.set('auditTo', data.auditFilters.to)
    return `?${params.toString()}` as Route
  }
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Condition changes retained</CardDescription>
            <CardTitle>{data.recentAudits.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Creation records retained</CardDescription>
            <CardTitle>{data.recentCreations.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Notification records retained</CardDescription>
            <CardTitle>{data.recentNotifications.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Platform action ledger</CardTitle>
          <CardDescription>
            Append-only authentication, money, trading, market, security, community, and staff activity. Sensitive request fields are redacted before storage. Showing page
            {data.auditPagination.page}
            {' '}
            of
            {totalPages}
            {' '}
            (
            {data.auditPagination.total}
            {' '}
            actions).
          </CardDescription>
          <form method="get" className="grid gap-3 pt-3 lg:grid-cols-[minmax(15rem,1fr)_11rem_13rem_13rem_auto]">
            <Input
              name="auditQuery"
              defaultValue={data.auditFilters.query}
              placeholder="Name, email, IP address, action..."
              aria-label="Search audit log"
            />
            <Select name="auditOutcome" defaultValue={data.auditFilters.outcome}>
              <SelectTrigger aria-label="Filter by result"><SelectValue placeholder="All results" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="success">Succeeded</SelectItem>
                <SelectItem value="failure">Failed</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Input name="auditFrom" type="datetime-local" defaultValue={data.auditFilters.from} aria-label="From date and time" />
            <Input name="auditTo" type="datetime-local" defaultValue={data.auditFilters.to} aria-label="To date and time" />
            <div className="flex gap-2">
              <Button type="submit">Filter</Button>
              <Button variant="outline" asChild><AppLink href="?">Clear</AppLink></Button>
            </div>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Time</TableHead>
                <TableHead className="w-52">Action</TableHead>
                <TableHead>Actor / subject</TableHead>
                <TableHead className="w-36">IP address</TableHead>
                <TableHead className="w-24">Result</TableHead>
                <TableHead className="w-24">Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentAuditEvents.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No platform actions have been recorded since the audit ledger was enabled.
                  </TableCell>
                </TableRow>
              )}
              {data.recentAuditEvents.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.occurred_at)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.event_type}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-0 text-xs whitespace-normal">
                    <div className="font-medium">{row.actorUser?.username || row.actorUser?.email || (row.actor_user_id ? 'Unknown actor' : 'System')}</div>
                    {row.actorUser?.username && <div className="text-muted-foreground">{row.actorUser.email}</div>}
                    {row.subject_user_id && (
                      <div className="mt-1 border-t pt-1 text-muted-foreground">
                        Affected:
                        {' '}
                        {row.subjectUser?.username || row.subjectUser?.email || 'Unknown user'}
                        {row.subjectUser?.username && ` (${row.subjectUser.email})`}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{row.ip_address || 'Server / unavailable'}</TableCell>
                  <TableCell><Badge variant={row.outcome === 'failure' || row.outcome === 'denied' ? 'destructive' : row.outcome === 'pending' ? 'secondary' : 'outline'}>{row.outcome}</Badge></TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild><Button size="sm" variant="outline">Inspect</Button></DialogTrigger>
                      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Audit evidence</DialogTitle>
                          <DialogDescription>{formatDate(row.occurred_at)} · {row.action}</DialogDescription>
                        </DialogHeader>
                        <pre className="max-h-[65vh] max-w-full overflow-auto rounded-md border bg-muted/30 p-4 text-xs whitespace-pre-wrap break-all">
                          {JSON.stringify({ id: row.id, occurredAt: row.occurred_at, severity: row.severity, actor: { id: row.actor_user_id, username: row.actorUser?.username, email: row.actorUser?.email, role: row.actor_role }, subject: { id: row.subject_user_id, username: row.subjectUser?.username, email: row.subjectUser?.email }, ipAddress: row.ip_address, userAgent: row.user_agent, entity: [row.entity_type, row.entity_id], requestId: row.request_id, riskScore: row.risk_score, metadata: row.metadata, before: row.before_values, after: row.after_values }, null, 2)}
                        </pre>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <Button variant="outline" size="sm" asChild disabled={data.auditPagination.page <= 1}><AppLink href={auditPageHref(Math.max(1, data.auditPagination.page - 1))}>Previous 100</AppLink></Button>
            <span className="text-xs text-muted-foreground">
              Records
              {data.auditPagination.total === 0 ? 0 : (data.auditPagination.page - 1) * data.auditPagination.pageSize + 1}
              -
              {Math.min(data.auditPagination.page * data.auditPagination.pageSize, data.auditPagination.total)}
              {' '}
              of
              {data.auditPagination.total}
            </span>
            <Button variant="outline" size="sm" asChild disabled={data.auditPagination.page >= totalPages}><AppLink href={auditPageHref(Math.min(totalPages, data.auditPagination.page + 1))}>Next 100</AppLink></Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Condition and resolution changes</CardTitle>
          <CardDescription>Exact database before/after snapshots produced by the condition audit trigger.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Changed</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Recorded values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentAudits.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No audited condition changes.
                  </TableCell>
                </TableRow>
              )}
              {data.recentAudits.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>{row.marketTitle || 'Unknown market'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.conditionId}</TableCell>
                  <TableCell className="max-w-xl">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Inspect before and after</summary>
                      <div className="mt-2 grid gap-2 font-mono text-xs">
                        <pre className="overflow-x-auto border p-2 whitespace-pre-wrap">
                          Before:
                          {JSON.stringify(row.oldValues, null, 2)}
                        </pre>
                        <pre className="overflow-x-auto border p-2 whitespace-pre-wrap">
                          After:
                          {JSON.stringify(row.newValues, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Market creation history</CardTitle>
          <CardDescription>Who created each recent market request and whether deployment failed.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Updated</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentCreations.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.updatedAt)}</TableCell>
                  <TableCell className="font-medium">
                    {row.title}
                  </TableCell>
                  <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.creatorId}
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-destructive">{row.error || 'None'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function RiskConsole({ data }: { data: Awaited<ReturnType<typeof loadWorkspaceData>> }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Open review cases</CardDescription>
            <CardTitle>{data.openRiskCases.filter(row => !['cleared', 'closed'].includes(row.status)).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Funds held</CardDescription>
            <CardTitle>
              $
              {data.openRiskCases.reduce((sum, row) => sum + Number(row.heldAmount || 0), 0).toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Triggered signals</CardDescription>
            <CardTitle>{data.openRiskCases.reduce((sum, row) => sum + Number(row.signalCount || 0), 0)}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Investigation queue</CardTitle>
          <CardDescription>Explainable cases with their score, source, evidence count, held value, and account link.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opened</TableHead>
                <TableHead>Case</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Funds</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.openRiskCases.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No risk cases are awaiting review.
                  </TableCell>
                </TableRow>
              )}
              {data.openRiskCases.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.title}</div>
                    <div className="max-w-md text-xs text-muted-foreground truncate">
                      {row.summary}
                    </div>
                  </TableCell>
                  <TableCell>
                    <AppLink href={`/@${row.username || row.userId}` as Route} className="font-medium hover:underline">
                      {row.username ? `@${row.username}` : row.userId}
                    </AppLink>
                    <div className="text-xs text-muted-foreground">{row.email || row.userId}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.severity === 'critical' || row.severity === 'high' ? 'destructive' : 'secondary'}>
                      {row.score}
                      {' '}
                      ·
                      {' '}
                      {row.severity}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.signalCount}
                      {' '}
                      signals
                    </div>
                  </TableCell>
                  <TableCell>
                    $
                    {Number(row.heldAmount || 0).toFixed(2)}
                    <div className="text-xs text-muted-foreground">{row.status}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">Inspect</Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Risk Case Evidence & Signals</DialogTitle>
                            <DialogDescription>{formatDate(row.createdAt)} · {row.title}</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-1">
                            <div className="rounded-md border bg-muted/20 p-3 text-xs">
                              <div className="font-semibold text-foreground">{row.title}</div>
                              <div className="mt-1 text-muted-foreground">{row.summary}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                                <span>User: {row.username ? `@${row.username}` : row.userId}</span>
                                <span>Email: {row.email || 'None'}</span>
                                <span>Score: {row.score}</span>
                                <span>Severity: {row.severity}</span>
                                <span>Held: ${Number(row.heldAmount || 0).toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="font-medium text-xs text-foreground">Triggered Signals ({data.recentRiskSignals.filter(s => s.case_id === row.id).length})</div>
                            {data.recentRiskSignals.filter(signal => signal.case_id === row.id).map(signal => (
                              <div key={signal.id} className="rounded-md border p-3 text-xs space-y-1.5 bg-background">
                                <div className="flex items-center justify-between font-semibold">
                                  <span>{signal.rule_id} · {signal.title}</span>
                                  <Badge variant="outline">+{signal.score}</Badge>
                                </div>
                                <div className="text-muted-foreground">{signal.description}</div>
                                <pre className="mt-2 max-h-48 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                                  {JSON.stringify({ observed: signal.observed_value, threshold: signal.threshold, evidence: signal.evidence }, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                      {row.source === 'ledger'
                        ? (
                            <Button variant="outline" size="sm" asChild>
                              <AppLink href={`/admin/users?userId=${encodeURIComponent(row.userId)}` as Route}>Open account</AppLink>
                            </Button>
                          )
                        : <form action={claimRiskCaseAction}>
                        <input type="hidden" name="caseId" value={row.id} />
                        <Button variant="outline" size="sm" type="submit">Claim</Button>
                          </form>}
                      {row.source !== 'ledger' && <form action={completeRiskReviewAction}>
                        <input type="hidden" name="caseId" value={row.id} />
                        <input type="hidden" name="disposition" value="cleared" />
                        <Button variant="outline" size="sm" type="submit">Clear</Button>
                      </form>}
                      {row.source !== 'ledger' && <form action={completeRiskReviewAction}>
                        <input type="hidden" name="caseId" value={row.id} />
                        <input type="hidden" name="disposition" value="confirmed" />
                        <Button variant="destructive" size="sm" type="submit">Confirm</Button>
                      </form>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function FinanceConsole({ data }: { data: Awaited<ReturnType<typeof loadWorkspaceData>> }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Withdrawal requests</CardDescription>
            <CardTitle>{data.recentWithdrawals.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Held for review</CardDescription>
            <CardTitle>{data.recentWithdrawals.filter(row => row.status === 'held').length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Value in review</CardDescription>
            <CardTitle>
              $
              {data.recentWithdrawals.filter(row => row.status === 'held').reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal control queue</CardTitle>
          <CardDescription>Requests stay visible from initial risk decision through review and completion.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentWithdrawals.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No withdrawal requests recorded.
                  </TableCell>
                </TableRow>
              )}
              {data.recentWithdrawals.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.requested_at)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.user_id}
                  </TableCell>
                  <TableCell>
                    $
                    {Number(row.amount).toFixed(2)}
                    {' '}
                    {row.currency}
                  </TableCell>
                  <TableCell><Badge variant={row.status === 'held' || row.status === 'rejected' ? 'destructive' : 'outline'}>{row.status}</Badge></TableCell>
                  <TableCell>
                    {row.status === 'held'
                      ? (
                          <div className="flex gap-1">
                            <form action={reviewWithdrawalAction}>
                              <input type="hidden" name="requestId" value={row.id} />
<input type="hidden" name="decision" value="approve" />
                              <Button size="sm" type="submit">Approve</Button>
                            </form>
                            <form action={reviewWithdrawalAction}>
                              <input type="hidden" name="requestId" value={row.id} />
<input type="hidden" name="decision" value="reject" />
                              <Button variant="destructive" size="sm" type="submit">Reject</Button>
                            </form>
                          </div>
                        )
                      : (
                          <>
                            <div className="text-xs">{row.review_note || 'Not reviewed'}</div>
                            {row.risk_case_id && (
<div className="
  font-mono text-xs text-muted-foreground
">
Case{row.risk_case_id}</div>
)}
                          </>
                        )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function WorkspaceBody({ workspace, data, role, supportQuery }: {
  workspace: AdminWorkspaceId
  data: Awaited<ReturnType<typeof loadWorkspaceData>>
  role: ReturnType<typeof getUserPlatformRole>
  supportQuery: string
}) {
  if (workspace === 'operations') {
    return <OperationsConsole data={data} />
  }
  if (workspace === 'market-review' || workspace === 'resolutions') {
    return <EventQueue rows={data.recentEvents} resolutionOnly={workspace === 'resolutions'} />
  }
  if (workspace === 'risk') {
    return <RiskConsole data={data} />
  }
  if (workspace === 'finance') {
    return <FinanceConsole data={data} />
  }
  if (workspace === 'support') {
    return <SupportConsole users={data.recentUsers} query={supportQuery} />
  }
  if (workspace === 'approvals') {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Request</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Last update</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.recentCreations.map(row => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.title}</div>
                {row.error && <div className="text-xs text-destructive">{row.error}</div>}
              </TableCell>
              <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{row.creatorId}</TableCell>
              <TableCell>{formatDate(row.updatedAt)}</TableCell>
              <TableCell className="text-right"><Button variant="outline" size="sm" asChild><AppLink href={`/admin/events/calendar/new?draftId=${row.id}&edit=1` as Route}>Inspect</AppLink></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
  if (workspace === 'audit') {
    return <AuditConsole data={data} />
  }
  if (workspace === 'communications') {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Notification</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Sent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.recentNotifications.map(row => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.title}</div>
                <div className="text-xs text-muted-foreground">{row.description}</div>
              </TableCell>
              <TableCell><Badge variant="outline">{row.category}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{row.userId}</TableCell>
              <TableCell>{formatDate(row.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
  if (workspace === 'system') {
    return <SystemConsole data={data} />
  }

  const permissionRows = Object.entries(ADMIN_WORKSPACES_BY_ROLE).filter(([name]) => name !== 'USER')
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Role</TableHead>
          <TableHead>Operational workspaces</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {permissionRows.map(([name, workspaces]) => (
          <TableRow key={name}>
            <TableCell><Badge variant={name === role ? 'default' : 'outline'}>{name}</Badge></TableCell>
            <TableCell>{workspaces.join(', ')}</TableCell>
            <TableCell className="text-right"><Button variant="outline" size="sm" asChild><AppLink href="/admin/users">Manage assignments</AppLink></Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default async function AdminWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string, workspace: string }>
  searchParams: Promise<{
    auditPage?: string
    auditQuery?: string
    auditOutcome?: string
    auditFrom?: string
    auditTo?: string
    supportQuery?: string
  }>
}) {
  const { locale, workspace } = await params
  setRequestLocale(locale)
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)
  if (!canAccessWorkspaceWithPermissions(currentUser, workspace)) {
    notFound()
  }

  const query = await searchParams
  const supportQuery = query.supportQuery?.slice(0, 200) || ''
  const requestedAuditPage = Number.parseInt(query.auditPage || '1', 10)
  const data = await loadWorkspaceData(
    Number.isFinite(requestedAuditPage) ? requestedAuditPage : 1,
    {
      query: query.auditQuery?.slice(0, 200) || '',
      outcome: ['all', 'success', 'failure', 'denied', 'pending'].includes(query.auditOutcome || '') ? query.auditOutcome! : 'all',
      from: query.auditFrom || '',
      to: query.auditTo || '',
    },
  )
  const copy = WORKSPACE_COPY[workspace]
  const workspaceTabs = (Object.keys(WORKSPACE_COPY) as AdminWorkspaceId[]).filter(tab => canAccessWorkspaceWithPermissions(currentUser, tab))
  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
      </div>
      <div className="overflow-hidden border bg-background">
        <nav className="relative overflow-x-auto" aria-label="Admin workspace tabs">
          <div className="flex min-w-max items-center gap-6 border-b px-4 pt-4 sm:px-6">
            {workspaceTabs.map(tab => (
              <AppLink
                key={tab}
                href={`/admin/${tab}` as Route}
                className={`relative pb-3 text-sm font-semibold whitespace-nowrap transition-colors ${workspace === tab
                  ? `text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary`
                  : `text-muted-foreground hover:text-foreground`}`}
              >
                {WORKSPACE_COPY[tab].title}
              </AppLink>
            ))}
          </div>
        </nav>
        <div className="px-4 pt-4 pb-6 sm:px-6">
          {workspace === 'operations' && <div className="mb-6"><MetricCards metrics={data.metrics} /></div>}
          <WorkspaceBody workspace={workspace} data={data} role={role} supportQuery={supportQuery} />
        </div>
      </div>
    </section>
  )
}
