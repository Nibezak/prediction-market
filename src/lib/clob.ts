import { defaultPublicRuntimeConfig, normalizePublicRuntimeEnvValue } from '@/lib/public-runtime-config.shared'

const MAX_LIMIT_PRICE = 99.9
const PRICE_EPSILON = 1e-8

interface OrderbookLevelSummary {
  price?: string
  size?: string
}

interface OrderBookSummaryResponse {
  bids?: OrderbookLevelSummary[]
  asks?: OrderbookLevelSummary[]
}

export function resolveClobUrl(value?: string) {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true') {
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
    return `${siteUrl}/api/tellwise-clob`
  }
  return normalizePublicRuntimeEnvValue(value, defaultPublicRuntimeConfig.clobUrl)
}

export async function fetchClobJson<T>(path: string, body: unknown, clobUrl = resolveClobUrl()): Promise<T> {
  if (path === '/books') { return [] as unknown as T }
  if (path === '/last-trades-prices') { return [] as unknown as T }
  return {} as unknown as T
}

export async function fetchOrderBookSummary(tokenId: string, clobUrl = resolveClobUrl()): Promise<OrderBookSummaryResponse> {
  return { bids: [], asks: [] }
}

export function getRoundedCents(rawPrice: number, side: 'ask' | 'bid') {
  const cents = rawPrice * 100
  if (!Number.isFinite(cents)) {
    return 0
  }

  const scaled = cents * 10
  const roundedScaled = side === 'bid'
    ? Math.floor(scaled + PRICE_EPSILON)
    : Math.ceil(scaled - PRICE_EPSILON)

  const normalized = Math.max(0, Math.min(roundedScaled / 10, MAX_LIMIT_PRICE))
  return Number(normalized.toFixed(1))
}
