import type { ActivityOrder } from '@/types'
import { NextResponse } from 'next/server'
import { EVENT_ACTIVITY_PAGE_SIZE } from '@/lib/data-api/trades'
import { getPublicAssetUrl } from '@/lib/storage'
import { MICRO_UNIT } from '@/lib/constants'

function normalizeAvatarUrl(image: string | null | undefined) {
  if (!image) return ''
  if (image.startsWith('http')) return image
  return getPublicAssetUrl(image)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const market = searchParams.get('market')
  
  if (!market) {
    return NextResponse.json({ error: 'Missing market parameter.' }, { status: 400 })
  }

  const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

  try {
    const marketIds = market.split(',').map(id => id.trim()).filter(Boolean)
    const responses = await Promise.all(marketIds.map(async (marketId) => {
      const response = await fetch(`${AMM_BASE_URL}/markets/${marketId}/activity`)
      if (!response.ok) return []
      const payload = await response.json()
      return Array.isArray(payload.data) ? payload.data : []
    }))
    const data = responses.flat()

    const activities: ActivityOrder[] = []

    for (const activity of data) {
      if (activity.type === 'TRADE_TRANSACTION' && activity.transactions) {
        for (const tx of activity.transactions) {
          const isBuy = tx.type === 'TRADE_BUY'
          const initiator = tx.initiator || {}
          
          let amount = '0'
          let totalValue = 0

          // Calculate amount and value from entries
          if (tx.entries) {
            const optionEntries = tx.entries.filter((entry: any) =>
              entry.assetType === 'MARKET_OPTION'
              && (!activity.option?.id || entry.assetId === activity.option.id))
            const optionEntry = optionEntries.sort((left: any, right: any) =>
              Math.abs(parseFloat(right.amount)) - Math.abs(parseFloat(left.amount)))[0]
            const primaryEntry = tx.entries.find((e: any) => e.assetType === 'CURRENCY' && e.assetId === 'PRIMARY')
            
            if (optionEntry) {
              amount = Math.abs(parseFloat(optionEntry.amount)).toString()
            }
            if (primaryEntry) {
              totalValue = Math.abs(parseFloat(primaryEntry.amount))
            }
          }

          const price = parseFloat(amount) > 0 ? totalValue / parseFloat(amount) : 0
          const optionName = String(activity.option?.name || 'Outcome')
          const outcomeIndex = optionName.trim().toLowerCase() === 'no' ? 1 : 0

          activities.push({
            id: tx.id,
            type: isBuy ? 'buy' : 'sell',
            user: {
              id: initiator.id || 'unknown',
              username: initiator.username || initiator.displayName || 'trader',
              address: initiator.id || 'unknown',
              image: normalizeAvatarUrl(initiator.avatarUrl),
              created_at: initiator.createdAt,
            },
            side: isBuy ? 'buy' : 'sell',
            amount: Math.round(parseFloat(amount) * MICRO_UNIT).toString(),
            price: price.toString(),
            outcome: {
              index: outcomeIndex,
              text: optionName,
            },
            market: {
              condition_id: tx.marketId,
              title: tx.market?.question || 'Market',
              slug: tx.market?.slug || tx.marketId,
              icon_url: '',
            },
            total_value: Math.round(totalValue * MICRO_UNIT),
            created_at: tx.createdAt,
            status: 'completed',
            tx_hash: tx.id,
          })
        }
      }
    }

    return NextResponse.json(activities)
  } catch (error) {
    console.error('Failed to load event activity', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
