'use server'

import { revalidatePath } from 'next/cache'
import { UserRepository } from '@/lib/db/queries/user'
import { canManageUsers } from '@/lib/staff-role'
import { db } from '@/lib/drizzle'
import { markets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const SLIMEFISH_BACKEND_API_URL = process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'

export async function refundAndCancelMarket(marketId: string, reason?: string) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canManageUsers(currentUser)) {
    return { error: 'Unauthorized' }
  }

  const trimmedReason = reason?.trim() || 'Market canceled and refunded to user ledgers by administrator.'

  try {
    const url = `${SLIMEFISH_BACKEND_API_URL}/v1/markets/${marketId}/cancel`
    const body = JSON.stringify({ reason: trimmedReason })
    const response = await fetch(url, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': process.env.TELLWISE_SECRET || '',
        'x-tellwise-user-id': currentUser.id,
        'x-tellwise-is-admin': 'true',
      } }),
      body,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      console.warn('SlimefishBackend cancel call non-ok:', payload)
    }

    await db.update(markets).set({
      is_active: false,
      is_resolved: false,
    }).where(eq(markets.condition_id, marketId))

    revalidatePath('/[locale]/(platform)/event/[slug]', 'page')
    revalidatePath('/[locale]/admin/events', 'page')
    return { success: true }
  } catch (error) {
    console.error('Error refunding market:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
