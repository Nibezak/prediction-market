'use server'

import { revalidatePath } from 'next/cache'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { UserRepository } from '@/lib/db/queries/user'

export async function updateDisplaySettingsAction(showHomeFeaturedMobile: boolean) {
  try {
    const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
    if (!user) return { error: 'Unauthenticated.' }

    const { error } = await UserRepository.updateUserDisplaySettings(user, {
      show_home_featured_mobile: showHomeFeaturedMobile,
    })
    if (error) return { error }

    revalidatePath('/settings')
    revalidatePath('/')
    return { error: null }
  }
  catch {
    return { error: DEFAULT_ERROR_MESSAGE }
  }
}
