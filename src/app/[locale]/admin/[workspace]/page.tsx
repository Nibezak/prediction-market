import type { Route } from 'next'
import type { AdminWorkspaceId } from '@/lib/staff-role'
import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { ChevronRightIcon, PlusIcon } from 'lucide-react'
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
import { getAdminWorkspaceSections, getDefaultAdminWorkspaceSection } from '@/lib/admin-workspace-sections'
import {
  audit_events,
  conditions_audit,
  event_creations,
  events,
  jobs,
  markets,
  notification_campaigns,
  notifications,
  payment_intents,
  risk_cases,
  risk_signals,
  sessions,
  users,
  withdrawal_requests,
} from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { loadLedgerDashboardReport } from '@/lib/slimefish-backend-reporting'
import { ADMIN_WORKSPACES_BY_ROLE, getUserPlatformRole } from '@/lib/staff-role'
import { canAccessWorkspaceWithPermissions } from '@/lib/staff-permissions'
import { loadKesPerUsdRate } from '@/lib/finance-display-settings'
import { slimefishBackendUserRequest } from '@/lib/slimefish-backend-user-request'
import { claimRiskCaseAction, completeRiskReviewAction, requeueJobAction, reviewWithdrawalAction, updateFinanceRateAction, updateLedgerFinanceSettingsAction } from './actions'
import AdminNotificationComposer from './AdminNotificationComposer'
import AdminLiveRefresh from './AdminLiveRefresh'
import AdminWorkspaceTrend from './AdminWorkspaceTrend'

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

function buildStatusTrend(rows: Array<{ date: Date | string | null, status: string | null | undefined }>) {
  const byDay = new Map<string, { date: string, success: number, pending: number, failed: number }>()
  for (const row of rows) {
    if (!row.date) continue
    const date = new Date(row.date)
    if (Number.isNaN(date.getTime())) continue
    const key = date.toISOString().slice(0, 10)
    const point = byDay.get(key) || { date: `${key}T00:00:00.000Z`, success: 0, pending: 0, failed: 0 }
    const status = String(row.status || '').toLowerCase()
    if (['completed', 'success', 'succeeded', 'delivered', 'approved'].includes(status)) point.success += 1
    else if (['failed', 'failure', 'denied', 'rejected', 'expired'].includes(status)) point.failed += 1
    else point.pending += 1
    byDay.set(key, point)
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
}

function statusTotals(rows: Array<{ status: string | null | undefined }>) {
  return rows.reduce((totals, row) => {
    const status = String(row.status || '').toLowerCase()
    if (['completed', 'success', 'succeeded', 'delivered', 'approved'].includes(status)) totals.success += 1
    else if (['failed', 'failure', 'denied', 'rejected', 'expired'].includes(status)) totals.failed += 1
    else totals.pending += 1
    return totals
  }, { success: 0, pending: 0, failed: 0 })
}

function StatusDistribution({ title, totals }: { title: string, totals: { success: number, pending: number, failed: number } }) {
  const rows = [
    { label: 'Successful', value: totals.success, color: 'bg-yes' },
    { label: 'Pending', value: totals.pending, color: 'bg-chart-4' },
    { label: 'Failed', value: totals.failed, color: 'bg-no' },
  ]
  const maximum = Math.max(1, ...rows.map(row => row.value))
  return (
    <Card className="rounded-md">
      <CardHeader className="border-b"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-5 p-5">
        {rows.map(row => (
          <div key={row.label} className="grid gap-2">
            <div className="flex items-center justify-between text-sm"><span>{row.label}</span><span className="font-medium tabular-nums">{row.value}</span></div>
            <div className="h-2 overflow-hidden rounded-sm bg-muted"><div className={`h-full ${row.color}`} style={{ width: `${(row.value / maximum) * 100}%` }} /></div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

type AuditFilters = {
  query: string
  outcome: string
  from: string
  to: string
}

async function loadWorkspaceData(auditPage = 1, auditFilters: AuditFilters = { query: '', outcome: 'all', from: '', to: '' }, financeQuery = '') {
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
    recentCampaigns,
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
    db.select().from(notification_campaigns).orderBy(desc(notification_campaigns.created_at)).limit(50),
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
  const kesPerUsdRate = await loadKesPerUsdRate()

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

  const normalizedFinanceQuery = financeQuery.trim().slice(0, 200)
  const financePattern = `%${normalizedFinanceQuery}%`
  const paymentSearch = normalizedFinanceQuery
    ? or(
        ilike(payment_intents.id, financePattern),
        ilike(payment_intents.external_reference, financePattern),
        ilike(payment_intents.ledger_transaction_id, financePattern),
        ilike(payment_intents.user_id, financePattern),
        ilike(users.username, financePattern),
        ilike(users.email, financePattern),
      )
    : undefined

  const [recentAuditEvents, auditEventCountRows, openRiskCases, recentRiskSignals, recentWithdrawals, legacyRecentPayments] = await Promise.all([
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
    db.select({
      id: payment_intents.id,
      userId: payment_intents.user_id,
      username: users.username,
      email: users.email,
      direction: payment_intents.direction,
      status: payment_intents.status,
      grossAmount: payment_intents.gross_amount,
      sourceCurrency: payment_intents.source_currency,
      netAmount: payment_intents.net_amount,
      destinationCurrency: payment_intents.destination_currency,
      externalReference: payment_intents.external_reference,
      ledgerTransactionId: payment_intents.ledger_transaction_id,
      failureMessage: payment_intents.failure_message,
      createdAt: payment_intents.created_at,
    }).from(payment_intents)
      .leftJoin(users, eq(users.id, payment_intents.user_id))
      .where(paymentSearch)
      .orderBy(desc(payment_intents.created_at))
      .limit(200),
  ])

  async function financeApi(path: string) {
    try {
      const { response } = await slimefishBackendUserRequest(`admin/finance/${path}`)
      if (!response?.ok) return null
      return await response.json()
    }
    catch {
      return null
    }
  }
  const encodedFinanceQuery = encodeURIComponent(normalizedFinanceQuery)
  const [financeOverviewPayload, settlementsPayload, treasuryPayload, walletPayload, commissionsPayload, financeSettingsPayload] = await Promise.all([
    financeApi('overview'),
    financeApi(`settlements?search=${encodedFinanceQuery}`),
    financeApi(`accounts/treasury/transactions?search=${encodedFinanceQuery}`),
    financeApi(`accounts/wallet/transactions?search=${encodedFinanceQuery}`),
    financeApi(`accounts/commissions/transactions?search=${encodedFinanceQuery}`),
    financeApi('settings'),
  ])
  const recentPayments = Array.isArray(settlementsPayload?.data)
    ? settlementsPayload.data.map((row: any) => ({
        id: row.id,
        userId: row.user?.id || row.userId,
        username: row.user?.username || null,
        email: row.user?.email || null,
        direction: String(row.direction).toLowerCase(),
        status: String(row.status).toLowerCase(),
        grossAmount: row.requestedAmount,
        sourceCurrency: 'KES',
        netAmount: row.netAmount,
        destinationCurrency: 'KES',
        externalReference: row.providerReference || row.reference,
        ledgerTransactionId: row.ledgerTransactionId,
        failureMessage: row.failureMessage,
        createdAt: row.createdAt,
      }))
    : []

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
    const report = await loadLedgerDashboardReport<{
      recentTrades: Array<Record<string, unknown>>
      riskSignals: Array<Record<string, unknown>>
    }>()
    recentTrades = report.recentTrades.slice(0, 25)
    ledgerRiskRows = report.riskSignals
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
    recentCampaigns,
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
    recentPayments,
    legacyRecentPaymentCount: legacyRecentPayments.length,
    financeOverview: financeOverviewPayload?.data || null,
    financeAccounts: {
      treasury: treasuryPayload?.data?.rows || [],
      wallet: walletPayload?.data?.rows || [],
      commissions: commissionsPayload?.data?.rows || [],
    },
    financeSettings: financeSettingsPayload?.data || [],
    kesPerUsdRate,
    financeQuery: normalizedFinanceQuery,
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

function WorkspaceOverview({ workspace }: { workspace: AdminWorkspaceId }) {
  const sections = getAdminWorkspaceSections(workspace).slice(1).filter(section => section.showInTabs !== false)
  return (
    <div className="overflow-hidden border">
      {sections.map(section => (
        <AppLink key={section.id} href={`/admin/${workspace}/${section.id}` as Route} className="flex items-center justify-between gap-4 border-b p-4 transition-colors last:border-b-0 hover:bg-muted/30 sm:px-6">
          <span className="flex items-start gap-3"><section.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="grid gap-1"><span className="font-medium">{section.label}</span><span className="text-sm text-muted-foreground">{section.description}</span></span></span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </AppLink>
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
        {rows.length === 0 && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">{emptyLabel}</TableCell></TableRow>}
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
        {visibleRows.length === 0 && (
          <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No markets in this queue.</TableCell></TableRow>
        )}
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

function OperationsConsole({ data, section }: { data: Awaited<ReturnType<typeof loadWorkspaceData>>, section: string }) {
  const pendingCreations = data.recentCreations.filter(item => item.status === 'draft' || item.status === 'pending')
  if (section === 'overview') return <WorkspaceOverview workspace="operations" />
  if (section === 'services') return <SystemConsole data={data} section="services" />
  return (
    <div className="grid gap-5">
      <Card className={section === 'markets' ? undefined : 'hidden'}>
        <CardHeader>
          <CardTitle>Ended markets awaiting action</CardTitle>
          <CardDescription>Active events whose end date has passed. These require outcome review or an explicit extension.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EventQueue rows={data.overdueEvents} resolutionOnly />
        </CardContent>
      </Card>
      <Card className={section === 'publishing' ? undefined : 'hidden'}>
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
      <Card className={section === 'jobs' ? undefined : 'hidden'}>
        <CardHeader>
          <CardTitle>Background jobs</CardTitle>
          <CardDescription>Current worker activity, retry counts, and failures in one queue.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <JobsTable rows={data.recentJobs} allowRetry />
        </CardContent>
      </Card>
      <Card className={section === 'accounts' ? undefined : 'hidden'}>
        <CardHeader>
          <CardTitle>Restricted accounts</CardTitle>
          <CardDescription>Blocked, trading-suspended, or suspicious users currently requiring review.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <UserQueue users={data.restrictedUsers} emptyLabel="No restricted accounts." />
        </CardContent>
      </Card>
      <Card className={section === 'trades' ? undefined : 'hidden'}>
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

function SystemConsole({ data, section }: { data: Awaited<ReturnType<typeof loadWorkspaceData>>, section: string }) {
  return (
    <div className="grid gap-6 pt-4">
      <div className={section === 'services' ? 'overflow-hidden border' : 'hidden'}>
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
      <div className={section === 'jobs' ? 'overflow-hidden border' : 'hidden'}>
        <div className="border-b p-4 sm:px-6">
          <CardTitle>Background job control</CardTitle>
          <CardDescription className="mt-1">Live queue state. Requeue resets a failed job for another worker attempt; it does not duplicate completed work.</CardDescription>
        </div>
        <JobsTable rows={data.recentJobs} allowRetry />
      </div>
    </div>
  )
}

function AuditConsole({ data, section }: { data: Awaited<ReturnType<typeof loadWorkspaceData>>, section: string }) {
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
      <div className={section === 'overview' ? 'grid gap-5' : 'hidden'}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardHeader><CardDescription>Condition changes retained</CardDescription><CardTitle>{data.recentAudits.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Creation records retained</CardDescription><CardTitle>{data.recentCreations.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Notification records retained</CardDescription><CardTitle>{data.recentNotifications.length}</CardTitle></CardHeader></Card>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <AdminWorkspaceTrend title="Platform action outcomes" description="Successful, pending, and unsuccessful staff or system actions in the retained audit window." points={buildStatusTrend(data.recentAuditEvents.map(row => ({ date: row.occurred_at, status: row.outcome })))} emptyMessage="No audited platform actions yet." />
          <StatusDistribution title="Outcome distribution" totals={statusTotals(data.recentAuditEvents.map(row => ({ status: row.outcome })))} />
        </div>
      </div>
      <Card className={section === 'actions' ? undefined : 'hidden'}>
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
      <Card className={section === 'conditions' ? undefined : 'hidden'}>
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
      <Card className={section === 'creations' ? undefined : 'hidden'}>
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
              {data.recentCreations.length === 0 && (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No market creation records.</TableCell></TableRow>
              )}
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

function RiskConsole({ data, section }: { data: Awaited<ReturnType<typeof loadWorkspaceData>>, section: string }) {
  return (
    <div className="grid gap-5">
      <div className={section === 'overview' ? 'grid gap-3 sm:grid-cols-3' : 'hidden'}>
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
      <Card className={section === 'cases' ? undefined : 'hidden'}>
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

function FinanceAccountTable({ account, rows }: { account: 'treasury' | 'wallet' | 'commissions', rows: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{account} transactions</CardTitle>
        <CardDescription>{account === 'treasury' ? 'Provider statement entries from the Cloud9 main wallet.' : account === 'wallet' ? 'Customer balances, market reserves, deposits, withdrawals, and trades.' : 'Company commissions and market-liquidity allocations.'}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status / route</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No {account} transactions recorded.</TableCell></TableRow>}
            {rows.map((row: any) => {
              const transaction = row.transaction || row
              return (
                <TableRow key={row.id || row.providerEntryId}>
                  <TableCell>{formatDate(row.providerCreatedAt || row.createdAt || transaction.createdAt)}</TableCell>
                  <TableCell className="max-w-56 truncate font-mono text-xs">{row.providerEntryId || transaction.externalId || transaction.id}</TableCell>
                  <TableCell>{row.type || transaction.type || 'Ledger entry'}</TableCell>
                  <TableCell className="tabular-nums">KES {Math.floor(Number(row.amount || 0)).toLocaleString('en-KE')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.status || `${row.fromAccount?.name || 'Account'} to ${row.toAccount?.name || 'Account'}`}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function FinanceConsole({ data, section }: { data: Awaited<ReturnType<typeof loadWorkspaceData>>, section: string }) {
  const overview = data.financeOverview
  const settings = new Map((data.financeSettings as any[]).map(row => [row.key, Number(row.value)]))
  return (
    <div className="grid gap-5">
      <div className={section === 'overview' ? 'grid gap-5' : 'hidden'}>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ['Treasury', overview?.treasury?.available ?? 0, 'Cloud9 available balance', 'treasury'],
            ['Wallet', overview?.wallet?.total ?? 0, `${overview?.wallet?.reserved ?? 0} KES reserved`, 'wallet'],
            ['Commissions', overview?.commissions?.total ?? 0, 'Company funds and fees', 'commissions'],
          ] as const).map(([label, value, description, target]) => (
            <AppLink key={label} href={`/admin/finance/${target}` as Route}>
              <Card className="h-full transition-colors hover:bg-muted/20"><CardHeader><CardDescription>{label}</CardDescription><CardTitle>KES {Math.floor(Number(value)).toLocaleString('en-KE')}</CardTitle><p className="text-xs text-muted-foreground">{description}</p></CardHeader></Card>
            </AppLink>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardHeader><CardDescription>Accounted balance</CardDescription><CardTitle>KES {Math.floor(Number(overview?.solvency?.accounted || 0)).toLocaleString('en-KE')}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Solvency variance</CardDescription><CardTitle className={Number(overview?.solvency?.variance || 0) < 0 ? 'text-destructive' : ''}>KES {Number(overview?.solvency?.variance || 0).toLocaleString('en-KE')}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Pending settlements</CardDescription><CardTitle>{Number(overview?.pending?.deposits || 0) + Number(overview?.pending?.withdrawals || 0)}</CardTitle></CardHeader></Card>
        </div>
        <Card className="rounded-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Platform exchange rate</CardTitle>
            <CardDescription>Controls every user-facing USD/KES conversion. KES values are always rounded down to whole shillings.</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <form action={updateFinanceRateAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1.5 text-sm font-medium">
                KES per USD
                <Input name="kesPerUsd" type="number" min="1" max="10000" step="0.0001" defaultValue={data.kesPerUsdRate} required />
              </label>
              <div className="text-sm text-muted-foreground sm:pb-2">$1.00 = KSh {Math.floor(data.kesPerUsdRate).toLocaleString('en-KE')}</div>
              <Button type="submit">Save rate</Button>
            </form>
          </CardContent>
        </Card>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <AdminWorkspaceTrend title="Payment outcomes" description="Deposit and withdrawal outcomes in the current transaction window." points={buildStatusTrend(data.recentPayments.map((row: any) => ({ date: row.createdAt, status: row.status })))} emptyMessage="No payment transactions yet." />
          <StatusDistribution title="Transaction distribution" totals={statusTotals(data.recentPayments.map((row: any) => ({ status: row.status })))} />
        </div>
      </div>
      <div className={section === 'treasury' ? undefined : 'hidden'}><FinanceAccountTable account="treasury" rows={data.financeAccounts.treasury} /></div>
      <div className={section === 'wallet' ? undefined : 'hidden'}><FinanceAccountTable account="wallet" rows={data.financeAccounts.wallet} /></div>
      <div className={section === 'commissions' ? undefined : 'hidden'}><FinanceAccountTable account="commissions" rows={data.financeAccounts.commissions} /></div>
      <Card className={section === 'settings' ? undefined : 'hidden'}>
        <CardHeader><CardTitle>Ledger settings</CardTitle><CardDescription>These values are enforced by the backend. Commission rates apply only to realized profit and rise gradually near market close.</CardDescription></CardHeader>
        <CardContent>
          <form action={updateLedgerFinanceSettingsAction} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Minimum trade (KES)<Input name="minimumTradeKes" type="number" min="1" defaultValue={settings.get('trade.minimum_kes') ?? 130} /></label>
            <label className="grid gap-1.5 text-sm font-medium">Initial market liquidity (KES)<Input name="initialLiquidityKes" type="number" min="1" defaultValue={settings.get('market.initial_liquidity_kes') ?? 260} /></label>
            <label className="grid gap-1.5 text-sm font-medium">Base profit commission (bps)<Input name="baseCommissionBps" type="number" min="0" max="10000" defaultValue={settings.get('commission.profit_base_bps') ?? 500} /></label>
            <label className="grid gap-1.5 text-sm font-medium">At-close profit commission (bps)<Input name="closeCommissionBps" type="number" min="0" max="10000" defaultValue={settings.get('commission.profit_close_bps') ?? 800} /></label>
            <label className="grid gap-1.5 text-sm font-medium">Commission ramp (seconds)<Input name="commissionRampSeconds" type="number" min="0" defaultValue={settings.get('commission.ramp_seconds') ?? 43200} /></label>
            <div className="flex items-end"><Button type="submit">Save ledger settings</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card className={section === 'withdrawals' ? undefined : 'hidden'}>
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
      <Card className={section === 'transactions' ? undefined : 'hidden'}>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Search deposits and withdrawals by transaction ID, provider reference, ledger ID, user ID, username, or email.</CardDescription>
          <form method="get" className="flex gap-2 pt-2">
            <Input name="financeQuery" defaultValue={data.financeQuery} placeholder="Search transactions" className="max-w-xl" />
            <Button type="submit" variant="outline">Search</Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentPayments.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">No matching transactions.</TableCell></TableRow>
              )}
              {data.recentPayments.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <div>{row.username || 'Unknown user'}</div>
                    <div className="text-xs text-muted-foreground">{row.email || row.userId}</div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="font-mono text-xs">{row.id}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{row.externalReference || row.ledgerTransactionId || 'No external reference'}</div>
                  </TableCell>
                  <TableCell className="capitalize">{row.direction}</TableCell>
                  <TableCell>{row.grossAmount} {row.sourceCurrency}</TableCell>
                  <TableCell><Badge variant={row.status === 'failed' ? 'destructive' : 'outline'}>{row.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function WorkspaceBody({ workspace, section, data, role, supportQuery }: {
  workspace: AdminWorkspaceId
  section: string
  data: Awaited<ReturnType<typeof loadWorkspaceData>>
  role: ReturnType<typeof getUserPlatformRole>
  supportQuery: string
}) {
  if (workspace === 'operations') {
    return <OperationsConsole data={data} section={section} />
  }
  if (workspace === 'market-review' || workspace === 'resolutions') {
    return <EventQueue rows={data.recentEvents} resolutionOnly={workspace === 'resolutions'} />
  }
  if (workspace === 'risk') {
    return <RiskConsole data={data} section={section} />
  }
  if (workspace === 'finance') {
    return <FinanceConsole data={data} section={section} />
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
          {data.recentCreations.length === 0 && (
            <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No approval requests.</TableCell></TableRow>
          )}
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
    return <AuditConsole data={data} section={section} />
  }
  if (workspace === 'communications') {
    if (section === 'compose') {
      return <AdminNotificationComposer users={data.recentUsers.map(user => ({ id: user.id, username: user.username, email: user.email }))} />
    }
    return (
      <div className="overflow-hidden border bg-background">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Audience</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead>Scheduled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.recentCampaigns.length === 0 && (
            <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No communication campaigns yet. Create one when you are ready to reach users.</TableCell></TableRow>
          )}
          {data.recentCampaigns.map(row => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.title}</div>
                <div className="line-clamp-1 max-w-xl text-xs text-muted-foreground">{row.body}</div>
              </TableCell>
              <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
              <TableCell>{row.audience_count}</TableCell>
              <TableCell>{row.delivered_count} delivered / {row.failed_count} failed</TableCell>
              <TableCell>{formatDate(row.scheduled_for || row.sent_at || row.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
    )
  }
  if (workspace === 'system') {
    return <SystemConsole data={data} section={section} />
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
  params: Promise<{ locale: string, workspace: string, section?: string }>
  searchParams: Promise<{
    auditPage?: string
    auditQuery?: string
    auditOutcome?: string
    auditFrom?: string
    auditTo?: string
    supportQuery?: string
    financeQuery?: string
  }>
}) {
  const { locale, workspace, section: requestedSection } = await params
  setRequestLocale(locale)
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)
  if (!canAccessWorkspaceWithPermissions(currentUser, workspace)) {
    notFound()
  }

  const query = await searchParams
  const supportQuery = query.supportQuery?.slice(0, 200) || ''
  const financeQuery = query.financeQuery?.slice(0, 200) || ''
  const requestedAuditPage = Number.parseInt(query.auditPage || '1', 10)
  const data = await loadWorkspaceData(
    Number.isFinite(requestedAuditPage) ? requestedAuditPage : 1,
    {
      query: query.auditQuery?.slice(0, 200) || '',
      outcome: ['all', 'success', 'failure', 'denied', 'pending'].includes(query.auditOutcome || '') ? query.auditOutcome! : 'all',
      from: query.auditFrom || '',
      to: query.auditTo || '',
    },
    financeQuery,
  )
  const workspaceId = workspace as AdminWorkspaceId
  const copy = WORKSPACE_COPY[workspaceId]
  if (!copy) notFound()
  const sections = getAdminWorkspaceSections(workspaceId)
  const visibleSections = sections.filter(item => item.showInTabs !== false)
  const defaultSection = getDefaultAdminWorkspaceSection(workspaceId)
  const section = requestedSection || defaultSection || 'overview'
  if (requestedSection && !sections.some(item => item.id === requestedSection)) notFound()
  const activeSection = sections.find(item => item.id === section)
  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">{copy.title}</h1><AdminLiveRefresh /></div>
          <p className="text-sm text-muted-foreground">
            {activeSection?.description || copy.description}
          </p>
        </div>
        {workspace === 'communications' && section === 'history' && (
          <Button asChild>
            <AppLink href={'/admin/communications/compose' as Route}><PlusIcon className="size-4" />Create communication</AppLink>
          </Button>
        )}
      </div>
      {visibleSections.length > 1 && (
        <nav className="relative overflow-x-auto border-b" aria-label={`${copy.title} sections`}>
          <div className="flex min-w-max items-center gap-6">
            {visibleSections.map(item => (
              <AppLink
                key={item.id}
                href={item.id === defaultSection ? `/admin/${workspace}` as Route : `/admin/${workspace}/${item.id}` as Route}
                className={`relative pb-3 text-sm font-semibold whitespace-nowrap transition-colors ${section === item.id
                  ? `text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary`
                  : `text-muted-foreground hover:text-foreground`}`}
              >
                <span className="inline-flex items-center gap-2"><item.icon className="size-4" />{item.label}</span>
              </AppLink>
            ))}
          </div>
        </nav>
      )}
      {workspace === 'operations' && section === 'overview' && <MetricCards metrics={data.metrics} />}
      <WorkspaceBody workspace={workspaceId} section={section} data={data} role={role} supportQuery={supportQuery} />
    </section>
  )
}
