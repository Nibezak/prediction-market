import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { audit_events, notifications, risk_cases, risk_signals, sessions, users, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { recordAuditEvent } from '@/lib/audit'

type Direction = 'above' | 'below'
type MetricKey = keyof WithdrawalMetrics

type Rule = {
  id: string
  family: string
  title: string
  description: string
  metric: MetricKey
  direction: Direction
  threshold: number
  score: number
}

type WithdrawalMetrics = {
  accountAgeHours: number
  amount: number
  balanceRatio: number
  priorWithdrawalCount: number
  withdrawalCount24h: number
  withdrawalSum24h: number
  averagePriorWithdrawal: number
  maxPriorWithdrawal: number
  amountToAverageRatio: number
  amountToMaxRatio: number
  successfulDepositCount: number
  successfulTradeCount: number
  distinctIpCount7d: number
  distinctDeviceCount7d: number
}

const FAMILIES: Array<Omit<Rule, 'id' | 'threshold' | 'score'> & { thresholds: number[], scores: number[] }> = [
  { family: 'account_age', title: 'New account withdrawal', description: 'Withdrawal attempted shortly after account creation.', metric: 'accountAgeHours', direction: 'below', thresholds: [720, 336, 168, 72, 48, 24, 12, 6, 2, 1], scores: [2, 3, 4, 6, 8, 10, 12, 15, 18, 22] },
  { family: 'amount', title: 'Large withdrawal amount', description: 'Requested amount exceeds an absolute review threshold.', metric: 'amount', direction: 'above', thresholds: [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000], scores: [1, 2, 3, 5, 7, 9, 12, 15, 18, 22] },
  { family: 'balance_ratio', title: 'High balance withdrawal ratio', description: 'Request consumes an unusually large share of available balance.', metric: 'balanceRatio', direction: 'above', thresholds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.98], scores: [1, 2, 3, 4, 5, 6, 8, 10, 13, 17] },
  { family: 'no_history', title: 'Limited withdrawal history', description: 'User has little or no completed withdrawal history.', metric: 'priorWithdrawalCount', direction: 'below', thresholds: [11, 10, 9, 8, 7, 6, 5, 4, 2, 1], scores: [1, 1, 1, 2, 2, 3, 3, 4, 7, 12] },
  { family: 'velocity_count', title: 'Withdrawal velocity', description: 'Several withdrawal attempts occurred in the last 24 hours.', metric: 'withdrawalCount24h', direction: 'above', thresholds: [0, 1, 2, 3, 4, 5, 7, 10, 15, 20], scores: [1, 2, 3, 4, 5, 7, 9, 12, 16, 20] },
  { family: 'velocity_sum', title: 'Withdrawal value velocity', description: 'Total requested value in 24 hours is elevated.', metric: 'withdrawalSum24h', direction: 'above', thresholds: [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000], scores: [1, 2, 3, 5, 7, 9, 12, 15, 18, 22] },
  { family: 'average_deviation', title: 'Historical average deviation', description: 'Request is much larger than the user\'s normal withdrawal.', metric: 'amountToAverageRatio', direction: 'above', thresholds: [1.1, 1.25, 1.5, 2, 3, 4, 5, 7.5, 10, 20], scores: [1, 2, 3, 4, 5, 7, 9, 12, 16, 20] },
  { family: 'maximum_deviation', title: 'Historical maximum deviation', description: 'Request exceeds the user\'s previous maximum withdrawal.', metric: 'amountToMaxRatio', direction: 'above', thresholds: [1.01, 1.1, 1.25, 1.5, 2, 3, 4, 5, 7.5, 10], scores: [1, 2, 3, 4, 5, 7, 9, 12, 16, 20] },
  { family: 'deposit_history', title: 'Limited deposit history', description: 'Withdrawal lacks supporting successful deposit history.', metric: 'successfulDepositCount', direction: 'below', thresholds: [20, 15, 12, 10, 8, 6, 5, 3, 2, 1], scores: [1, 1, 1, 2, 2, 3, 4, 6, 8, 14] },
  { family: 'trade_history', title: 'Limited trading history', description: 'Withdrawal follows little or no completed trading activity.', metric: 'successfulTradeCount', direction: 'below', thresholds: [50, 40, 30, 20, 15, 10, 7, 5, 2, 1], scores: [1, 1, 1, 2, 2, 3, 4, 6, 8, 12] },
  { family: 'ip_churn', title: 'IP address churn', description: 'Account used many network addresses in the last seven days.', metric: 'distinctIpCount7d', direction: 'above', thresholds: [1, 2, 3, 4, 5, 6, 8, 10, 15, 20], scores: [1, 2, 3, 4, 5, 7, 9, 12, 16, 20] },
  { family: 'device_churn', title: 'Device churn', description: 'Account used many browser/device signatures in the last seven days.', metric: 'distinctDeviceCount7d', direction: 'above', thresholds: [1, 2, 3, 4, 5, 6, 8, 10, 15, 20], scores: [1, 2, 3, 4, 5, 7, 9, 12, 16, 20] },
]

export const WITHDRAWAL_RISK_RULES: Rule[] = FAMILIES.flatMap(family => family.thresholds.map((threshold, index) => ({
  id: `WDR_${family.family.toUpperCase()}_${String(index + 1).padStart(2, '0')}`,
  family: family.family,
  title: family.title,
  description: family.description,
  metric: family.metric,
  direction: family.direction,
  threshold,
  score: family.scores[index] || family.scores.at(-1) || 1,
})))

function isTriggered(rule: Rule, metrics: WithdrawalMetrics) {
  const value = metrics[rule.metric]
  return rule.direction === 'above' ? value > rule.threshold : value < rule.threshold
}

export async function evaluateWithdrawalRisk(userId: string, amount: number, currentBalance: number) {
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [userRows, prior, recent, depositRows, tradeRows, recentSessions] = await Promise.all([
    db.select({ createdAt: users.created_at }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ amount: withdrawal_requests.amount }).from(withdrawal_requests).where(and(eq(withdrawal_requests.user_id, userId), eq(withdrawal_requests.status, 'completed'))).orderBy(desc(withdrawal_requests.requested_at)).limit(100),
    db.select({ amount: withdrawal_requests.amount }).from(withdrawal_requests).where(and(eq(withdrawal_requests.user_id, userId), gte(withdrawal_requests.requested_at, dayAgo))),
    db.select({ value: count() }).from(audit_events).where(and(eq(audit_events.actor_user_id, userId), inArray(audit_events.event_type, ['money.deposit.completed', 'money.deposit.reversed']))),
    db.select({ value: count() }).from(audit_events).where(and(eq(audit_events.actor_user_id, userId), inArray(audit_events.event_type, ['trade.buy.completed', 'trade.sell.completed']))),
    db.select({ ip: sessions.ip_address, device: sessions.user_agent }).from(sessions).where(and(eq(sessions.user_id, userId), gte(sessions.created_at, weekAgo))),
  ])
  const priorAmounts = prior.map(item => Number(item.amount)).filter(Number.isFinite)
  const createdAt = userRows[0]?.createdAt || now
  const averagePriorWithdrawal = priorAmounts.length ? priorAmounts.reduce((sum, item) => sum + item, 0) / priorAmounts.length : 0
  const maxPriorWithdrawal = priorAmounts.length ? Math.max(...priorAmounts) : 0
  const metrics: WithdrawalMetrics = {
    accountAgeHours: Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000),
    amount,
    balanceRatio: currentBalance > 0 ? amount / currentBalance : 1,
    priorWithdrawalCount: priorAmounts.length,
    withdrawalCount24h: recent.length,
    withdrawalSum24h: recent.reduce((sum, item) => sum + Number(item.amount || 0), 0) + amount,
    averagePriorWithdrawal,
    maxPriorWithdrawal,
    amountToAverageRatio: averagePriorWithdrawal > 0 ? amount / averagePriorWithdrawal : 0,
    amountToMaxRatio: maxPriorWithdrawal > 0 ? amount / maxPriorWithdrawal : 0,
    successfulDepositCount: Number(depositRows[0]?.value || 0),
    successfulTradeCount: Number(tradeRows[0]?.value || 0),
    distinctIpCount7d: new Set(recentSessions.map(item => item.ip).filter(Boolean)).size,
    distinctDeviceCount7d: new Set(recentSessions.map(item => item.device).filter(Boolean)).size,
  }

  // One strongest signal per family prevents threshold stacking from inflating a score.
  const triggered = FAMILIES.map(family => WITHDRAWAL_RISK_RULES
    .filter(rule => rule.family === family.family && isTriggered(rule, metrics))
    .sort((a, b) => b.score - a.score)[0]).filter((rule): rule is Rule => Boolean(rule))
  const score = Math.min(100, triggered.reduce((sum, rule) => sum + rule.score, 0))
  const severity = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'
  const decision = score >= 50 ? 'hold' : score >= 25 ? 'review' : 'allow'
  return { score, severity, decision, metrics, triggered }
}

export async function createWithdrawalReview(input: {
  userId: string
  amount: number
  currentBalance: number
  destination?: string
  idempotencyKey: string
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.round(input.amount * 100) !== input.amount * 100) throw new Error('Enter a positive amount with no more than two decimals.')
  if (input.amount > input.currentBalance) throw new Error('Insufficient available balance.')
  const evaluation = await evaluateWithdrawalRisk(input.userId, input.amount, input.currentBalance)
  const held = evaluation.decision !== 'allow'
  const result = await db.transaction(async (tx) => {
    const [caseRow] = held ? await tx.insert(risk_cases).values({
      user_id: input.userId, source: 'withdrawal', status: 'open', severity: evaluation.severity,
      score: evaluation.score, title: 'Withdrawal requires review',
      summary: `${evaluation.triggered.length} risk signals require staff review before funds can leave the account.`,
      held_amount: input.amount.toFixed(2),
    }).returning() : []
    if (caseRow) await tx.insert(risk_signals).values(evaluation.triggered.map(rule => ({
      case_id: caseRow.id, rule_id: rule.id, category: rule.family, title: rule.title,
      description: rule.description, score: rule.score,
      observed_value: { metric: rule.metric, value: evaluation.metrics[rule.metric] },
      threshold: { direction: rule.direction, value: rule.threshold },
      evidence: { evaluatedAt: new Date().toISOString() },
    })))
    const [request] = await tx.insert(withdrawal_requests).values({
      user_id: input.userId, amount: input.amount.toFixed(2), destination: input.destination,
      status: held ? 'held' : 'approved', risk_case_id: caseRow?.id, idempotency_key: input.idempotencyKey,
      held_at: held ? new Date() : null,
    }).returning()
    if (held) await tx.insert(notifications).values({
      user_id: input.userId, category: 'security', title: 'Withdrawal is under review',
      description: 'Our moderators are reviewing this withdrawal. Your funds remain protected while the review is completed.',
      extra_info: `$${input.amount.toFixed(2)} withdrawal`, metadata: { withdrawalRequestId: request.id, riskCaseId: caseRow?.id },
      link_type: 'internal', link_target: 'portfolio', link_url: '/portfolio?tab=transactions', link_label: 'View transaction',
    })
    if (held) await tx.update(users).set({
      settings: sql`
        CASE WHEN jsonb_typeof(COALESCE(${users.settings}, '{}'::jsonb)) = 'object'
          THEN COALESCE(${users.settings}, '{}'::jsonb) ELSE '{}'::jsonb END
        || ${JSON.stringify({ risk_hold: true, suspicious: true, tradingBlocked: true })}::jsonb
      `,
    }).where(eq(users.id, input.userId))
    return { request, caseRow }
  })
  await recordAuditEvent({
    eventType: held ? 'money.withdrawal.held' : 'money.withdrawal.approved', category: 'money',
    action: held ? 'Withdrawal held for staff review' : 'Withdrawal passed automated risk review',
    outcome: held ? 'pending' : 'success', severity: held ? 'high' : 'info', actorUserId: input.userId,
    subjectUserId: input.userId, entityType: 'withdrawal_request', entityId: result.request.id,
    idempotencyKey: input.idempotencyKey, riskScore: evaluation.score,
    metadata: { amount: input.amount, currency: 'USD', decision: evaluation.decision, signals: evaluation.triggered.map(rule => rule.id) },
  })
  return { ...result, evaluation }
}
