import 'server-only'
import { getSlimefishBackendBaseUrl, slimefishBackendFetch } from '@/lib/slimefish-backend-auth'

async function reportingRequest<T>(path: string, init: RequestInit & { body?: string | null } = {}) {
  const response = await slimefishBackendFetch(`${getSlimefishBackendBaseUrl()}/internal/reporting/${path}`, {
    ...init,
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null) as { data?: T, error?: string } | null
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error || `Ledger reporting request failed (${response.status}).`)
  }
  return payload.data
}

export function loadLedgerDashboardReport<T>() {
  return reportingRequest<T>('dashboard')
}

export function loadNotificationLedgerReport<T>() {
  return reportingRequest<T>('notification-audience')
}

export function loadMarketVolumeReport<T>(marketIds: string[]) {
  return reportingRequest<T>('market-volumes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ marketIds }),
  })
}
