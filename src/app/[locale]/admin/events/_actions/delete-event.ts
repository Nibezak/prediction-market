'use server'

import { EventRepository } from '@/lib/db/queries/event'
import { UserRepository } from '@/lib/db/queries/user'
import { isStaffUser } from '@/lib/staff-role'

export async function deleteAdminEventAction(eventId: string) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !isStaffUser(currentUser)) {
    return { success: false, error: 'Unauthenticated.' }
  }

  const { data, error } = await EventRepository.deleteAdminEvent(eventId)
  if (error || !data) {
    return { success: false, error: error || 'Failed to delete event' }
  }

  return { success: true, error: null }
}
