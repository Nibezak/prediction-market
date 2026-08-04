'use client'

import type { ReactNode } from 'react'
import type { User } from '@/types'
import { useCallback, useMemo, useState } from 'react'
import { createConfig, http, WagmiProvider } from 'wagmi'
import { polygonAmoy } from 'wagmi/chains'
import { AuthDialog } from '@/components/AuthDialog'
import { AppKitContext } from '@/hooks/useAppKit'
import { authClient } from '@/lib/auth-client'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

const legacyWagmiConfig = createConfig({
  chains: [polygonAmoy],
  multiInjectedProviderDiscovery: false,
  transports: { [polygonAmoy.id]: http() },
})

export default function AppKitProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const value = useMemo(() => ({
    open: async (options?: { mode?: 'sign-in' | 'sign-up' }) => {
      setMode(options?.mode || 'sign-in')
      setOpen(true)
    },
    close: async () => setOpen(false),
    isReady: true,
  }), [])

  const handleAuthenticated = useCallback(async () => {
    authClient.$store.notify('$sessionSignal')
    const response = await fetch('/api/auth/get-session', {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })
    const session = await response.json().catch(() => null)
    if (!response.ok || !session?.user) {
      throw new Error('The application session could not be loaded.')
    }

    useUser.setState(previous => mergeSessionUserState(previous, session.user as User))
  }, [])

  return (
    <WagmiProvider config={legacyWagmiConfig} reconnectOnMount={false}>
      <AppKitContext value={value}>
        {children}
        <AuthDialog
          key={mode}
          open={open}
          initialMode={mode}
          onOpenChange={setOpen}
          onAuthenticated={handleAuthenticated}
        />
      </AppKitContext>
    </WagmiProvider>
  )
}
