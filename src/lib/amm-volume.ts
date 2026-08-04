import type { Event } from '@/types'
import { eq } from 'drizzle-orm'
import { markets } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { loadMarketVolumeReport } from '@/lib/slimefish-backend-reporting'
import { readCachedLiveSnapshots } from '@/lib/amm-live'

type AmmVolumeRow = { marketId: string, volume: string, volume24h: string }

async function loadAmmVolumes(marketIds: string[]) {
  const uniqueIds = [...new Set(marketIds.map(id => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) return new Map<string, { volume: number, volume24h: number }>()

  const rows = await loadMarketVolumeReport<AmmVolumeRow[]>(uniqueIds)

  return new Map(rows.map(row => [row.marketId, {
    volume: Number(row.volume) || 0,
    volume24h: Number(row.volume24h) || 0,
  }]))
}

export async function synchronizeAmmMarketVolumes(marketIds: string[]) {
  const volumeByMarketId = await loadAmmVolumes(marketIds)
  await Promise.all([...volumeByMarketId].map(([marketId, values]) => db
    .update(markets)
    .set({ volume: values.volume.toFixed(6), volume_24h: values.volume24h.toFixed(6), updated_at: new Date() })
    .where(eq(markets.condition_id, marketId))))
  return volumeByMarketId
}

export async function hydrateEventsWithAmmVolumes(events: Event[]): Promise<Event[]> {
  if (events.length === 0) return events
  try {
    const snapshots = await readCachedLiveSnapshots(
      events.flatMap(event => event.markets.map(market => market.condition_id)),
    )
    const volumeByMarketId = new Map(snapshots.map(snapshot => [snapshot.marketId, {
      volume: snapshot.volume,
      volume24h: snapshot.volume24h,
    }]))
    return events.map((event) => {
      const nextMarkets = event.markets.map((market) => {
        const volume = volumeByMarketId.get(market.condition_id)
        return volume ? { ...market, volume: volume.volume, volume_24h: volume.volume24h } : market
      })
      return { ...event, markets: nextMarkets, volume: nextMarkets.reduce((sum, market) => sum + (Number(market.volume) || 0), 0) }
    })
  }
  catch (error) {
    console.error('Failed to synchronize AMM market volume', error)
    return events
  }
}
