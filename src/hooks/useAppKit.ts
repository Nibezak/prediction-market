'use client'

import { createContext, use } from 'react'

export interface AuthOpenOptions {
  view?: string
  mode?: 'sign-in' | 'sign-up'
}

export interface AppKitValue {
  open: (options?: AuthOpenOptions) => Promise<void>
  close: () => Promise<void>
  isReady: boolean
}

export const defaultAppKitValue: AppKitValue = {
  open: async () => {},
  close: async () => {},
  isReady: false,
}

export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

export function useAppKit() {
  return use(AppKitContext)
}
