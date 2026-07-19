const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const TELLWISE_SECRET = process.env.TELLWISE_SECRET || 'tellwise_super_secret_bypass_key_123'

export async function syncUserToPlayMoney(user: { id: string, email: string, username?: string | null }) {
  const response = await fetch(`${AMM_BASE_URL}/users/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': TELLWISE_SECRET,
    },
    body: JSON.stringify({
      id: user.id,
      email: user.email,
      username: user.username || user.email.split('@')[0],
    }),
  })

  if (!response.ok) {
    throw new Error(`Play Money user sync failed (${response.status})`)
  }
}

export async function syncMarketToPlayMoney(marketId: string, title: string, outcomes: any[]) {
  try {
    // 1. First, we need to make sure the Tellwise Admin user exists in Play Money.
    // For this automated hook, we will just sync it under a "system" user.
    console.log('🔄 Syncing market to Play Money AMM:', marketId, title)

    await fetch(`${AMM_BASE_URL}/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': TELLWISE_SECRET,
        'x-tellwise-user-id': 'system-admin', // We bypass auth and use a dummy system user
      },
      body: JSON.stringify({
        id: 'system-admin',
        username: 'system-admin',
      }),
    })

    const response = await fetch(`${AMM_BASE_URL}/markets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': TELLWISE_SECRET,
        'x-tellwise-user-id': 'system-admin', // We bypass auth and use a dummy system user
      },
      body: JSON.stringify({
        id: marketId, // We force the play-money market ID to match Tellwise's condition_id!
        question: title,
        description: 'Auto-synced from Tellwise Admin UI',
        options: outcomes.map((o, index) => ({
          id: o.token_id || o.id || `${marketId}${index}`,
          name: o.outcome || o.title || o.name || 'Option',
          color: o.color || (index === 0 ? '#3B82F6' : '#EC4899'),
        })),
        tags: [],
        type: 'binary',
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('❌ Failed to sync market to Play Money:', errText)
    }
    else {
      console.log('✅ Successfully mirrored market to Play Money AMM:', marketId)
    }
  }
  catch (error) {
    console.error('❌ Network error syncing market to Play Money:', error)
  }
}
