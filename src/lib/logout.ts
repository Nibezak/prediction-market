import { signOut as signOutFirebase } from 'firebase/auth'
import { authClient } from '@/lib/auth-client'
import { firebaseAuth } from '@/lib/firebase/client'
import { localizePathname } from '@/lib/locale-path'
import { clearBrowserStorage, clearNonHttpOnlyCookies } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

interface SignOutAndRedirectOptions {
  currentPathname: string
  redirectPath?: string
}

export async function signOutAndRedirect({
  currentPathname,
  redirectPath = '/',
}: SignOutAndRedirectOptions) {
  let signOutSucceeded = false

  try {
    // Clear Firebase first so the auth-state reconciler cannot recreate the
    // application session while logout is still in progress.
    await signOutFirebase(firebaseAuth)
    await authClient.signOut()
    signOutSucceeded = true
  }
  catch {
    //
  }

  let clearSucceeded = false

  try {
    const response = await fetch('/auth/clear', {
      method: 'POST',
      credentials: 'include',
    })
    clearSucceeded = response.ok
  }
  catch {
    //
  }

  let localSignOutSucceeded = false
  try {
    const response = await fetch('/api/tellwise-session', {
      method: 'DELETE',
      credentials: 'include',
    })
    localSignOutSucceeded = response.ok
  }
  catch {
    //
  }

  if (!signOutSucceeded && !clearSucceeded && !localSignOutSucceeded) {
    throw new Error('Failed to clear auth state during logout.')
  }

  useUser.setState(null)
  clearBrowserStorage()
  clearNonHttpOnlyCookies()

  window.location.href = localizePathname(redirectPath, currentPathname)
}
