/* eslint-disable style/max-statements-per-line */
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { sanctions_screenings, users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { setAutomatedRiskHold } from './account-restrictions'

interface WatchRecord { id: string, names: string[], countries?: string[] }

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[^a-z0-9 ]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function watchlist(): WatchRecord[] {
  try {
    const parsed = JSON.parse(process.env.SANCTIONS_WATCHLIST_JSON || '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string' && Array.isArray(item.names)) : []
  }
  catch { return [] }
}

export async function screenUserForSanctions(userId: string) {
  const [user] = await db.select({ email: users.email, username: users.username, settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) { throw new Error('User not found for sanctions screening') }
  const legalName = typeof user.settings?.legal_name === 'string' ? user.settings.legal_name : ''
  const candidates = [legalName, user.username || '', user.email.split('@')[0] || ''].map(normalize).filter(Boolean)
  const list = watchlist()
  const matches = list.filter(record => record.names.some(name => candidates.includes(normalize(name))))
  const status = list.length === 0 ? 'not_configured' : matches.length ? 'possible_match' : 'clear'
  const queryHash = createHash('sha256').update(JSON.stringify(candidates)).digest('hex')
  const [screening] = await db.insert(sanctions_screenings).values({
    user_id: userId,
    status,
    provider: list.length ? 'configured_watchlist' : 'manual',
    query_hash: queryHash,
    match_score: matches.length ? 100 : 0,
    matched_records: matches.map(({ id, countries }) => ({ id, countries: countries || [] })),
    expires_at: new Date(Date.now() + (status === 'clear' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)),
  }).returning()
  if (status === 'possible_match') { await setAutomatedRiskHold(userId, true) }
  return screening
}
