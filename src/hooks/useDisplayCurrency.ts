'use client'

import { useEffect, useMemo, useState } from 'react'

export type DisplayCurrencyCode = 'USD' | 'KES'

const STORAGE_KEY = 'slimefish.displayCurrency'
const DEFAULT_KES_PER_USDC = 129.5

export const DISPLAY_CURRENCIES: Record<DisplayCurrencyCode, { code: DisplayCurrencyCode, label: string, icon: string }> = {
  USD: { code: 'USD', label: 'USDC', icon: '$' },
  KES: { code: 'KES', label: 'KES', icon: 'KES' },
}

function readStoredCurrency(): DisplayCurrencyCode {
  if (typeof window === 'undefined') {
    return 'USD'
  }
  return window.localStorage.getItem(STORAGE_KEY) === 'KES' ? 'KES' : 'USD'
}

export function useDisplayCurrency() {
  const [currency, setCurrencyState] = useState<DisplayCurrencyCode>('USD')
  const [kesPerUsdc, setKesPerUsdc] = useState(DEFAULT_KES_PER_USDC)

  useEffect(() => {
    setCurrencyState(readStoredCurrency())

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setCurrencyState(readStoredCurrency())
      }
    }

    function handleCurrencyChange() {
      setCurrencyState(readStoredCurrency())
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('slimefish:display-currency-change', handleCurrencyChange)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('slimefish:display-currency-change', handleCurrencyChange)
    }
  }, [])

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

  function setCurrency(next: DisplayCurrencyCode) {
    window.localStorage.setItem(STORAGE_KEY, next)
    setCurrencyState(next)
    window.dispatchEvent(new Event('slimefish:display-currency-change'))
  }

  function toggleCurrency() {
    setCurrency(currency === 'USD' ? 'KES' : 'USD')
  }

  function formatMoney(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0
    if (currency === 'KES') {
      return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options,
      }).format(safeValue * kesPerUsdc)
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(safeValue)
  }

  return useMemo(() => ({
    currency,
    currencyMeta: DISPLAY_CURRENCIES[currency],
    kesPerUsdc,
    setCurrency,
    toggleCurrency,
    formatMoney,
  }), [currency, kesPerUsdc])
}
