'use client'

import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { buildTwoFactorRedirectPath } from '@/lib/locale-path'

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = buildTwoFactorRedirectPath(window.location.pathname, window.location.search)
      },
    }),
  ],
})
