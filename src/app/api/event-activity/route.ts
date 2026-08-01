import { NextResponse } from 'next/server'
import { loadEventActivities } from '@/lib/event-activity'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const market = searchParams.get('market')
  
  if (!market) {
    return NextResponse.json({ error: 'Missing market parameter.' }, { status: 400 })
  }

  try {
    const marketIds = market.split(',').map(id => id.trim()).filter(Boolean)
    const activities = await loadEventActivities(marketIds, request.signal)
    return NextResponse.json(activities, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Failed to load event activity', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
