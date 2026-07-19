'use client'

import type { ReactNode } from 'react'
import type { User } from '@/types'
import { useMemo, useState } from 'react'
import { createConfig, http, WagmiProvider } from 'wagmi'
import { polygonAmoy } from 'wagmi/chains'
import { AuthDialog } from '@/components/AuthDialog'
import { AppKitContext } from '@/hooks/useAppKit'
import { authClient } from '@/lib/auth-client'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

const legacyWagmiConfig = createConfig({
  chains: [polygonAmoy],
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

  async function handleAuthenticated() {
    const result = await authClient.getSession()
    if (result.data?.user) {
      useUser.setState(previous => mergeSessionUserState(previous, result.data!.user as unknown as User))
    }
  }

  return (
    <WagmiProvider config={legacyWagmiConfig}>
      <AppKitContext.Provider value={value}>
        {children}
        <AuthDialog
          key={mode}
          open={open}
          initialMode={mode}
          onOpenChange={setOpen}
          onAuthenticated={handleAuthenticated}
        />
      </AppKitContext.Provider>
    </WagmiProvider>
  )
}
