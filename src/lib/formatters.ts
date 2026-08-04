import { MICRO_UNIT } from '@/lib/constants'

const DEFAULT_LOCALE = 'en-US'
const DEFAULT_CURRENCY = 'USD'
let clientDisplayCurrency: 'USD' | 'KES' = 'USD'
let clientKesPerUsdc = 129.5

export function configureClientMoneyDisplay(currency: 'USD' | 'KES', kesPerUsdc: number) {
  clientDisplayCurrency = currency
  if (Number.isFinite(kesPerUsdc) && kesPerUsdc > 0) clientKesPerUsdc = kesPerUsdc
}

function getDisplayMoneyConfig() {
  if (typeof window === 'undefined' || /\/(?:[a-z]{2}\/)?admin(?:\/|$)/.test(window.location.pathname)) {
    return { currency: 'USD' as const, rate: 1 }
  }
  return { currency: clientDisplayCurrency, rate: clientDisplayCurrency === 'KES' ? clientKesPerUsdc : 1 }
}

const priceFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const sharesFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const usdFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: 'currency',
  currency: DEFAULT_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const SHARES_FORMATTER_CACHE = new Map<string, Intl.NumberFormat>([
  ['0-2', sharesFormatter],
])

const USD_FORMATTER_CACHE = new Map<string, Intl.NumberFormat>([
  ['2-2', usdFormatter],
])

function getSharesFormatter(min: number, max: number) {
  const key = `${min}-${max}`
  const cached = SHARES_FORMATTER_CACHE.get(key)
  if (cached) {
    return cached
  }

  const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
  SHARES_FORMATTER_CACHE.set(key, formatter)
  return formatter
}

interface SharesFormatOptions {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export function formatSharesLabel(value: number, options: SharesFormatOptions = {}) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }

  const minimumFractionDigits = options.minimumFractionDigits ?? 0
  const maximumFractionDigits = options.maximumFractionDigits ?? Math.max(2, minimumFractionDigits)
  const normalizedMaxDigits = Math.max(maximumFractionDigits, minimumFractionDigits)
  const scale = 10 ** Math.max(0, normalizedMaxDigits)
  const truncated = Math.floor(value * scale + 1e-8) / scale
  const formatter = getSharesFormatter(
    minimumFractionDigits,
    normalizedMaxDigits,
  )
  return formatter.format(Math.max(0, truncated))
}

export function formatCompactShares(value: number) {
  if (!Number.isFinite(value)) {
    return '0'
  }

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000) {
    const scaled = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${sign}${scaled}M`
  }

  if (abs >= 1_000) {
    const scaled = (abs / 1_000).toFixed(1).replace(/\.0$/, '')
    return `${sign}${scaled}k`
  }

  return `${sign}${formatSharesLabel(abs)}`
}

function getUsdFormatter(min: number, max: number) {
  const key = `${min}-${max}`
  const cached = USD_FORMATTER_CACHE.get(key)
  if (cached) {
    return cached
  }

  const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: DEFAULT_CURRENCY,
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
  USD_FORMATTER_CACHE.set(key, formatter)
  return formatter
}

interface CurrencyFormatOptions {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  includeSymbol?: boolean
}

interface DollarValueFormatOptions extends CurrencyFormatOptions {
  fallback?: string
}

export function formatCurrency(
  value: number | null | undefined,
  options: CurrencyFormatOptions = {},
) {
  const minimumFractionDigits = options.minimumFractionDigits ?? 2
  const maximumFractionDigits = options.maximumFractionDigits ?? minimumFractionDigits
  const includeSymbol = options.includeSymbol ?? true
  const formatter = getUsdFormatter(minimumFractionDigits, maximumFractionDigits)
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const display = getDisplayMoneyConfig()
  if (display.currency === 'KES') {
    const converted = Math.max(0, Math.round(safeValue * display.rate))
    const formatted = new Intl.NumberFormat('en-KE', {
      style: includeSymbol ? 'currency' : 'decimal',
      currency: includeSymbol ? 'KES' : undefined,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(converted)
    return includeSymbol ? formatted.replace('KES', 'Ksh') : formatted
  }

  if (includeSymbol) {
    return formatter.format(safeValue)
  }

  return formatter
    .formatToParts(safeValue)
    .filter(part => part.type !== 'currency')
    .map(part => part.value)
    .join('')
    .trim()
}

export function formatDollarValueLabel(
  value: number | string | null | undefined,
  options: DollarValueFormatOptions = {},
) {
  const fallback = options.fallback ?? '—'
  if (value === null || value === undefined) {
    return fallback
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  if (Math.abs(numeric) < 1) {
    if (getDisplayMoneyConfig().currency === 'KES') {
      return formatCurrency(numeric, { ...options, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    }
    const cents = toCents(Math.abs(numeric))
    if (cents === null) {
      return fallback
    }
    const prefix = numeric < 0 && cents > 0 ? '-' : ''
    return `${prefix}${priceFormatter.format(cents)}¢`
  }

  const digits = options.maximumFractionDigits ?? options.minimumFractionDigits ?? 2
  return formatCurrency(numeric, {
    minimumFractionDigits: options.minimumFractionDigits ?? digits,
    maximumFractionDigits: digits,
    includeSymbol: options.includeSymbol,
  })
}

interface PercentFormatOptions {
  digits?: number
  includeSymbol?: boolean
}

export function formatPercent(value: number, options: PercentFormatOptions = {}) {
  const digits = options.digits ?? 2
  const includeSymbol = options.includeSymbol ?? true
  const safeValue = Number.isFinite(value) ? value : 0
  const formatted = safeValue.toFixed(digits)
  return includeSymbol ? `${formatted}%` : formatted
}

export function formatVolume(volume: number, liquidity: number = 0): string {
  const DEFAULT_INITIAL_LIQUIDITY_USD = 2
  const safeVolume = Number.isFinite(volume) && volume > 0 ? volume : 0
  const safeLiquidity = Number.isFinite(liquidity) && liquidity > 0 ? liquidity : DEFAULT_INITIAL_LIQUIDITY_USD
  const totalDisplay = safeVolume + safeLiquidity

  if (getDisplayMoneyConfig().currency === 'KES') return formatCompactCurrency(totalDisplay)

  if (totalDisplay >= 1_000_000_000) {
    return `$${(totalDisplay / 1_000_000_000).toFixed(1)}B`
  }
  if (totalDisplay >= MICRO_UNIT) {
    return `$${(totalDisplay / MICRO_UNIT).toFixed(1)}M`
  }
  if (totalDisplay >= 1_000) {
    return `$${(totalDisplay / 1_000).toFixed(0)}k`
  }
  return `$${totalDisplay.toFixed(0)}`
}

const COMPACT_THRESHOLD = 100_000
const COMPACT_MILLION = 1_000_000
const COMPACT_BILLION = 1_000_000_000

export function formatCompactCount(value: number) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  const abs = Math.abs(value)
  if (abs >= COMPACT_BILLION) {
    const compact = (abs / COMPACT_BILLION).toFixed(1).replace(/\.0$/, '')
    return `${value < 0 ? '-' : ''}${compact}B`
  }
  if (abs >= COMPACT_MILLION) {
    const compact = (abs / COMPACT_MILLION).toFixed(1).replace(/\.0$/, '')
    return `${value < 0 ? '-' : ''}${compact}M`
  }
  if (abs >= COMPACT_THRESHOLD) {
    const compact = Math.round(abs / 1_000).toLocaleString(DEFAULT_LOCALE)
    return `${value < 0 ? '-' : ''}${compact}k`
  }

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCompactCurrency(value: number) {
  if (!Number.isFinite(value)) {
    return '—'
  }

  const display = getDisplayMoneyConfig()
  const safeValue = value <= 0 ? 2 : value
  const convertedValue = display.currency === 'KES' ? Math.floor(safeValue * display.rate) : safeValue
  const abs = Math.abs(convertedValue)
  const symbol = display.currency === 'KES' ? 'Ksh ' : '$'
  const sign = convertedValue < 0 ? '-' : ''

  if (abs >= 1_000_000_000) {
    const compact = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')
    return `${sign}${symbol}${compact}B`
  }
  if (abs >= 1_000_000) {
    const compact = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${sign}${symbol}${compact}M`
  }
  if (abs >= 1_000) {
    const compact = (abs / 1_000).toFixed(1).replace(/\.0$/, '')
    return `${sign}${symbol}${compact}k`
  }

  return formatCurrency(safeValue)
}

export function formatDate(dateInput: Date | number): string {
  const date = typeof dateInput === 'number' ? new Date(dateInput) : dateInput

  return date.toLocaleDateString(DEFAULT_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function normalizeDateString(value: string) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2} /.test(trimmed)) {
    return trimmed.replace(' ', 'T')
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}Z`
  }
  return trimmed
}

export function formatTimeAgo(dateInput: string | number | Date) {
  let date: Date

  if (dateInput instanceof Date) {
    date = dateInput
  }
  else if (typeof dateInput === 'number') {
    date = new Date(dateInput)
  }
  else {
    const normalized = normalizeDateString(dateInput)
    date = new Date(normalized)
    if (Number.isNaN(date.getTime())) {
      const numeric = Number(dateInput)
      if (Number.isFinite(numeric)) {
        date = new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      }
    }
  }

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  const now = new Date()
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))

  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`
  }

  if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)}m ago`
  }

  if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)}h ago`
  }

  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

export function truncateAddress(address: string) {
  if (!address) {
    return ''
  }
  return `${address.slice(0, 4)}…${address.slice(-6)}`
}

interface CentsFormatOptions {
  fallback?: string
}

export function formatCentsLabel(
  value: number | string | null | undefined,
  options: CentsFormatOptions = {},
) {
  const fallback = options.fallback ?? '—'
  if (value === null || value === undefined) {
    return fallback
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  if (getDisplayMoneyConfig().currency === 'KES') {
    const dollarValue = numeric <= 1 ? numeric : numeric / 100
    return formatCurrency(dollarValue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  if (numeric <= 1) {
    const cents = toCents(numeric)
    return cents === null ? fallback : `${priceFormatter.format(cents)}¢`
  }

  const cents = Number(numeric.toFixed(1))
  return `${priceFormatter.format(cents)}¢`
}

export function formatCentsValueLabel(
  value: number | string | null | undefined,
  options: CentsFormatOptions = {},
) {
  const fallback = options.fallback ?? '—'
  if (value === null || value === undefined) {
    return fallback
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  const cents = Math.max(0, Number(numeric.toFixed(1)))
  if (getDisplayMoneyConfig().currency === 'KES') {
    return formatCurrency(cents / 100, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  return `${priceFormatter.format(cents)}¢`
}

interface SharePriceFormatOptions extends CentsFormatOptions {
  currencyDigits?: number
}

export function formatSharePriceLabel(
  value: number | string | null | undefined,
  options: SharePriceFormatOptions = {},
) {
  const fallback = options.fallback ?? '50.0¢'

  if (value === null || value === undefined) {
    return fallback
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  const normalizedPrice = Math.max(0, numeric)

  if (normalizedPrice < 1) {
    return formatDollarValueLabel(normalizedPrice, { fallback })
  }

  const digits = options.currencyDigits ?? 2
  return formatCurrency(normalizedPrice, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function toCents(value?: string | number | null) {
  if (value === null || value === undefined) {
    return null
  }

  const numeric = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numeric)) {
    return null
  }

  const normalized = Math.min(Math.max(numeric, 0), 1)
  return Number((normalized * 100).toFixed(1))
}

export function toMicro(amount: string | number): string {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) {
    return '0'
  }
  return Math.round(numeric * MICRO_UNIT).toString()
}

export function fromMicro(amount: string | number, precision: number = 1): string {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) {
    return (0).toFixed(precision)
  }
  return (numeric / MICRO_UNIT).toFixed(precision)
}

interface AmountInputFormatOptions {
  roundingMode?: 'round' | 'floor'
}

export function formatAmountInputValue(value: number, options: AmountInputFormatOptions = {}): string {
  if (!Number.isFinite(value)) {
    return ''
  }

  const display = getDisplayMoneyConfig()
  if (display.currency === 'KES') {
    const kesValue = Math.round(value)
    return kesValue <= 0 ? '' : kesValue.toString()
  }

  const roundingMode = options.roundingMode ?? 'round'
  const scaled = value * 100
  const roundedScaled = roundingMode === 'floor'
    ? Math.floor(scaled + 1e-8)
    : Math.round(scaled)
  const normalized = Math.max(0, roundedScaled / 100)
  if (normalized === 0) {
    return ''
  }

  if (Number.isInteger(normalized)) {
    return Math.trunc(normalized).toString()
  }

  return normalized.toFixed(2)
}
