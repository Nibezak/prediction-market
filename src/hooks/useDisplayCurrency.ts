'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { configureClientMoneyDisplay } from '@/lib/formatters'
import { truncateMoney } from '@/lib/money-precision'
import { useUser } from '@/stores/useUser'

export type DisplayCurrencyCode = 'USD' | 'KES'

const DEFAULT_KES_PER_USDC = 130
let currentCurrency: DisplayCurrencyCode = 'KES'
let loadedForUserId: string | null = null
const currencySubscribers = new Set<(currency: DisplayCurrencyCode) => void>()

export const DISPLAY_CURRENCIES: Record<DisplayCurrencyCode, { code: DisplayCurrencyCode, label: string, icon: string }> = {
  USD: { code: 'USD', label: 'USDC', icon: '$' },
  KES: { code: 'KES', label: 'KES', icon: 'KES' },
}

function setSharedCurrency(next: DisplayCurrencyCode) {
  currentCurrency = next
  currencySubscribers.forEach(subscriber => subscriber(next))
}

export function useDisplayCurrency() {
  const userId = useUser(user => user?.id ?? null)
  const userCurrency = useUser(user => user?.settings?.display?.currency)
  const [currency, setCurrencyState] = useState<DisplayCurrencyCode>(() => userCurrency === 'USD' ? 'USD' : currentCurrency)
  const [kesPerUsdc, setKesPerUsdc] = useState(DEFAULT_KES_PER_USDC)

  useEffect(() => {
    currencySubscribers.add(setCurrencyState)
    return () => {
      currencySubscribers.delete(setCurrencyState)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setSharedCurrency('KES')
      loadedForUserId = null
      return
    }
    if (loadedForUserId === userId) {
      return
    }
    if (userCurrency === 'KES' || userCurrency === 'USD') {
      setSharedCurrency(userCurrency)
    }
    loadedForUserId = userId
    fetch('/api/user/display-currency', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then((payload) => {
        setSharedCurrency(payload?.currency === 'USD' ? 'USD' : 'KES')
      })
      .catch(() => setSharedCurrency('KES'))
  }, [userCurrency, userId])

  configureClientMoneyDisplay(currency, kesPerUsdc)

  useEffect(() => {
    let active = true
    fetch('/api/currency/rates', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then((payload) => {
        const rate = Number(payload?.rates?.KES)
        if (active && Number.isFinite(rate) && rate > 0) {
          setKesPerUsdc(rate)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const setCurrency = useCallback(async (next: DisplayCurrencyCode) => {
    const previous = currentCurrency
    setSharedCurrency(next)
    if (!userId) {
      return true
    }
    try {
      const response = await fetch('/api/user/display-currency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: next }),
      })
      if (!response.ok) {
        setSharedCurrency(previous)
        return false
      }
      useUser.setState((user) => {
        if (!user || user.id !== userId) {
          return user
        }
        return {
          ...user,
          settings: {
            ...(user.settings ?? {}),
            display: {
              ...(user.settings?.display ?? {}),
              currency: next,
            },
          },
        }
      })
      return true
    }
    catch {
      setSharedCurrency(previous)
      return false
    }
  }, [userId])

  const toggleCurrency = useCallback(() => {
    return setCurrency(currency === 'USD' ? 'KES' : 'USD')
  }, [currency, setCurrency])

  const formatMoney = useCallback((value: number | null | undefined, options: Intl.NumberFormatOptions = {}) => {
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0
    if (currency === 'KES') {
      const kesValue = truncateMoney(safeValue, 'KES').toNumber()
      const formatted = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        ...options,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(kesValue)
      return formatted.replace('KES', 'Ksh')
    }
    const usdValue = truncateMoney(safeValue / kesPerUsdc, 'USD').toNumber()
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      ...options,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usdValue)
  }, [currency, kesPerUsdc])

  return useMemo(() => ({
    currency,
    currencyMeta: DISPLAY_CURRENCIES[currency],
    kesPerUsdc,
    setCurrency,
    toggleCurrency,
    formatMoney,
  }), [currency, formatMoney, kesPerUsdc, setCurrency, toggleCurrency])
}
