import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const TELLWISE_SECRET = process.env.TELLWISE_SECRET || 'tellwise_super_secret_bypass_key_123'

export async function syncUserToSlimefishBackend(user: { id: string, email: string, username?: string | null }) {
  const url = `${AMM_BASE_URL}/users/sync`
  const body = JSON.stringify({
    id: user.id,
    email: user.email,
    username: user.username || user.email.split('@')[0],
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': TELLWISE_SECRET,
    } }),
    body,
  })

  if (!response.ok) {
    throw new Error(`Slimefish ledger user sync failed (${response.status})`)
  }
}

export async function syncMarketToSlimefishBackend(marketId: string, title: string, outcomes: any[]) {
  try {
    // 1. First, we need to make sure the Tellwise Admin user exists in Slimefish ledger.
    // For this automated hook, we will just sync it under a "system" user.
    console.log('🔄 Syncing market to Slimefish ledger AMM:', marketId, title)

    const syncUrl = `${AMM_BASE_URL}/users/sync`
    const syncBody = JSON.stringify({
      id: 'system-admin',
      username: 'system-admin',
    })
    await fetch(syncUrl, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': TELLWISE_SECRET,
        'x-tellwise-user-id': 'system-admin', // We bypass auth and use a dummy system user
      } }),
      body: syncBody,
    })

    const marketUrl = `${AMM_BASE_URL}/markets`
    const marketBody = JSON.stringify({
      id: marketId, // We force the slimefish-backend market ID to match Tellwise's condition_id!
      question: title,
      description: 'Auto-synced from Tellwise Admin UI',
      options: outcomes.map((o, index) => ({
        id: o.token_id || o.id || `${marketId}${index}`,
        name: o.outcome || o.title || o.name || 'Option',
        color: o.color || (index === 0 ? '#3B82F6' : '#EC4899'),
      })),
      tags: [],
      type: 'binary',
    })
    const response = await fetch(marketUrl, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: marketUrl, method: 'POST', body: marketBody, headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': TELLWISE_SECRET,
        'x-tellwise-user-id': 'system-admin', // We bypass auth and use a dummy system user
      } }),
      body: marketBody,
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('❌ Failed to sync market to Slimefish ledger:', errText)
    }
    else {
      console.log('✅ Successfully mirrored market to Slimefish ledger AMM:', marketId)
    }
  }
  catch (error) {
    console.error('❌ Network error syncing market to Slimefish ledger:', error)
  }
}
