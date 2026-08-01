'use server'

import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { UserRepository } from '@/lib/db/queries/user'
import { beginTwoFactorEnrollment, disableUserTwoFactor, verifyTwoFactorEnrollment } from '@/lib/two-factor-service'

export async function enableTwoFactorAction() {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    if (!currentUser) {
      return { error: 'Unauthenticated.' }
    }

    return await beginTwoFactorEnrollment(currentUser.id, currentUser.email)
  }
  catch (error) {
    console.error('Failed to enable two-factor:', error)
    return { error: DEFAULT_ERROR_MESSAGE }
  }
}

export async function verifyTwoFactorAction(code: string) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser) return { error: 'Unauthenticated.' }
  if (!/^\d{6}$/.test(code)) return { error: 'Enter a valid 6-digit code.' }
  return await verifyTwoFactorEnrollment(currentUser.id, code)
    ? { success: true }
    : { error: 'Could not verify the code. Please try again.' }
}

export async function disableTwoFactorAction() {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser) return { error: 'Unauthenticated.' }
  await disableUserTwoFactor(currentUser.id)
  return { success: true }
}
