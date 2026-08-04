'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { UserRepository } from '@/lib/db/queries/user'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { jobs, notifications, risk_cases, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { canAccessAdminWorkspace, canMoveUserFunds, canReviewRisk, getUserPlatformRole } from '@/lib/staff-role'
import { hasStaffPermission } from '@/lib/staff-permissions'
import { FINANCE_SETTINGS_GROUP, KES_PER_USD_KEY } from '@/lib/finance-display-settings'
import { recordAuditEvent } from '@/lib/audit'
import { clearAutomatedRiskHoldIfEligible, setAutomatedRiskHold } from '@/lib/risk/account-restrictions'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'
import { slimefishBackendUserRequest } from '@/lib/slimefish-backend-user-request'

export async function updateLedgerFinanceSettingsAction(formData: FormData) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !hasStaffPermission(currentUser, 'finance.settings.manage')) {
    throw new Error('You do not have permission to change financial settings.')
  }
  const values = [
    ['trade.minimum_kes', Number(formData.get('minimumTradeKes'))],
    ['market.initial_liquidity_kes', Number(formData.get('initialLiquidityKes'))],
    ['commission.profit_base_bps', Number(formData.get('baseCommissionBps'))],
    ['commission.profit_close_bps', Number(formData.get('closeCommissionBps'))],
    ['commission.ramp_seconds', Number(formData.get('commissionRampSeconds'))],
  ] as const
  if (values.some(([, value]) => !Number.isFinite(value) || value < 0)) throw new Error('Enter valid financial settings.')
  try {
    for (const [key, value] of values) {
      const body = JSON.stringify({ key, value })
      const { response } = await slimefishBackendUserRequest('admin/finance/settings', { method: 'PATCH', body })
      if (!response?.ok) {
        const payload = await response?.json().catch(() => null)
        throw new Error(payload?.error || 'The ledger service did not accept the financial settings.')
      }
    }
  }
  catch (error) {
    await recordAuditEvent({
      eventType: 'finance.ledger_settings.updated', category: 'money', action: 'Failed to update ledger financial settings',
      outcome: 'failure', severity: 'high', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser),
      entityType: 'finance_settings', metadata: { reason: error instanceof Error ? error.message : 'Unknown backend error' },
      afterValues: Object.fromEntries(values),
    })
    throw new Error('Ledger settings could not be saved. Please try again or inspect the audit log.')
  }
  await recordAuditEvent({
    eventType: 'finance.ledger_settings.updated', category: 'money', action: 'Updated ledger financial settings',
    actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser), entityType: 'finance_settings',
    afterValues: Object.fromEntries(values),
  })
  revalidatePath('/[locale]/admin/finance', 'page')
  revalidatePath('/[locale]/admin/finance/settings', 'page')
}

export async function updateFinanceRateAction(formData: FormData) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !hasStaffPermission(currentUser, 'finance.settings.manage')) {
    throw new Error('You do not have permission to change financial settings.')
  }
  const rate = Number(formData.get('kesPerUsd'))
  if (!Number.isFinite(rate) || rate < 1 || rate > 10_000) {
    throw new Error('Enter a valid KES per USD rate.')
  }
  const normalizedRate = rate.toFixed(4).replace(/\.?(?:0+)$/, '')
  const baseUrl = (process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')
  const url = `${baseUrl}/v1/settings`
  const body = JSON.stringify({ settings: [{ group: FINANCE_SETTINGS_GROUP, key: KES_PER_USD_KEY, value: normalizedRate }] })
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET || '',
      'x-tellwise-user-id': currentUser.id,
      'x-tellwise-role': getUserPlatformRole(currentUser),
    } }),
    body,
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('The ledger service did not accept the exchange rate.')
  const result = await SettingsRepository.updateSettings([{ group: FINANCE_SETTINGS_GROUP, key: KES_PER_USD_KEY, value: normalizedRate }])
  if (result.error) throw new Error('The exchange rate could not be saved.')
  await recordAuditEvent({ eventType: 'finance.exchange_rate.updated', category: 'money', action: 'Updated KES display exchange rate', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser), entityType: 'setting', entityId: `${FINANCE_SETTINGS_GROUP}.${KES_PER_USD_KEY}`, afterValues: { kesPerUsd: normalizedRate } })
  revalidatePath('/[locale]/admin/finance', 'page')
}

export async function requeueJobAction(formData: FormData) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)
  if (!canAccessAdminWorkspace(role, 'system')) {
    throw new Error('You do not have permission to manage background jobs.')
  }

  const jobId = String(formData.get('jobId') || '').trim()
  if (!jobId) {
    throw new Error('A job ID is required.')
  }

  await db.update(jobs).set({
    status: 'pending',
    attempts: 0,
    available_at: new Date(),
    reserved_at: null,
    last_error: null,
    updated_at: new Date(),
  }).where(eq(jobs.id, jobId))

  revalidatePath('/[locale]/admin/[workspace]', 'page')
}

export async function claimRiskCaseAction(formData: FormData) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canReviewRisk(currentUser)) throw new Error('You do not have permission to review risk cases.')
  const caseId = String(formData.get('caseId') || '')
  await db.update(risk_cases).set({ assigned_to_user_id: currentUser.id, status: 'under_review', updated_at: new Date() }).where(eq(risk_cases.id, caseId))
  await recordAuditEvent({ eventType: 'risk.case.assigned', category: 'risk', action: 'Claimed risk case', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser), entityType: 'risk_case', entityId: caseId })
  revalidatePath('/[locale]/admin/[workspace]', 'page')
}

export async function completeRiskReviewAction(formData: FormData) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canReviewRisk(currentUser)) throw new Error('You do not have permission to review risk cases.')
  const caseId = String(formData.get('caseId') || '')
  const disposition = String(formData.get('disposition') || '')
  if (!['cleared', 'confirmed'].includes(disposition)) throw new Error('Invalid disposition.')
  const [riskCase] = await db.select().from(risk_cases).where(eq(risk_cases.id, caseId)).limit(1)
  if (!riskCase) throw new Error('Risk case not found.')
  await db.update(risk_cases).set({ status: disposition, disposition, resolved_at: new Date(), updated_at: new Date(), assigned_to_user_id: currentUser.id }).where(eq(risk_cases.id, caseId))
  if (disposition === 'cleared') await clearAutomatedRiskHoldIfEligible(riskCase.user_id, caseId)
  else await setAutomatedRiskHold(riskCase.user_id, true)
  await recordAuditEvent({ eventType: disposition === 'cleared' ? 'risk.case.cleared' : 'risk.case.confirmed', category: 'risk', action: `Risk case ${disposition}`, severity: disposition === 'confirmed' ? 'high' : 'info', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser), entityType: 'risk_case', entityId: caseId, afterValues: { disposition } })
  revalidatePath('/[locale]/admin/[workspace]', 'page')
}

export async function reviewWithdrawalAction(formData: FormData) {
  void formData
  throw new Error('Legacy manual withdrawal review is disabled. Cloud9 settlements are handled by the backend ledger state machine.')
}
