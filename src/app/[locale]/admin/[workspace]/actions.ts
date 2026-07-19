'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { UserRepository } from '@/lib/db/queries/user'
import { jobs, notifications, risk_cases, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { canAccessAdminWorkspace, canMoveUserFunds, canReviewRisk, getUserPlatformRole } from '@/lib/staff-role'
import { recordAuditEvent } from '@/lib/audit'
import { clearAutomatedRiskHoldIfEligible, setAutomatedRiskHold } from '@/lib/risk/account-restrictions'

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
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canMoveUserFunds(currentUser)) throw new Error('Only finance officers and administrators can release money.')
  const requestId = String(formData.get('requestId') || '')
  const decision = String(formData.get('decision') || '')
  if (!['approve', 'reject'].includes(decision)) throw new Error('Invalid decision.')
  const [request] = await db.select().from(withdrawal_requests).where(eq(withdrawal_requests.id, requestId)).limit(1)
  if (!request || !['held', 'approved'].includes(request.status)) throw new Error('This withdrawal is no longer awaiting review.')
  if (decision === 'reject') {
    const response = await fetch(`${process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'}/internal/users/${encodeURIComponent(request.user_id)}/withdrawal-release`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tellwise-secret': process.env.TELLWISE_SECRET || '', 'x-tellwise-internal-operation': 'withdrawal-release' },
      body: JSON.stringify({ amount: Number(request.amount), requestId }),
    })
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not release reserved funds.')
  }
  const status = decision === 'approve' ? 'completed' : 'rejected'
  await db.transaction(async (tx) => {
    await tx.update(withdrawal_requests).set({ status, reviewed_by_user_id: currentUser.id, reviewed_at: new Date(), completed_at: decision === 'approve' ? new Date() : null, review_note: decision === 'approve' ? 'Approved by finance' : 'Rejected; reserved funds returned' }).where(eq(withdrawal_requests.id, requestId))
    await tx.insert(notifications).values({ user_id: request.user_id, category: 'finance', title: decision === 'approve' ? 'Withdrawal approved' : 'Withdrawal was not approved', description: decision === 'approve' ? `Your $${Number(request.amount).toFixed(2)} withdrawal has been approved.` : `Your $${Number(request.amount).toFixed(2)} withdrawal was not approved and the reserved balance was returned.`, metadata: { withdrawalRequestId: requestId }, link_type: 'internal', link_target: 'portfolio', link_url: '/portfolio?tab=history', link_label: 'View activity' })
  })
  await recordAuditEvent({ eventType: decision === 'approve' ? 'money.withdrawal.completed' : 'money.withdrawal.rejected', category: 'money', action: decision === 'approve' ? 'Approved and completed withdrawal' : 'Rejected withdrawal and released reserved funds', severity: decision === 'approve' ? 'info' : 'warning', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser), subjectUserId: request.user_id, entityType: 'withdrawal_request', entityId: requestId, metadata: { amount: Number(request.amount), decision } })
  revalidatePath('/[locale]/admin/[workspace]', 'page')
}
