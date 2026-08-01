'use client'

import type { User } from '@/types'
import { useEffect } from 'react'
import { authClient } from '@/lib/auth-client'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

const { useSession } = authClient

function useSyncViewerUserState() {
  const { data: session, isPending } = useSession()

  useEffect(function syncViewerUserStateFromSession() {
    if (isPending) {
      return
    }

    if (typeof session === 'undefined') {
      return
    }

    if (!session?.user) {
      useUser.setState(null)
      return
    }

    const controller = new AbortController()
    void fetch('/api/viewer', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load viewer')
        return response.json() as Promise<{ user: User | null }>
      })
      .then(({ user }) => {
        if (!user) {
          useUser.setState(null)
          return
        }
        useUser.setState(previous => mergeSessionUserState(previous, user))
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        useUser.setState(previous => mergeSessionUserState(previous, session.user as unknown as User))
      })

    return () => controller.abort()
  }, [isPending, session, session?.user])
}

export default function PlatformViewerState() {
  useSyncViewerUserState()

  return null
}
