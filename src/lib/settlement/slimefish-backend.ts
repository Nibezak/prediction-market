/* eslint-disable style/max-statements-per-line */
import type { SettlementAdapter, SettlementRequest, SettlementResult } from './types'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

function serviceKey() {
  return process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim() || process.env.TELLWISE_SECRET?.trim() || ''
}

export class SlimefishBackendSettlementAdapter implements SettlementAdapter {
  readonly name = 'slimefish_backend'

  async settle(request: SettlementRequest): Promise<SettlementResult> {
    if (request.direction === 'withdrawal') {
      return { status: 'succeeded', externalReference: `slimefish-backend-withdrawal:${request.paymentIntentId}` }
    }
    if (request.direction !== 'deposit' && request.direction !== 'refund') { return { status: 'pending', externalReference: request.paymentIntentId } }
    const key = serviceKey()
    if (!key) { return { status: 'failed', failureCode: 'SERVICE_AUTH_MISSING', failureMessage: 'Settlement service authentication is not configured.' } }
    const commonHeaders = {
      'content-type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET?.trim() || key,
      'x-tellwise-user-id': request.userId,
    }
    const syncUrl = `${BASE_URL}/users/sync`
    const syncBody = JSON.stringify({ id: request.userId, username: `user_${request.userId.slice(0, 12)}`, email: `${request.userId}@slimefish.local`, role: 'USER' })
    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: { ...commonHeaders, 'idempotency-key': `settlement-user-sync:${request.userId}` } }),
      body: syncBody,
    })
    if (!syncResponse.ok) { return { status: 'failed', failureCode: 'USER_SYNC_FAILED', failureMessage: 'Could not prepare the settlement account.' } }
    const creditUrl = `${BASE_URL}/internal/users/${encodeURIComponent(request.userId)}/settlement-credit`
    const creditBody = JSON.stringify({ amount: request.amount, paymentIntentId: request.paymentIntentId })
    const response = await fetch(creditUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: signSlimefishBackendRequest({ url: creditUrl, method: 'POST', body: creditBody, headers: {
        ...commonHeaders,
        'x-tellwise-internal-operation': 'settlement-credit',
        'idempotency-key': `settlement-credit:${request.paymentIntentId}`,
      } }),
      body: creditBody,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) { return { status: 'failed', failureCode: `SLIMEFISH_BACKEND_${response.status}`, failureMessage: payload?.error || 'Settlement service rejected the credit.' } }
    return { status: 'succeeded', externalReference: request.paymentIntentId, ledgerTransactionId: payload?.data?.transactionId }
  }
}
