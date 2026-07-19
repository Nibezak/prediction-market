import { NextResponse } from 'next/server'
import postgres from 'postgres'

// Initialize the database client on demand or globally in a production app.
// Since PlayMoney runs on the same instance, we connect locally.
let pmSql: postgres.Sql | null = null
function getSql() {
  if (!pmSql) {
    pmSql = postgres('postgresql://postgres:postgres@localhost:5434/playmoney', {
      idle_timeout: 10,
      max_lifetime: 60,
      max: 5,
    })
  }
  return pmSql
}

export async function POST(req: Request) {
  try {
    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch (e) {
      // Ignore JSON parse errors for empty/invalid bodies
    }
    const marketIds: string[] = body.markets || []

    if (!marketIds.length) {
      return NextResponse.json({ history: {} })
    }

    const sql = getSql()

    // We fetch the probability for all requested options
    const marketOptions = await sql`
      SELECT id, probability FROM "MarketOption"
      WHERE id = ANY(${marketIds})
    `

    const history: Record<string, Array<{ t: number, p: number }>> = {}
    const now = Date.now()

    for (const opt of marketOptions) {
      const prob = (opt.probability || 0) / 100

      // Since we don't have historical data in the dummy PlayMoney DB matching this exact API structure,
      // we generate a smooth mock curve leading up to the current probability.
      // This satisfies the UI's need for a chart curve while displaying the accurate current probability.

      const p1 = Math.max(0, prob - 0.05)
      const p2 = Math.min(1, prob + 0.02)

      history[opt.id] = [
        { t: now - 86400000, p: p1 }, // 1 day ago
        { t: now - 43200000, p: p2 }, // 12 hours ago
        { t: now - 3600000, p: p1 }, // 1 hour ago
        { t: now - 1800000, p: p2 }, // 30 min ago
        { t: now, p: prob }, // Current actual probability
      ]
    }

    return NextResponse.json({ history })
  }
  catch (error) {
    console.error('Failed to fetch playmoney stats', error)
    return NextResponse.json({ history: {} })
  }
}
