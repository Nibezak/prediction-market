import type { Route } from 'next'
import type { AdminWorkspaceId } from '@/lib/staff-role'
import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import AppLink from '@/components/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  ADMIN_WORKSPACES_BY_ROLE,

  canAccessAdminWorkspace,
  getUserPlatformRole,
} from '@/lib/staff-role'
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

async function loadWorkspaceData(auditPage = 1) {
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
    db.select({ value: count() }).from(events).where(eq(events.status, 'active')),
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

  const [recentAuditEvents, auditEventCountRows, openRiskCases, recentRiskSignals, recentWithdrawals] = await Promise.all([
    db.select().from(audit_events).orderBy(desc(audit_events.occurred_at)).limit(auditPageSize).offset((safeAuditPage - 1) * auditPageSize),
    db.select({ value: count() }).from(audit_events),
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

  let recentTrades: Array<Record<string, unknown>> = []
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
    apiError = error instanceof Error ? error.message : 'Play Money API probe failed.'
  }

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
    recentAuditEvents,
    auditPagination: {
      page: safeAuditPage,
      pageSize: auditPageSize,
      total: Number(auditEventCountRows[0]?.value || 0),
    },
    openRiskCases,
    recentRiskSignals,
    recentWithdrawals,
    overdueEvents,
    recentTrades,
    health: {
      tellwiseDatabase: { status: 'operational' as const, latencyMs: Date.now() - tellwiseStartedAt, detail: 'Primary application database accepted a live query.' },
      playMoneyDatabase: { status: ledgerStatus, latencyMs: Date.now() - ledgerStartedAt, detail: ledgerError || 'Internal ledger database accepted a live query.' },
      playMoneyApi: { status: apiStatus, latencyMs: apiLatencyMs, detail: apiError || 'AMM API accepted a live request.' },
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
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor / subject</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentAuditEvents.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No platform actions have been recorded since the audit ledger was enabled.
                  </TableCell>
                </TableRow>
              )}
              {data.recentAuditEvents.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.occurred_at)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.event_type}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{row.actor_user_id || 'system'}</div>
                    <div className="text-muted-foreground">
                      {row.subject_user_id || 'no subject'}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={row.outcome === 'failure' || row.outcome === 'denied' ? 'destructive' : row.outcome === 'pending' ? 'secondary' : 'outline'}>{row.outcome}</Badge></TableCell>
                  <TableCell className="max-w-lg">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Inspect timestamp and evidence</summary>
                      <pre className="mt-2 max-h-64 overflow-auto border p-2 text-xs whitespace-pre-wrap">
                        {JSON.stringify({ id: row.id, occurredAt: row.occurred_at, severity: row.severity, actorRole: row.actor_role, entity: [row.entity_type, row.entity_id], requestId: row.request_id, riskScore: row.risk_score, metadata: row.metadata, before: row.before_values, after: row.after_values }, null, 2)}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <Button variant="outline" size="sm" asChild disabled={data.auditPagination.page <= 1}><AppLink href={`?auditPage=${Math.max(1, data.auditPagination.page - 1)}` as Route}>Previous 100</AppLink></Button>
            <span className="text-xs text-muted-foreground">
              Records
              {data.auditPagination.total === 0 ? 0 : (data.auditPagination.page - 1) * data.auditPagination.pageSize + 1}
              -
              {Math.min(data.auditPagination.page * data.auditPagination.pageSize, data.auditPagination.total)}
              {' '}
              of
              {data.auditPagination.total}
            </span>
            <Button variant="outline" size="sm" asChild disabled={data.auditPagination.page >= totalPages}><AppLink href={`?auditPage=${Math.min(totalPages, data.auditPagination.page + 1)}` as Route}>Next 100</AppLink></Button>
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
                    <div className="max-w-md text-xs text-muted-foreground">
                      {row.summary}
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        Inspect
                        {row.signalCount}
                        {' '}
                        signals
                      </summary>
                      <div className="mt-2 grid gap-2">
                        {data.recentRiskSignals.filter(signal => signal.case_id === row.id).map(signal => (
                          <div
key={signal.id} className="border p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
<strong>{signal.rule_id} · {signal.title}</strong><Badge variant="outline">
+{signal.score}</Badge></div>
<div className="
  text-muted-foreground
">{signal.description}</div>
                            <pre className="mt-1 overflow-auto whitespace-pre-wrap">{JSON.stringify({ observed: signal.observed_value, threshold: signal.threshold, evidence: signal.evidence }, null, 2)}</pre>
                          </div>
                        ))}
                      </div>
                    </details>
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
                    <div className="flex justify-end gap-1">
                      <form action={claimRiskCaseAction}>
                        <input type="hidden" name="caseId" value={row.id} />
                        <Button variant="outline" size="sm" type="submit">Claim</Button>
                      </form>
                      <form action={completeRiskReviewAction}>
                        <input type="hidden" name="caseId" value={row.id} />
                        <input type="hidden" name="disposition" value="cleared" />
                        <Button variant="outline" size="sm" type="submit">Clear</Button>
                      </form>
                      <form action={completeRiskReviewAction}>
                        <input type="hidden" name="caseId" value={row.id} />
                        <input type="hidden" name="disposition" value="confirmed" />
                        <Button variant="destructive" size="sm" type="submit">Confirm</Button>
                      </form>
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

function WorkspaceBody({ workspace, data, role }: {
  workspace: AdminWorkspaceId
  data: Awaited<ReturnType<typeof loadWorkspaceData>>
  role: ReturnType<typeof getUserPlatformRole>
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
    return <UserQueue users={data.recentUsers} emptyLabel="No users found." />
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
  searchParams: Promise<{ auditPage?: string }>
}) {
  const { locale, workspace } = await params
  setRequestLocale(locale)
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)
  if (!canAccessAdminWorkspace(role, workspace)) {
    notFound()
  }

  const query = await searchParams
  const requestedAuditPage = Number.parseInt(query.auditPage || '1', 10)
  const data = await loadWorkspaceData(Number.isFinite(requestedAuditPage) ? requestedAuditPage : 1)
  const copy = WORKSPACE_COPY[workspace]
  const workspaceTabs = ADMIN_WORKSPACES_BY_ROLE[role]
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
          <WorkspaceBody workspace={workspace} data={data} role={role} />
        </div>
      </div>
    </section>
  )
}
