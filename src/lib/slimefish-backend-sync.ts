import { getSlimefishBackendServiceKey, signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const SERVICE_SECRET = getSlimefishBackendServiceKey()

export async function syncUserToSlimefishBackend(user: { id: string, email: string, username?: string | null }) {
  const url = `${AMM_BASE_URL}/users/sync`
  const body = JSON.stringify({
    id: user.id,
    email: user.email,
    username: user.username || user.email.split('@')[0],
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({
      url,
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': SERVICE_SECRET,
      },
    }),
    body,
  })

  if (!response.ok) {
    throw new Error(`Slimefish ledger user sync failed (${response.status})`)
  }
}
