import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { risk_cases, users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

const ACTIVE_RISK_STATUSES = ['open', 'under_review', 'held', 'confirmed']

function readFlag(settings: Record<string, unknown> | null | undefined, key: string) {
  return settings?.[key] === true || settings?.[key] === 'true'
}

export async function getAccountRestriction(userId: string) {
  const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
  const settings = user?.settings
  const restricted = readFlag(settings, 'is_blocked') || readFlag(settings, 'risk_hold')
    || readFlag(settings, 'tradingBlocked') || readFlag(settings, 'suspicious')
  return {
    restricted,
    reason: restricted ? 'This account is under review. Deposits, withdrawals, and trading are temporarily unavailable.' : null,
  }
}

export async function setAutomatedRiskHold(userId: string, enabled: boolean) {
  await db.update(users).set({
    settings: sql`
      CASE WHEN jsonb_typeof(COALESCE(${users.settings}, '{}'::jsonb)) = 'object'
        THEN COALESCE(${users.settings}, '{}'::jsonb) ELSE '{}'::jsonb END
      || ${JSON.stringify({ risk_hold: enabled, suspicious: enabled, tradingBlocked: enabled })}::jsonb
    `,
  }).where(eq(users.id, userId))
}

export async function clearAutomatedRiskHoldIfEligible(userId: string, excludedCaseId: string) {
  const [remaining] = await db.select({ id: risk_cases.id }).from(risk_cases).where(and(
    eq(risk_cases.user_id, userId), ne(risk_cases.id, excludedCaseId),
    inArray(risk_cases.status, ACTIVE_RISK_STATUSES),
  )).limit(1)
  if (!remaining) await setAutomatedRiskHold(userId, false)
}
