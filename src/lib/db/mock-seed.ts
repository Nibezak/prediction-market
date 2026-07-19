import { count } from 'drizzle-orm'
import {
  conditions,
  event_tags,
  events,
  markets,
  outcomes,
  sports_menu_items,
  tags,
} from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'

function generateMockUlid(): string {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let result = '01'
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function seedMockData() {
  try {
    // Check if events are already seeded
    const eventCount = await db.select({ value: count() }).from(events)
    if (eventCount[0].value > 0) {
      // Already seeded
      return
    }

    console.log('[MOCK SEED] Starting database seeding for Mock Mode...')

    // 1. Seed Tags / Categories (use onConflictDoNothing in case they already exist from migrations)
    await db.insert(tags).values([
      { name: 'Crypto', slug: 'crypto', is_main_category: true, is_hidden: false, display_order: 1 },
      { name: 'Sports', slug: 'sports', is_main_category: true, is_hidden: false, display_order: 2 },
      { name: 'Nasdaq', slug: 'nasdaq', is_main_category: true, is_hidden: false, display_order: 3 },
      { name: 'Pop Culture', slug: 'pop-culture', is_main_category: true, is_hidden: false, display_order: 4 },
    ]).onConflictDoNothing()

    // Query existing tags to get their IDs
    const allTags = await db.select().from(tags)
    const cryptoTag = allTags.find(t => t.slug === 'crypto')
    const sportsTag = allTags.find(t => t.slug === 'sports')
    const nasdaqTag = allTags.find(t => t.slug === 'nasdaq')
    const popCultureTag = allTags.find(t => t.slug === 'pop-culture')

    // 2. Mock Events Setup Data
    const mockEventsData = [
      {
        title: 'Will Bitcoin reach $150k in 2026?',
        slug: 'will-bitcoin-reach-150k-in-2026',
        rules: 'Bitcoin price must reach $150,000.00 or more on CoinGecko at any point on or before December 31, 2026.',
        tagId: cryptoTag?.id,
        conditionId: '0xmockconditionidbitcoin111111111111111111111111111111111111',
        tokenYes: '1000000000000000000000000000000000000000000000000000000000000001',
        tokenNo: '1000000000000000000000000000000000000000000000000000000000000002',
        volume: '450250.000000',
      },
      {
        title: 'Will Ethereum transition completely to a new execution layer in 2026?',
        slug: 'will-ethereum-transition-new-layer-2026',
        rules: 'Ethereum developers must officially merge a new execution layer to Ethereum mainnet by December 31, 2026.',
        tagId: cryptoTag?.id,
        conditionId: '0xmockconditionideth1111111111111111111111111111111111111111',
        tokenYes: '2000000000000000000000000000000000000000000000000000000000000001',
        tokenNo: '2000000000000000000000000000000000000000000000000000000000000002',
        volume: '124000.000000',
      },
      {
        title: 'Will the Lakers win the NBA Championship?',
        slug: 'will-lakers-win-nba-championship',
        rules: 'Los Angeles Lakers must win the next NBA finals.',
        tagId: sportsTag?.id,
        conditionId: '0xmockconditionidlakers1111111111111111111111111111111111111',
        tokenYes: '3000000000000000000000000000000000000000000000000000000000000001',
        tokenNo: '3000000000000000000000000000000000000000000000000000000000000002',
        volume: '95800.000000',
      },
      {
        title: 'Will Apple announce a folding iPhone?',
        slug: 'will-apple-announce-folding-iphone',
        rules: 'Apple must announce a commercial foldable iPhone at an official event in 2026.',
        tagId: nasdaqTag?.id,
        conditionId: '0xmockconditionidapple1111111111111111111111111111111111111',
        tokenYes: '4000000000000000000000000000000000000000000000000000000000000001',
        tokenNo: '4000000000000000000000000000000000000000000000000000000000000002',
        volume: '23500.000000',
      },
      {
        title: 'Will a movie win over 8 Oscars?',
        slug: 'will-a-movie-win-over-8-oscars',
        rules: 'A single film must win 9 or more Oscar categories at the next Academy Awards.',
        tagId: popCultureTag?.id,
        conditionId: '0xmockconditionidoscars111111111111111111111111111111111111',
        tokenYes: '5000000000000000000000000000000000000000000000000000000000000001',
        tokenNo: '5000000000000000000000000000000000000000000000000000000000000002',
        volume: '56200.000000',
      },
    ]

    for (const item of mockEventsData) {
      const eventId = generateMockUlid()

      // Insert Condition
      await db.insert(conditions).values({
        id: item.conditionId,
        oracle: '0x0000000000000000000000000000000000000000',
        question_id: `q-${eventId}`,
        resolved: false,
      })

      // Insert Event
      await db.insert(events).values({
        id: eventId,
        slug: item.slug,
        title: item.title,
        creator: '0x1234567890123456789012345678901234567890',
        is_hidden: false,
        rules: item.rules,
        status: 'active',
        active_markets_count: 1,
        total_markets_count: 1,
        start_date: new Date(),
        end_date: new Date(Date.now() + 180 * 24 * 3600 * 1000), // 6 months from now
      })

      // Link Tag
      if (item.tagId) {
        await db.insert(event_tags).values({
          event_id: eventId,
          tag_id: item.tagId,
        })
      }

      // Insert Market
      await db.insert(markets).values({
        condition_id: item.conditionId,
        event_id: eventId,
        title: item.title,
        slug: item.slug,
        question: item.title,
        market_rules: item.rules,
        is_active: true,
        is_resolved: false,
        volume: item.volume,
        end_time: new Date(Date.now() + 180 * 24 * 3600 * 1000),
      })

      // Insert Outcomes
      await db.insert(outcomes).values([
        {
          condition_id: item.conditionId,
          outcome_text: 'Yes',
          outcome_index: 0,
          token_id: item.tokenYes,
          is_winning_outcome: false,
          payout_value: '0',
        },
        {
          condition_id: item.conditionId,
          outcome_text: 'No',
          outcome_index: 1,
          token_id: item.tokenNo,
          is_winning_outcome: false,
          payout_value: '0',
        },
      ])
    }

    // 3. Seed Sports Menu Items
    await db.insert(sports_menu_items).values([
      {
        id: 'sports-group',
        item_type: 'group',
        label: 'Basketball',
        href: '/sports/basketball',
        menu_slug: 'basketball',
        h1_title: 'Basketball Prediction Markets',
        sort_order: 1,
        enabled: true,
      },
      {
        id: 'esports-group',
        item_type: 'group',
        label: 'Soccer',
        href: '/sports/soccer',
        menu_slug: 'soccer',
        h1_title: 'Soccer Prediction Markets',
        sort_order: 2,
        enabled: true,
      },
    ]).onConflictDoNothing()

    console.log('[MOCK SEED] Successfully seeded mock data into the local database.')
  }
  catch (error) {
    console.error('[MOCK SEED] Error seeding mock data:', error)
  }
}
