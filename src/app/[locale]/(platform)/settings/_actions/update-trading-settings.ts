'use server'

import { revalidatePath } from 'next/cache'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { UserRepository } from '@/lib/db/queries/user'

export async function updateTradingSettingsAction(formData: FormData) {
  try {
    const preferences: {
      show_slippage_warning?: boolean
    } = {}

    if (formData.has('show_slippage_warning')) {
      const rawShowSlippageWarning = (formData.get('show_slippage_warning') || '').toString()
      preferences.show_slippage_warning = rawShowSlippageWarning === 'true'
    }

    const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
    if (!user) {
      return { error: 'Unauthenticated.' }
    }

    const { error } = await UserRepository.updateUserTradingSettings(user, preferences)

    if (error) {
      return { error }
    }

    revalidatePath('/settings')

    return { error: null }
  }
  catch {
    return { error: DEFAULT_ERROR_MESSAGE }
  }
}
