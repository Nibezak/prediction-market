'use server'

import { eq, inArray } from 'drizzle-orm'
import { UserRepository } from '@/lib/db/queries/user'
import { markets, outcomes } from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'
import { getUserPlatformRole } from '@/lib/staff-role'

export async function getEventOutcomesAction(eventId: string) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    const role = getUserPlatformRole(currentUser)
    if (!currentUser || !['SUPER_ADMIN', 'ADMIN', 'RESOLVER', 'MODERATOR'].includes(role)) {
      return { success: false, error: 'Resolution access required.' }
    }

    const marketRows = await db.select().from(markets).where(eq(markets.event_id, eventId))
    if (marketRows.length === 0) {
      return { success: false, error: 'No markets found' }
    }

    const outcomeRows = await db.select()
      .from(outcomes)
      .where(inArray(outcomes.condition_id, marketRows.map(market => market.condition_id)))

    return {
      success: true,
      data: outcomeRows.map(o => ({
        tokenId: o.token_id,
        outcomeText: o.outcome_text,
      })),
    }
  }
  catch (error: any) {
    return { success: false, error: error.message }
  }
}
